"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const ACCENT: [number, number, number] = [72, 159, 250]
const accentRgba = (a: number) => `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},${a})`

export interface CombRow {
  label: string
  value: number
}

const DEFAULT_ROWS: CombRow[] = [
  { label: "EBAY", value: 10.7 },
  { label: "GOOGL", value: 22.9 },
  { label: "META", value: 28.9 },
  { label: "MSFT", value: 36 },
  { label: "AMZN", value: 42.2 },
]

const TICKS = 46

/**
 * A comparison in the Ink register: every row is a ruler of ticks, the cursor
 * tick stands taller at the value, and the subject row's comb carries the
 * accent. Hovering another row hands it the accent and the ink. The ticks
 * grow in row by row on mount.
 */
export function CombRows({
  title = "P/E ratio",
  caption = "AMZN is 95% above sector average",
  rows = DEFAULT_ROWS,
  subject = "AMZN",
  max = 50,
  className,
}: {
  title?: string
  caption?: string
  rows?: CombRow[]
  /** the row that carries the accent while nothing is hovered */
  subject?: string
  /** the value at the end of the ruler */
  max?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<string | null>(null)

  return (
    <div className={cn("w-[320px]", className)}>
      <div className="text-center">
        <div className="text-[13px] font-medium text-foreground/85">{title}</div>
        <div className="mt-0.5 text-[10.5px] text-foreground/40">{caption}</div>
      </div>

      <div className="mt-4 flex flex-col" onPointerLeave={() => setHot(null)}>
        {rows.map((r, ri) => {
          const cursor = Math.round((r.value / max) * TICKS)
          const active = hot === r.label || (hot === null && r.label === subject)
          return (
            <motion.div
              key={r.label}
              className="-mx-2 flex items-center gap-3 rounded-md px-2 py-[7px]"
              onPointerEnter={() => setHot(r.label)}
              initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: ri * 0.06 }}
            >
              <span className={cn("w-[52px] shrink-0 text-[11.5px] font-medium transition-colors duration-150", active ? "text-foreground/85" : "text-foreground/50")}>{r.label}</span>
              <span className="flex h-4 flex-1 items-center gap-[2.5px]" aria-hidden>
                {Array.from({ length: TICKS }, (_, t) => {
                  const isCursor = t === cursor
                  const filled = t < cursor
                  return (
                    <motion.span
                      key={t}
                      className="w-px rounded-full"
                      style={{
                        height: isCursor ? 13 : filled ? 8 : 5,
                        background: isCursor
                          ? active
                            ? accentRgba(1)
                            : "color-mix(in srgb, var(--foreground) 85%, transparent)"
                          : filled
                            ? active
                              ? accentRgba(0.55)
                              : "color-mix(in srgb, var(--foreground) 28%, transparent)"
                            : "color-mix(in srgb, var(--foreground) 10%, transparent)",
                        transition: "background 0.15s",
                      }}
                      initial={{ scaleY: reduced ? 1 : 0 }}
                      animate={{ scaleY: 1 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: ri * 0.06 + t * 0.004 }}
                    />
                  )
                })}
              </span>
              <span className={cn("w-[36px] shrink-0 text-right text-[11px] tabular-nums transition-colors duration-150", active ? "text-foreground/85" : "text-foreground/45")}>{r.value}</span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
