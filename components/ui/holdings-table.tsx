"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

/* Holdings Table, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card, outline, inner shadow or header band: rows sit on the page and part by one
     hairline above each; the coin is a fill, not a ring
   · amber is gone. The weight and its comb are ink, and the comb of the row being pointed
     at takes the one accent
   · the return is signed and coloured by direction: green for a gain, red for a loss. It
     was always green in a green pill, whatever the sign
   · pointing at a row, or tabbing to it, dims the others and hands its comb the accent.
     No line under the table (user call, 2026-10-02): the count and the summed weight are
     read out in the table's name
   · the company's own mark beside its symbol through `renderIcon` (2026-10-02); two
     letters on ink where none is given
   · it is a real table to a screen reader: rows, column heads and cells are named
   2026-10-02 audit: the first head was the 13px title "Top 10 holdings" over 6 rows; it is
   now a plain "Holding" head like the others and the title (default "Holdings", never a
   count) lives in the aria-label only. Every head sorts on a click like Positions Table's,
   the sorted one /90 with a chevron, weight (largest first) by default. The company name
   sits under the symbol at 11px /60 since it is read, row figures are 12px /90, hairlines
   are 4%, and the width is 560, the same as Positions Table, its family.
   Formulas:
   · the comb      round(weight ÷ maxWeight × 24) of its 24 ticks are lit
   · the label     Σ weight of the rows, read out in the table's name
   · money sorts   "$52.10B" is read as 52.10 × 10^9 (K, M, B, T suffixes) */

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
const COLS = "grid-cols-[1.45fr_0.9fr_0.85fr_0.75fr_1.35fr]"

type SortKey = "symbol" | "value" | "price" | "ytd" | "weight"
const SUFFIX: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }
/** "$52.10B" → 52,100,000,000, so the string money columns sort by what they say */
const moneyOf = (s: string) => {
  const m = s.replace(/[$,\s]/g, "").match(/^(-?[\d.]+)([KMBT])?$/i)
  return m ? parseFloat(m[1]) * (m[2] ? SUFFIX[m[2].toUpperCase()] : 1) : 0
}
const SORT_VALUE: Record<Exclude<SortKey, "symbol">, (h: Holding) => number> = {
  value: (h) => moneyOf(h.marketValue),
  price: (h) => moneyOf(h.price),
  ytd: (h) => h.ytd,
  weight: (h) => h.weight,
}

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`
const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`

/**
 * Fund-holdings register in the Ink register: the company's mark, symbol beside its muted name,
 * tabular money columns, the signed return, and the weight trailed by a tick-comb bar.
 * Pointing at a row dims the rest and hands its comb the accent. The four column labels
 * are props, so a book that is not a fund can name what its return and weight actually
 * measure (return since entry, share of gross exposure) without a fork.
 */
export function HoldingsTable({
  holdings = DEFAULT_HOLDINGS,
  title = "Holdings",
  maxWeight = 10,
  valueLabel = "Market value",
  priceLabel = "Current price",
  returnLabel = "YTD returns",
  weightLabel = "Percentage of fund",
  renderIcon,
  className,
}: {
  holdings?: Holding[]
  /** the table's name, read out in its aria-label (no visible title) */
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
  /** draws the company's real mark at `size` px; two letters on ink without it */
  renderIcon?: (symbol: string, size: number) => ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "weight", dir: -1 })
  /* the weight of everything listed, summed from the rows */
  const total = holdings.reduce((s, h) => s + h.weight, 0)
  const rows = [...holdings].sort((a, b) =>
    sort.key === "symbol" ? a.symbol.localeCompare(b.symbol) * sort.dir : (SORT_VALUE[sort.key](a) - SORT_VALUE[sort.key](b)) * sort.dir,
  )

  const head = (key: SortKey, label: string, first = false) => {
    const on = sort.key === key
    return (
      <span key={key} role="columnheader" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="flex">
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}
          aria-label={`Sort by ${label.toLowerCase()}`}
          className={cn(
            "flex w-full items-center gap-0.5 whitespace-nowrap rounded-full text-[10.5px] outline-none transition-colors duration-200",
            !first && "justify-end",
            on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90",
          )}
        >
          {label}
          {on && (sort.dir === -1 ? <ChevronDown size={10} strokeWidth={1.8} aria-hidden /> : <ChevronUp size={10} strokeWidth={1.8} aria-hidden />)}
        </button>
      </span>
    )
  }

  return (
    <div className={cn("w-full max-w-[560px] tabular-nums", className)} role="table" aria-label={`${title}, ${holdings.length} holdings, ${total.toFixed(2)}% in all`}>
      <div role="row" className={cn("grid gap-2 px-3 pb-2", COLS)}>
        {head("symbol", "Holding", true)}
        {head("value", valueLabel)}
        {head("price", priceLabel)}
        {head("ytd", returnLabel)}
        {head("weight", weightLabel)}
      </div>

      <div role="rowgroup" onPointerLeave={() => setHot(null)}>
        {rows.map((h, i) => {
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
              className="border-t border-foreground/[0.04] outline-none transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.06]"
              style={{ opacity: dim ? 0.45 : 1 }}
            >
              <motion.div
                className={cn("grid items-center gap-2 px-3 py-2.5", COLS)}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
              >
                <span role="cell" className="flex min-w-0 items-center gap-2.5">
                  {renderIcon ? (
                    <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center">
                      {renderIcon(h.symbol, 24)}
                    </span>
                  ) : (
                    <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-[8.5px] font-semibold text-foreground/70">
                      {h.symbol.slice(0, 2)}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[12px] font-semibold text-foreground/90">{h.symbol}</span>
                    <span className="truncate text-[11px] text-foreground/60">{h.name}</span>
                  </span>
                </span>
                <span role="cell" className="text-right text-[12px] text-foreground/90">
                  {h.marketValue}
                </span>
                <span role="cell" className="text-right text-[12px] text-foreground/90">
                  {h.price}
                </span>
                <span role="cell" className="text-right text-[12px] font-medium" style={{ color: h.ytd >= 0 ? GREEN : RED }}>
                  {signed(h.ytd)}
                </span>
                <span role="cell" className="flex items-center justify-end gap-2.5">
                  <span className="text-[12px] text-foreground/90">{h.weight.toFixed(2)}%</span>
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

    </div>
  )
}
