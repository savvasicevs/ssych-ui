"use client"

import { useEffect, useRef, useState } from "react"
import { animate, motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Health Gauge, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the track and the value arc are filled shapes with round ends, 8px deep. They were
     10px strokes; the arc now grows with the number instead of drawing a dash
   · red below 40, amber for "Caution" from 40 to 70, green from 70: the band says which
     state the score is in (amber given back 2026-09-30, it is the warning state)
   · the end marker is a small filled dot cut out of the arc, not a 2.5px ring
   · the metric dots are ink, one strength for the chosen one and one for the rest, with
     no ring around them. Pointing at a dot reads that metric and its score in the line
     above before you press
   · every figure is tabular; the sweep takes 0.4s (it was 1.1s), the line under the dial
     swaps in place when it changes
   Motion (2026-10-01): the first sweep from 0 waits until the dial is in view (it ran on
   mount, off screen too) and takes 0.8s with the count; switching metric still sweeps
   from the old mark to the new one in 0.4s */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const AMBER = "var(--chart-amber)"

export interface HealthMetric {
  /** 0–100, the position on the dial */
  value: number
  label: string
  /** the quiet line under the label */
  sub: string
}

export interface HealthGaugeProps {
  /** one dial per metric; clicking the dial cycles them */
  metrics?: HealthMetric[]
  className?: string
}

const DEFAULT_METRICS: HealthMetric[] = [
  { value: 74, label: "Account health", sub: "margin ratio" },
  { value: 38, label: "Fear & Greed", sub: "market sentiment" },
  { value: 61, label: "Liquidity", sub: "depth score" },
]

const SPAN = 270
const START = -135

/* The 270° sweep bottoms out at ±R·sin45°, so the box is sized (and CY nudged up) to
   clear the round ends and the 0 and 100 ticks. */
const VB_W = 220
const VB_H = 176
const CX = VB_W / 2
const CY = 94
/** the ring's centre line, and how deep the band is */
const R = 84
const DEPTH = 8
const R_OUT = R + DEPTH / 2
const R_IN = R - DEPTH / 2
const CAP = DEPTH / 2

function polar(deg: number, r = R) {
  const a = ((deg - 90) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const
}
const pt = (deg: number, r: number) => {
  const [x, y] = polar(deg, r)
  return `${x.toFixed(2)} ${y.toFixed(2)}`
}

/** a band of the ring from `from` to `to` degrees as one closed shape, both ends round */
function band(from: number, to: number) {
  const b = Math.max(from, to)
  const large = b - from > 180 ? 1 : 0
  return [
    `M ${pt(from, R_OUT)}`,
    `A ${R_OUT} ${R_OUT} 0 ${large} 1 ${pt(b, R_OUT)}`,
    `A ${CAP} ${CAP} 0 0 1 ${pt(b, R_IN)}`,
    `A ${R_IN} ${R_IN} 0 ${large} 0 ${pt(from, R_IN)}`,
    `A ${CAP} ${CAP} 0 0 1 ${pt(from, R_OUT)}`,
    "Z",
  ].join(" ")
}
const at = (v: number) => START + (Math.max(0, Math.min(100, v)) / 100) * SPAN

/* the zone tints the value arc and its label, never the ground: red at risk, amber for
   the warning in between, green healthy */
const ZONES = [
  { to: 40, color: RED, label: "At risk" },
  { to: 70, color: AMBER, label: "Caution" },
  { to: 100, color: GREEN, label: "Healthy" },
]
const zoneOf = (v: number) => ZONES.find((z) => v < z.to) ?? ZONES[ZONES.length - 1]

function tickPos(v: number) {
  const [x, y] = polar(at(v), R + 16)
  return { x, y: y + 3 }
}

const TRACK_D = band(START, START + SPAN)

/**
 * A bounded single-metric dial: a 270° band on one flat track, a value band that sweeps
 * round to its mark while the centre number counts up with it. Pressing the dial goes to
 * the next metric; the dots below go straight to the one you pick, and pointing at a dot
 * reads it first.
 */
export function HealthGauge({ metrics = DEFAULT_METRICS, className }: HealthGaugeProps) {
  const reduced = useReducedMotion()
  const [mi, setMi] = useState(0)
  /** the dot being pointed at */
  const [hot, setHot] = useState<number | null>(null)
  const metric = metrics[mi]
  const target = metric.value
  const zone = zoneOf(target)
  const [v, setV] = useState(reduced ? target : 0)
  const shown = useRef(reduced ? target : 0)
  /* the first sweep plays once, when a third of the dial is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const entered = useRef(false)

  useEffect(() => {
    if (reduced) {
      shown.current = target
      setV(target)
      return
    }
    if (!seen) return
    /* the entrance is the long sweep up from 0; every later change is the quick one */
    const first = !entered.current
    entered.current = true
    const controls = animate(shown.current, target, {
      duration: first ? 0.8 : 0.4,
      ease: EASE,
      onUpdate: (n) => {
        shown.current = n
        setV(n)
      },
    })
    return () => controls.stop()
  }, [reduced, target, seen])

  const [ex, ey] = polar(at(v))
  const read = hot !== null && hot !== mi ? metrics[hot] : null

  return (
    <div ref={rootRef} className={cn("w-[220px] tabular-nums", className)}>
      <button
        type="button"
        onClick={() => setMi((m) => (m + 1) % metrics.length)}
        aria-label={`${metric.label}, ${Math.round(target)} out of 100, ${zone.label}. Press for the next metric`}
        className="block w-full cursor-pointer rounded-lg outline-none"
      >
        <motion.svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="block h-auto w-full"
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }}
          role="img"
          aria-label={`${metric.label} ${Math.round(target)} out of 100, ${zone.label}`}
        >
          {/* one flat track, no zone banding */}
          <path d={TRACK_D} fill="var(--foreground)" fillOpacity={0.08} />
          {/* the value band follows the counting number, so both arrive together */}
          <path d={band(START, at(v))} fill={zone.color} style={{ transition: reduced ? "none" : "fill 200ms" }} />
          <circle cx={ex} cy={ey} r={1.75} fill="var(--background)" />
          <text x={CX} y={CY - 2} textAnchor="middle" fontSize={34} fontWeight={600} fill="var(--foreground)" fillOpacity={0.9}>
            {Math.round(v)}
          </text>
          <text
            x={CX}
            y={CY + 18}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill={zone.color}
            style={{ transition: reduced ? "none" : "fill 200ms" }}
          >
            {zone.label}
          </text>
          <text {...tickPos(0)} fontSize={9} fill="var(--foreground)" fillOpacity={0.35} textAnchor="middle">
            0
          </text>
          <text {...tickPos(100)} fontSize={9} fill="var(--foreground)" fillOpacity={0.35} textAnchor="middle">
            100
          </text>
        </motion.svg>
      </button>

      <div role="status" className="mt-1 flex justify-center text-[11px]">
        {/* the line swaps in place: a 4px rise through a 2px blur */}
        <motion.span
          key={`${(read ?? metric).label}-${read ? "read" : "sub"}`}
          className="flex items-baseline gap-1.5"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          <span className="font-medium text-foreground/90">{(read ?? metric).label}</span>
          <span className="text-foreground/45">{read ? `${Math.round(read.value)} · ${zoneOf(read.value).label}` : metric.sub}</span>
        </motion.span>
      </div>

      {/* one plain dot per metric */}
      <div className="mt-1.5 flex items-center justify-center gap-1" role="group" aria-label="Metric" onPointerLeave={() => setHot(null)}>
        {metrics.map((m, i) => {
          const on = i === mi
          return (
            <button
              key={m.label}
              type="button"
              aria-label={`Show ${m.label}, ${Math.round(m.value)} out of 100`}
              aria-pressed={on}
              onClick={() => setMi(i)}
              onPointerEnter={() => setHot(i)}
              onFocus={() => setHot(i)}
              onBlur={() => setHot(null)}
              className="grid size-7 cursor-pointer place-items-center rounded-full outline-none transition-colors duration-150 hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.08]"
            >
              <span
                className={cn(
                  "block size-1.5 rounded-full bg-foreground transition-[opacity,transform] duration-200",
                  on ? "scale-[1.35] opacity-90" : hot === i ? "opacity-90" : "opacity-30",
                  reduced && "transition-none",
                )}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
