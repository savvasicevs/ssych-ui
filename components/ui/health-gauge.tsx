"use client"

import { useEffect, useRef, useState } from "react"
import { animate, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const AMBER = "var(--chart-amber)"
const GREEN = "var(--chart-2)"
const RED = "var(--chart-down)"
const SANS = "inherit"
const TEXT = "var(--foreground)"
const TEXT_MUTED = "var(--muted-foreground)"
const TRACK = "color-mix(in srgb, var(--foreground) 12%, transparent)"

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

/* The 270° sweep bottoms out at ±R·sin45°, so the box is sized (and CY nudged
   up) to clear the round caps and the 0/100 ticks instead of clipping them. */
const VB_W = 220
const VB_H = 176
const CX = VB_W / 2
const CY = 94
const R = 84
const SW = 10

function polar(deg: number, r = R) {
  const a = ((deg - 90) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const
}
function arc(from: number, to: number, r = R) {
  const [x0, y0] = polar(from, r)
  const [x1, y1] = polar(to, r)
  const large = Math.abs(to - from) > 180 ? 1 : 0
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
}
const at = (v: number) => START + (v / 100) * SPAN

/* thresholds tint the value arc, the readout label and the state dot, never the ground */
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

/**
 * A bounded single-metric dial: a 270° arc on one flat track, a value arc that
 * draws in with round ends behind an end marker, and a centre number that counts
 * up to it. Clicking the dial cycles the metric, the arc redraws and the number
 * re-counts, and the dots below jump straight to the one you pick.
 */
export function HealthGauge({ metrics = DEFAULT_METRICS, className }: HealthGaugeProps) {
  const reduced = useReducedMotion()
  const [mi, setMi] = useState(0)
  const metric = metrics[mi]
  const target = metric.value
  const zone = zoneOf(target)
  const [v, setV] = useState(reduced ? target : 0)
  const shown = useRef(reduced ? target : 0)

  useEffect(() => {
    if (reduced) {
      shown.current = target
      setV(target)
      return
    }
    const controls = animate(shown.current, target, {
      duration: 1.1,
      ease: EASE,
      onUpdate: (n) => {
        shown.current = n
        setV(n)
      },
    })
    return () => controls.stop()
  }, [reduced, target])

  const [ex, ey] = polar(at(target))

  return (
    <div className={cn("w-[220px]", className)} style={{ fontFamily: SANS }}>
      <button
        type="button"
        onClick={() => setMi((m) => (m + 1) % metrics.length)}
        aria-label={`Metric: ${metric.label}. Click to cycle.`}
        className="block w-full cursor-pointer outline-none"
      >
        <motion.svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="block h-auto w-full"
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={{ duration: 0.15, ease: EASE }}
          role="img"
          aria-label={`${metric.label} ${Math.round(target)} out of 100, ${zone.label}`}
        >
          {/* one flat track, no zone banding */}
          <path d={arc(START, START + SPAN)} fill="none" stroke={TRACK} strokeWidth={SW} strokeLinecap="round" />
          {/* value arc — re-keys on metric change so it redraws */}
          <motion.path
            key={mi}
            d={arc(START, at(target))}
            fill="none"
            stroke={zone.color}
            strokeWidth={SW}
            strokeLinecap="round"
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 1.1, ease: EASE }}
          />
          <motion.circle
            key={`end-${mi}`}
            cx={ex}
            cy={ey}
            r={6}
            fill="var(--card)"
            stroke={zone.color}
            strokeWidth={2.5}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 1, duration: 0.3 }}
          />
          <text x={CX} y={CY - 2} textAnchor="middle" fontSize={34} fontWeight={700} fill={TEXT} className="tabular-nums">
            {Math.round(v)}
          </text>
          <text x={CX} y={CY + 18} textAnchor="middle" fontSize={11} fontWeight={600} fill={zone.color}>
            {zone.label}
          </text>
          <text {...tickPos(0)} fontSize={9} fill="var(--color-foreground)" fillOpacity={0.3} textAnchor="middle">
            0
          </text>
          <text {...tickPos(100)} fontSize={9} fill="var(--color-foreground)" fillOpacity={0.3} textAnchor="middle">
            100
          </text>
        </motion.svg>
      </button>

      <div className="mt-1 text-center text-[11px]" style={{ color: TEXT_MUTED }}>
        <span style={{ color: TEXT }}>{metric.label}</span> · {metric.sub}
      </div>

      {/* one plain circle per metric, tinted by its own zone */}
      <div className="mt-2.5 flex items-center justify-center gap-3" role="group" aria-label="Metric">
        {metrics.map((m, i) => {
          const c = zoneOf(m.value).color
          const on = i === mi
          return (
            <button
              key={m.label}
              type="button"
              aria-label={`Show ${m.label}`}
              aria-pressed={on}
              onClick={() => setMi(i)}
              className="grid size-7 cursor-pointer place-items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/60"
              style={{ boxShadow: on ? `inset 0 0 0 1.5px color-mix(in srgb, ${c} 45%, transparent)` : undefined }}
            >
              <span
                className="block rounded-full"
                style={{
                  width: on ? 18 : 15,
                  height: on ? 18 : 15,
                  background: c,
                  opacity: on ? 1 : 0.55,
                  transition: reduced ? "none" : "width 200ms, height 200ms, opacity 200ms",
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
