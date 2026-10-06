"use client"

import { useEffect, useRef, useState } from "react"
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react"

import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"

/* Health Gauge, the multi-metric variant of Radial Gauge.
   What it is for: one score out of 100 at a time, from a few metrics you switch between,
   read against the zones it is judged by.
   Read first: the number in the middle; the zone word under it says what it means.
   2026-10-02 audit (redesign): it now shares Radial Gauge's dial so the Gauge family is one
   look at one width: 240 wide, the same 270 degree ring 7px deep and the same thin band
   scale outside it, drawn by the same ring() shape. The number stands at its value at 26px
   (it counted up from 0 at 34px); only the arc sweeps. The zone word sits under it in its
   hue at weight 500. The three unlabelled dots and the press on the dial that cycled
   metrics are gone: a SegmentedControl with the metric names sits in the label row above
   the dial, and the dial is not a button. The quiet sub line ("margin ratio") is cut; the
   `sub` field is still accepted and is read to a screen reader only. The 0 and 100 ticks
   and the end dot went with the old dial. A metric may carry a `short` name for the
   control, since three full names do not fit 240px.
   Zones (amber given back 2026-09-30, it is the warning state): at risk below 40 in red,
   caution from 40 to 69 in amber, healthy from 70 in green; the scale shows all three, the
   one reached strongest.
   Formulas, all from `metrics`:
   · the number = round(value), clamped to 0 to 100
   · sweep of the arc = 270° × value / 100
   · zone = the first zone whose end the value is under (40, 70, 100)
   Motion: the arc sweeps from the left shoulder to the value once the dial is a third in
   view (900ms); switching metric sweeps it from the old value to the new one (400ms);
   nothing counts. Reduced motion draws the arc at its value at once. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const AMBER = "var(--chart-amber)"

export interface HealthMetric {
  /** 0–100, the position on the dial */
  value: number
  label: string
  /** read to a screen reader after the label; no longer printed (2026-10-02) */
  sub: string
  /** the metric's name in the switcher, when the label is too long for it; defaults to the label */
  short?: string
}

export interface HealthGaugeProps {
  /** one dial per metric; the switcher above the dial picks one */
  metrics?: HealthMetric[]
  className?: string
}

const DEFAULT_METRICS: HealthMetric[] = [
  { value: 74, label: "Account health", sub: "margin ratio", short: "Health" },
  { value: 38, label: "Fear and Greed", sub: "market sentiment", short: "Sentiment" },
  { value: 61, label: "Liquidity", sub: "depth score" },
]

/* Radial Gauge's dial, value for value: a 270° ring open at the bottom, 7px deep, and a
   2px band scale just outside it */
const SIZE = 180
const MID = SIZE / 2
const H = 150
const SWEEP = 270
const START = 135
const R_OUT = 66
const R_IN = 59
const CAP = (R_OUT - R_IN) / 2
const S_OUT = 74
const S_IN = 72
/** the gap between two zones of the scale, in degrees */
const GAP = 2

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

/* the zone tints the value arc, its word and its part of the scale, never the ground */
const ZONES = [
  { from: 0, to: 40, color: RED, label: "At risk" },
  { from: 40, to: 70, color: AMBER, label: "Caution" },
  { from: 70, to: 100, color: GREEN, label: "Healthy" },
]
const zoneIndex = (v: number) => {
  const i = ZONES.findIndex((z) => v < z.to)
  return i === -1 ? ZONES.length - 1 : i
}
const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`
const clamp = (v: number) => Math.max(0, Math.min(100, v))

/**
 * A bounded score dial with a metric switcher: the arc sweeps round to the score over a
 * thin scale of the zones it is judged by; the number and the zone word stand still.
 * Picking another metric sweeps the arc from the old score to the new one.
 */
export function HealthGauge({ metrics = DEFAULT_METRICS, className }: HealthGaugeProps) {
  const reduced = useReducedMotion()
  const [mi, setMi] = useState(0)
  const metric = metrics[Math.min(mi, metrics.length - 1)] ?? DEFAULT_METRICS[0]
  const value = clamp(metric.value)
  const zi = zoneIndex(value)
  const zone = ZONES[zi]
  const names = metrics.map((m) => m.short ?? m.label)

  const dialRef = useRef<HTMLDivElement>(null)
  /* the sweep waits until the dial is a third in view, then plays once */
  const inView = useInView(dialRef, { once: true, amount: 0.3 })
  /** the first sweep is the entrance; later ones follow a switch of metric */
  const swept = useRef(false)
  const drawn = useMotionValue(reduced ? value / 100 : 0)
  const d = useTransform(drawn, (v) => ring(0, SWEEP * v, R_OUT, R_IN, CAP))
  useEffect(() => {
    if (reduced) {
      drawn.set(value / 100)
      return
    }
    if (!inView) return
    const run = animate(drawn, value / 100, {
      duration: swept.current ? 0.4 : 0.9,
      ease: EASE,
      onComplete: () => {
        swept.current = true
      },
    })
    return () => run.stop()
  }, [drawn, value, reduced, inView])

  return (
    <div className={cn("flex w-[240px] max-w-full flex-col items-center tabular-nums", className)}>
      {/* the label row is the switcher: the metric names, one picked */}
      <SegmentedControl
        options={names}
        value={names[mi]}
        onChange={(name) => setMi(Math.max(0, names.indexOf(name)))}
        className="[&>button]:px-2.5"
      />

      <div ref={dialRef} className="relative mt-3" style={{ width: SIZE, height: H }}>
        <svg
          width={SIZE}
          height={H}
          viewBox={`0 0 ${SIZE} ${H}`}
          role="img"
          aria-label={`${metric.label}, ${metric.sub}: ${Math.round(value)} out of 100, ${zone.label}`}
        >
          <path d={ring(0, SWEEP, R_OUT, R_IN, CAP)} fill="var(--foreground)" fillOpacity={0.08} />
          <motion.path d={d} fill={zone.color} style={{ transition: reduced ? "none" : "fill 160ms" }} />
          {ZONES.map((z, i) => {
            const from = (z.from / 100) * SWEEP + (i === 0 ? 0 : GAP / 2)
            const to = (z.to / 100) * SWEEP - (i === ZONES.length - 1 ? 0 : GAP / 2)
            return (
              <path
                key={z.label}
                d={ring(from, to, S_OUT, S_IN, (S_OUT - S_IN) / 2)}
                fill={mix(z.color, i === zi ? 70 : 35)}
                style={{ transition: reduced ? "none" : "fill 160ms" }}
              />
            )
          })}
        </svg>

        <div role="status" className="pointer-events-none absolute inset-x-0 flex flex-col items-center" style={{ top: MID - 20 }}>
          <span className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">{Math.round(value)}</span>
          <span className="mt-1.5 text-[11px] font-medium" style={{ color: zone.color, transition: reduced ? "none" : "color 160ms" }}>
            {zone.label}
          </span>
        </div>
      </div>
    </div>
  )
}
