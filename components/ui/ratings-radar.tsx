"use client"

import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"

export interface RadarRating {
  label: string
  count: number
}

const DEFAULT_RATINGS: RadarRating[] = [
  { label: "Neutral", count: 11 },
  { label: "Buy", count: 27 },
  { label: "Strong Buy", count: 38 },
  { label: "Strong Sell", count: 3 },
  { label: "Sell", count: 8 },
]

const CX = 150
const CY = 128
const R = 102
const RINGS = 4

/**
 * Analyst-ratings pentagon in the Ink register: hairline rings and spokes with
 * one green wedge pulled toward the dominant rating. Counts sit beside their
 * labels so the shape and the numbers read together; the caption derives from
 * the data.
 */
export function RatingsRadar({
  ratings = DEFAULT_RATINGS,
  title = "Analyst ratings",
  caption,
  className,
}: {
  /** One axis per rating, drawn clockwise from the top. */
  ratings?: RadarRating[]
  title?: string
  /** Defaults to "<total> analysts · last 90 days". */
  caption?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const max = Math.max(...ratings.map((r) => r.count), 1)
  const total = ratings.reduce((a, r) => a + r.count, 0)

  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i / ratings.length) * Math.PI * 2
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r] as const
  }
  const wedge = ratings.map((r, i) => pt(i, 6 + (r.count / max) * (R - 6)))

  return (
    <div className={cn("w-[300px]", className)}>
      <div className="text-center">
        <div className="text-[13px] font-medium text-foreground/85">{title}</div>
        <div className="mt-0.5 text-[10.5px] text-foreground/40">{caption ?? `${total} analysts · last 90 days`}</div>
      </div>

      <svg width={300} height={252} className="mt-1 block text-foreground">
        {Array.from({ length: RINGS }, (_, ri) => {
          const rr = ((ri + 1) / RINGS) * R
          const d = `M${ratings.map((_, i) => pt(i, rr).join(",")).join(" L")} Z`
          return <path key={ri} d={d} fill="none" stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
        })}
        {ratings.map((_, i) => {
          const [x2, y2] = pt(i, R)
          return <line key={i} x1={CX} y1={CY} x2={x2} y2={y2} stroke="currentColor" strokeOpacity={0.05} strokeWidth={1} />
        })}

        <motion.path
          d={`M${wedge.map((p) => p.join(",")).join(" L")} Z`}
          fill={GREEN}
          fillOpacity={0.16}
          stroke={GREEN}
          strokeOpacity={0.7}
          strokeWidth={1.2}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
          initial={{ scale: reduced ? 1 : 0.2, opacity: reduced ? 1 : 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.7, ease: EASE, delay: 0.15 }}
        />
        {ratings.map((r, i) => {
          const [x, y] = pt(i, R + 18)
          const anchor = Math.abs(x - CX) < 8 ? "middle" : x > CX ? "start" : "end"
          return (
            <text key={r.label} x={x} y={y + 3} textAnchor={anchor} fontSize={10.5}>
              <tspan fill="currentColor" fillOpacity={0.45}>{r.label} </tspan>
              {r.count > 0 && (
                <tspan fill="currentColor" fillOpacity={0.9} fontWeight={600}>
                  {r.count}
                </tspan>
              )}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
