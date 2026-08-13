"use client"

import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const AMBER = "var(--chart-amber)"
const GREEN = "var(--chart-up)"

export interface Holding {
  symbol: string
  name: string
  marketValue: string
  price: string
  ytd: number
  weight: number
}

const DEFAULT_HOLDINGS: Holding[] = [
  { symbol: "AAPL", name: "Apple Inc", marketValue: "$52.10B", price: "$228.02", ytd: 18.4, weight: 8.91 },
  { symbol: "MSFT", name: "Microsoft Corp", marketValue: "$48.66B", price: "$415.60", ytd: 14.2, weight: 8.32 },
  { symbol: "NVDA", name: "NVIDIA Corp", marketValue: "$41.02B", price: "$122.85", ytd: 42.1, weight: 7.01 },
  { symbol: "AMZN", name: "Amazon.com Inc", marketValue: "$35.73B", price: "$178.52", ytd: 12.49, weight: 6.11 },
  { symbol: "META", name: "Meta Platforms", marketValue: "$29.48B", price: "$514.29", ytd: 22.8, weight: 5.04 },
  { symbol: "GOOGL", name: "Alphabet Inc", marketValue: "$27.91B", price: "$163.24", ytd: 9.7, weight: 4.77 },
]

const COMB_TICKS = 24

/**
 * Fund-holdings register in the Ink register: a coin, symbol beside its muted
 * name, tabular money columns, the YTD return in a green pill, and the fund
 * weight as an amber value trailed by a tick-comb bar.
 */
export function HoldingsTable({
  holdings = DEFAULT_HOLDINGS,
  title = "Top 10 holdings",
  maxWeight = 10,
  className,
}: {
  holdings?: Holding[]
  title?: string
  /** Weight that fills the whole tick comb. */
  maxWeight?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <div
      className={cn("w-full max-w-[640px] overflow-hidden rounded-xl border border-foreground/[0.04]", className)}
      style={{ background: "var(--card)", boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)" }}
    >
      <div className="grid grid-cols-[1.6fr_0.9fr_0.9fr_0.8fr_1.1fr] gap-2 border-b border-foreground/[0.04] bg-foreground/[0.02] px-4 py-2.5">
        {[title, "Market value", "Current price", "YTD returns", "Percentage of fund"].map((h, i) => (
          <span key={h} className={cn("text-[9px] uppercase tracking-[0.1em] text-foreground/30", i > 0 && "text-right")}>
            {h}
          </span>
        ))}
      </div>

      <div className="divide-y divide-foreground/[0.03]">
        {holdings.map((h, i) => {
          const cursor = Math.round((h.weight / maxWeight) * COMB_TICKS)
          return (
            <motion.div
              key={h.symbol}
              className="grid grid-cols-[1.6fr_0.9fr_0.9fr_0.8fr_1.1fr] items-center gap-2 px-4 py-2.5 transition-colors duration-150 hover:bg-foreground/[0.015]"
              initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: i * 0.05 }}
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-foreground/[0.08] bg-foreground/[0.04] text-[8.5px] font-semibold text-foreground/70">
                  {h.symbol.slice(0, 2)}
                </span>
                <span className="truncate">
                  <span className="text-[11.5px] font-semibold text-foreground/85">{h.symbol}</span>
                  <span className="ml-2 text-[10.5px] text-foreground/35">{h.name}</span>
                </span>
              </span>
              <span className="text-right text-[11px] tabular-nums text-foreground/55">{h.marketValue}</span>
              <span className="text-right text-[11px] tabular-nums text-foreground/55">{h.price}</span>
              <span className="text-right">
                <span
                  className="inline-block rounded-md px-2 py-0.5 text-[10px] tabular-nums"
                  style={{ color: GREEN, background: "rgba(52,194,138,0.1)" }}
                >
                  {h.ytd.toFixed(2)}%
                </span>
              </span>
              <span className="flex items-center justify-end gap-2.5">
                <span className="text-[11px] tabular-nums" style={{ color: AMBER }}>
                  {h.weight.toFixed(2)}%
                </span>
                <span className="flex h-3 items-center gap-[2px]">
                  {Array.from({ length: COMB_TICKS }, (_, t) => (
                    <span
                      key={t}
                      className="w-px rounded-full"
                      style={{
                        height: t < cursor ? 9 : 5,
                        background: t < cursor ? "rgba(232,180,90,0.6)" : "color-mix(in srgb, var(--foreground) 12%, transparent)",
                      }}
                    />
                  ))}
                </span>
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
