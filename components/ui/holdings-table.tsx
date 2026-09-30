"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Holdings Table, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card, outline, inner shadow or header band: rows sit on the page and part by one
     hairline above each; the coin is a fill, not a ring
   · amber is gone. The weight and its comb are ink, and the comb of the row being pointed
     at takes the one accent
   · the return is signed and coloured by direction: green for a gain, red for a loss. It
     was always green in a green pill, whatever the sign
   · pointing at a row, or tabbing to it, dims the others and reads it out in the line
     under the table; at rest that line carries the count and the summed weight
   · it is a real table to a screen reader: rows, column heads and cells are named */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const ACCENT = "var(--chart-1)"

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
const COLS = "grid-cols-[1.6fr_0.9fr_0.9fr_0.8fr_1.1fr]"

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`
const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`

/**
 * Fund-holdings register in the Ink register: a coin, symbol beside its muted name,
 * tabular money columns, the signed return, and the weight trailed by a tick-comb bar.
 * Pointing at a row dims the rest and hands its comb the accent. The four column labels
 * are props, so a book that is not a fund can name what its return and weight actually
 * measure (return since entry, share of gross exposure) without a fork.
 */
export function HoldingsTable({
  holdings = DEFAULT_HOLDINGS,
  title = "Top 10 holdings",
  maxWeight = 10,
  valueLabel = "Market value",
  priceLabel = "Current price",
  returnLabel = "YTD returns",
  weightLabel = "Percentage of fund",
  className,
}: {
  holdings?: Holding[]
  title?: string
  /** Weight that fills the whole tick comb. */
  maxWeight?: number
  /** Column header over `marketValue`. */
  valueLabel?: string
  /** Column header over `price`. */
  priceLabel?: string
  /** Column header over the return: name the window the number covers. */
  returnLabel?: string
  /** Column header over the weight comb: name the base the share is taken of. */
  weightLabel?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<string | null>(null)
  /* the weight of everything listed, summed from the rows */
  const total = holdings.reduce((s, h) => s + h.weight, 0)
  const shown = holdings.find((h) => h.symbol === hot)

  return (
    <div className={cn("w-full max-w-[640px] tabular-nums", className)} role="table" aria-label={`${title}, ${holdings.length} holdings, ${total.toFixed(2)}% in all`}>
      <div role="row" className={cn("grid gap-2 px-3 pb-2", COLS)}>
        {[title, valueLabel, priceLabel, returnLabel, weightLabel].map((h, i) => (
          <span
            key={i}
            role="columnheader"
            className={cn("whitespace-nowrap", i === 0 ? "text-[13px] font-medium text-foreground/90" : "self-end text-right text-[10.5px] text-foreground/45")}
          >
            {h}
          </span>
        ))}
      </div>

      <div role="rowgroup" onPointerLeave={() => setHot(null)}>
        {holdings.map((h, i) => {
          const cursor = Math.round((h.weight / maxWeight) * COMB_TICKS)
          const on = hot === h.symbol
          const dim = hot !== null && !on
          return (
            /* the outer row owns the dim so it never fights the entrance inside */
            <div
              key={h.symbol}
              role="row"
              tabIndex={0}
              onPointerEnter={() => setHot(h.symbol)}
              onFocus={() => setHot(h.symbol)}
              onBlur={() => setHot(null)}
              className="border-t border-foreground/[0.05] outline-none transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.06]"
              style={{ opacity: dim ? 0.45 : 1 }}
            >
              <motion.div
                className={cn("grid items-center gap-2 px-3 py-2.5", COLS)}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
              >
                <span role="cell" className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-[8.5px] font-semibold text-foreground/70">
                    {h.symbol.slice(0, 2)}
                  </span>
                  <span className="truncate">
                    <span className="text-[12px] font-semibold text-foreground/90">{h.symbol}</span>
                    <span className="ml-2 text-[10.5px] text-foreground/35">{h.name}</span>
                  </span>
                </span>
                <span role="cell" className="text-right text-[11px] text-foreground/70">
                  {h.marketValue}
                </span>
                <span role="cell" className="text-right text-[11px] text-foreground/70">
                  {h.price}
                </span>
                <span role="cell" className="text-right text-[11px] font-medium" style={{ color: h.ytd >= 0 ? GREEN : RED }}>
                  {signed(h.ytd)}
                </span>
                <span role="cell" className="flex items-center justify-end gap-2.5">
                  <span className="text-[11px] text-foreground/90">{h.weight.toFixed(2)}%</span>
                  <span aria-hidden className="flex h-3 items-center gap-[2px]">
                    {Array.from({ length: COMB_TICKS }, (_, t) => (
                      <span
                        key={t}
                        className="w-px rounded-full"
                        style={{
                          height: t < cursor ? 9 : 5,
                          background: t < cursor ? (on ? ACCENT : ink(55)) : ink(12),
                          transition: "background 150ms",
                        }}
                      />
                    ))}
                  </span>
                </span>
              </motion.div>
            </div>
          )
        })}
      </div>

      <div role="status" className="border-t border-foreground/[0.05] px-3 pt-2 text-[10.5px] text-foreground/45">
        {/* the readout swaps in place, 4px and a 2px blur over 150ms, so moving row to row never jumps */}
        <motion.span
          key={shown?.symbol ?? ""}
          className="inline-block"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
        {shown ? (
          <>
            <span className="font-medium text-foreground/90">{shown.symbol}</span> {shown.name} · {shown.weight.toFixed(2)}% of {maxWeight}% on the comb ·{" "}
            <span style={{ color: shown.ytd >= 0 ? GREEN : RED }}>{signed(shown.ytd)}</span>
          </>
        ) : (
          `${holdings.length} holdings · ${total.toFixed(2)}% in all`
        )}
        </motion.span>
      </div>
    </div>
  )
}
