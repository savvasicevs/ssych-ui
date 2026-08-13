"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const

export interface DonutSector {
  label: string
  pct: number
}

/** Blue-family ramp plus two semantic hues — six distinct arcs before cycling. */
const DEFAULT_COLORS = [
  "var(--chart-1, #4790E4)",
  "#5C9EE8",
  "#2E5FA3",
  "var(--chart-2, #23976B)",
  "var(--chart-3, #B98634)",
  "color-mix(in srgb, var(--foreground) 22%, transparent)",
]

const DEFAULT_SECTORS: DonutSector[] = [
  { label: "Technology", pct: 31.2 },
  { label: "Financials", pct: 13.9 },
  { label: "Health care", pct: 12.4 },
  { label: "Consumer disc.", pct: 10.1 },
  { label: "Industrials", pct: 8.6 },
  { label: "Other", pct: 23.8 },
]

const R = 52
const STROKE = 13
const C = 2 * Math.PI * R

/**
 * Allocation ring: sectors as arc segments around a
 * centered symbol, legend rows beside it. Hovering a row or arc dims the rest
 * of the ring so one weight reads at a time.
 */
export function SectorsDonut({
  symbol = "SPY",
  caption = "of 503 holdings",
  sectors = DEFAULT_SECTORS,
  colors = DEFAULT_COLORS,
  className,
}: {
  symbol?: string
  caption?: string
  sectors?: DonutSector[]
  /** Arc colors, applied in order and cycled past the end. */
  colors?: string[]
  className?: string
}) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<number | null>(null)

  let acc = 0
  const arcs = sectors.map((s, i) => {
    const start = acc
    acc += s.pct
    return { ...s, start, color: colors[i % colors.length] }
  })

  return (
    <div className={cn("flex items-center gap-7", className)}>
      <div className="relative h-[132px] w-[132px]">
        <svg width={132} height={132} viewBox="0 0 132 132" className="-rotate-90 text-foreground">
          {arcs.map((a, i) => (
            <motion.circle
              key={a.label}
              cx={66}
              cy={66}
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeDasharray={`${(a.pct / 100) * C - 2} ${C}`}
              strokeDashoffset={-((a.start / 100) * C)}
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: hot === null || hot === i ? 1 : 0.22 }}
              transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: 0.08 * i }}
              onMouseEnter={() => setHot(i)}
              onMouseLeave={() => setHot(null)}
              style={{ cursor: "default" }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            {hot === null ? (
              <motion.div
                key="idle"
                className="flex flex-col items-center"
                initial={reduced ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                transition={{ duration: reduced ? 0 : 0.16, ease: EASE }}
              >
                <span className="text-[15px] font-semibold tracking-wide text-foreground/90">{symbol}</span>
                <span className="mt-0.5 text-[9px] text-foreground/35">{caption}</span>
              </motion.div>
            ) : (
              <motion.div
                key={arcs[hot].label}
                className="flex flex-col items-center"
                initial={reduced ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                transition={{ duration: reduced ? 0 : 0.16, ease: EASE }}
              >
                <span className="text-[19px] font-semibold tabular-nums" style={{ color: arcs[hot].color }}>
                  {arcs[hot].pct.toFixed(1)}%
                </span>
                <span className="mt-0.5 max-w-[92px] truncate text-center text-[9px] text-foreground/45">
                  {arcs[hot].label}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col">
        {arcs.map((a, i) => (
          <button
            key={a.label}
            type="button"
            onMouseEnter={() => setHot(i)}
            onMouseLeave={() => setHot(null)}
            onFocus={() => setHot(i)}
            onBlur={() => setHot(null)}
            className={cn(
              "-mx-2 flex items-center gap-2.5 rounded-md px-2 py-[5px] text-left transition-opacity duration-200",
              hot !== null && hot !== i && "opacity-35",
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: a.color }} />
            <span className="w-[120px] truncate text-[11.5px] text-foreground/65">{a.label}</span>
            <span className="text-[11px] tabular-nums text-foreground/50">{a.pct.toFixed(1)}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}
