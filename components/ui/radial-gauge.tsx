"use client"

import { useEffect, useRef, useState } from "react"
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react"

import { LiveFigure } from "@/components/ui/live-figure"
import { cn } from "@/lib/utils"

/* Radial Gauge, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: a pass rate against the bands it is judged by. 412 of 480 eval cases.
   Read first: the percent in the middle; the count it came from reads when the dial is pointed at.
   The pointer: pointing at a band, on the thin outer scale or in the list under the dial,
   brings it to full strength, dims the others and reads that band's range above the dial, in
   percent and in whole checks.
   Sketch: lab/RadialGauge. Kept: the 270 degree dial open at the bottom, the draw from
   the left shoulder, percent over count, the three bands.
   Changed: the ring is a filled shape 7px deep, not an 8px stroke; the card, its header
   band and inner shadow are gone; the arc is ink and only the band name carries colour
   (green for the top band, red for the bottom one, the middle one is ink; amber is gone);
   the bands are drawn on the dial as a scale, so the thresholds can be seen, not only
   listed; the legend is sentence case.
   Formulas:
   · percent = value ÷ max, rounded                          412 ÷ 480 = 86%
   · sweep of the arc = 270° × value ÷ max
   · a band holds from its own start up to the next band's start
   · first whole count of a band = ceil(start% × max)        ceil(0.85 × 480) = 408
   · last whole count of a band = the next band's first − 1, or max for the top band
   Colour given back (2026-09-30): landing in a band is a threshold crossed, so the arc
   takes the tone of the band it reached (green in pass, red in fail, ink where the band
   has no tone), and each band of the scale and its key carry their own tone, strongest for
   the band reached. Pointing at a band brings it to full strength in its own colour.
   Motion (2026-10-01): the arc sweeps from the left shoulder to the share once the dial is a
   third in view (900ms); a new value sweeps on from where the arc stands (400ms); reduced
   motion draws the arc at its share at once.
   2026-10-02 audit: his question was whether the checks under 72% are needed; they are not
   at rest, so the count left the dial and reads in the line above it while the dial is
   pointed at or focused ("18 of 25 checks"). At rest that line is blank (an nbsp holds its
   height), since the key already marks the band reached; a pointed band reads "Pass, 70%
   and over, 18 to 25 checks" with commas, not dot separators. The box is 240 wide, the Gauge
   family's width (it was 320 round a 180px dial). The key is legend items: 11px, 12px apart,
   the names at /60 and the band reached at /90. The line swaps through LiveFigure.
   2026-10-02 round 2: the sample is an LLM eval pass rate in place of generic checks: 412
   of 480 test cases (86%), judged by Fail under 70%, Watch from 70% and Pass from 85%, so
   the bands read 0 to 335, 336 to 407 and 408 to 480 cases. The noun is "cases" so the
   pointed band's line fits the 240 box on one line. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`

export interface GaugeBand {
  name: string
  /** where the band starts, in percent; it runs to the start of the next one */
  from: number
  /** what landing here means: green, red or no colour */
  tone?: "up" | "down" | "none"
}

export interface RadialGaugeProps {
  value?: number
  max?: number
  label?: string
  /** what is being counted, written after the numbers */
  noun?: string
  /** lowest first */
  bands?: GaugeBand[]
  className?: string
}

const DEFAULT_BANDS: GaugeBand[] = [
  { name: "Fail", from: 0, tone: "down" },
  { name: "Watch", from: 70, tone: "none" },
  { name: "Pass", from: 85, tone: "up" },
]

const SIZE = 180
const MID = SIZE / 2
const H = 150
const SWEEP = 270
const START = 135
const R_OUT = 66
const R_IN = 59
const CAP = (R_OUT - R_IN) / 2

const at = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180
  return `${(MID + r * Math.cos(a)).toFixed(2)} ${(MID + r * Math.sin(a)).toFixed(2)}`
}

/** a band of the ring as a closed shape, `from` to `to` degrees of sweep, round at both ends */
function ring(from: number, to: number, rOut: number, rIn: number, cap: number) {
  const a = START + from
  const b = START + Math.max(from + 0.01, to)
  const large = b - a > 180 ? 1 : 0
  return `M ${at(a, rOut)} A ${rOut} ${rOut} 0 ${large} 1 ${at(b, rOut)} A ${cap} ${cap} 0 0 1 ${at(b, rIn)} A ${rIn} ${rIn} 0 ${large} 0 ${at(a, rIn)} A ${cap} ${cap} 0 0 1 ${at(a, rOut)} Z`
}

/** a band's range in words: "40 to 69%", "70% and over" */
const span = (b: { from: number; to: number }) => (b.to >= 100 ? `${b.from}% and over` : `${b.from} to ${b.to - 1}%`)

const toneOf = (t: GaugeBand["tone"]) => (t === "up" ? GREEN : t === "down" ? RED : ink(90))
/** a band's mark at a strength: its own hue mixed toward nothing, ink for a band with no tone */
const markOf = (t: GaugeBand["tone"], pct: number) =>
  t === "up" || t === "down" ? `color-mix(in srgb, ${toneOf(t)} ${pct}%, transparent)` : ink(Math.round(pct * 0.6))

/**
 * A dial for a rate: the arc draws on from the left shoulder to the share reached, over a
 * thin scale of the bands it is judged by. Pointing at a band reads its range.
 */
export function RadialGauge({
  value = 412,
  max = 480,
  label = "Eval pass rate",
  noun = "cases",
  bands = DEFAULT_BANDS,
  className,
}: RadialGaugeProps) {
  const reduced = useReducedMotion()
  /** a band of the scale by index, or the dial itself, which reads the count */
  const [hot, setHot] = useState<number | "dial" | null>(null)

  const share = Math.min(1, Math.max(0, value / Math.max(1, max)))
  const pct = Math.round(share * 100)

  const dialRef = useRef<HTMLDivElement>(null)
  /* the sweep waits until the dial is a third in view, then plays once */
  const inView = useInView(dialRef, { once: true, amount: 0.3 })
  /** the first sweep is the entrance; later ones follow a new value */
  const swept = useRef(false)
  const drawn = useMotionValue(reduced ? share : 0)
  const d = useTransform(drawn, (v) => ring(0, SWEEP * v, R_OUT, R_IN, CAP))
  useEffect(() => {
    if (reduced) {
      drawn.set(share)
      return
    }
    if (!inView) return
    const run = animate(drawn, share, {
      duration: swept.current ? 0.4 : 0.9,
      ease: EASE,
      onComplete: () => {
        swept.current = true
      },
    })
    return () => run.stop()
  }, [drawn, share, reduced, inView])

  const sorted = [...bands].sort((a, b) => a.from - b.from)
  const ranges = sorted.map((b, i) => {
    const to = sorted[i + 1]?.from ?? 100
    const first = Math.ceil((b.from / 100) * max)
    const last = i === sorted.length - 1 ? max : Math.ceil((to / 100) * max) - 1
    return { ...b, to, first, last }
  })
  /* the band the value has landed in: the last one whose start it has reached */
  const mine = ranges.reduce((k, b, i) => (share * 100 >= b.from ? i : k), 0)
  const shown = typeof hot === "number" ? ranges[hot] : null

  return (
    <div role="group" aria-label={label} className={cn("flex w-[240px] max-w-full flex-col items-center tabular-nums", className)}>
      {/* no visible title (2026-10-01); blank at rest (2026-10-02), it reads what is pointed at */}
      <div className="flex w-full items-baseline justify-center">
        <div role="status" className="whitespace-nowrap text-[11px] text-foreground/60">
          <LiveFigure intent={hot}>
            {shown ? (
              <>
                <span className="font-medium text-foreground/90">{shown.name}</span>, {span(shown)}, {shown.first} to {shown.last} {noun}
              </>
            ) : hot === "dial" ? (
              <>
                <span className="font-medium text-foreground/90">{value}</span> of {max} {noun}
              </>
            ) : (
              "\u00a0"
            )}
          </LiveFigure>
        </div>
      </div>

      <div ref={dialRef} className="relative mt-3" style={{ width: SIZE, height: H }}>
        <svg
          width={SIZE}
          height={H}
          viewBox={`0 0 ${SIZE} ${H}`}
          role="img"
          aria-label={`${label}: ${pct} percent, ${value} of ${max} ${noun}, ${ranges[mine]?.name ?? ""}`}
          onPointerLeave={() => setHot(null)}
        >
          {/* the ring and the arc read the count when pointed at */}
          <path d={ring(0, SWEEP, R_OUT, R_IN, CAP)} fill={ink(8)} onPointerEnter={() => setHot("dial")} />
          <motion.path d={d} fill={markOf(ranges[mine]?.tone, 100)} style={{ transition: reduced ? "none" : "fill 160ms" }} onPointerEnter={() => setHot("dial")} />
          {/* no outer zone scale (his call, 2026-10-02: "remove the outer outline"); the key under
              the dial names the zones and pointing at one still lights its range above */}
        </svg>

        {/* the middle of the dial is a real button, so focus and a tap read the count like the pointer does */}
        <button
          type="button"
          aria-label={`${pct}%, ${value} of ${max} ${noun}`}
          onPointerEnter={() => setHot("dial")}
          onPointerLeave={() => setHot(null)}
          onFocus={() => setHot("dial")}
          onBlur={() => setHot(null)}
          onClick={() => setHot("dial")}
          className="absolute rounded-full outline-none"
          style={{ left: MID - R_IN, top: MID - R_IN, width: R_IN * 2, height: R_IN * 2 }}
        />
        <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center" style={{ top: MID - 13 }}>
          <span className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">{pct}%</span>
        </div>
      </div>

      <div className="-mt-1 flex items-center gap-3" onPointerLeave={() => setHot(null)}>
        {ranges.map((b, i) => (
          <button
            key={b.name}
            type="button"
            aria-label={`${b.name}: ${span(b)}, ${b.first} to ${b.last} ${noun}${i === mine ? ", the band reached" : ""}`}
            onPointerEnter={() => setHot(i)}
            onFocus={() => setHot(i)}
            onBlur={() => setHot(null)}
            className={cn(
              "-mx-1.5 flex h-6 items-center gap-1.5 rounded-full px-1.5 text-[11px] outline-none transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.08]",
              typeof hot === "number" && hot !== i && "opacity-40",
            )}
          >
            <span
              aria-hidden
              className="h-[2px] w-2.5 rounded-full"
              style={{ background: markOf(b.tone, hot === i ? 100 : i === mine ? 70 : 35), transition: reduced ? "none" : "background-color 160ms" }}
            />
            {/* the key is the band names only (2026-10-01): the ranges wrapped at this width; they stay in the
                aria-label and in the readout above the dial when a band is pointed at */}
            <span className={i === mine ? "font-medium text-foreground/90" : "text-foreground/60"}>{b.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
