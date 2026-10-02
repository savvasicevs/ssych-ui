"use client"

import { useState, type KeyboardEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

/* Positions Table, written new through ssych-component (2026-09-29).
   What it is for: every open position in one read: what it is, how big, where it was
   opened, where it is marked, where it would be liquidated and what it has made or lost.
   Read first: the unrealised P&L, signed and coloured, at the right of each row and
   summed above the table.
   The pointer: point at a row, or tab to it, and the others dim while the line under the
   table reads that position's margin and its distance to liquidation. Press the row to
   hold it; the line then offers to close the position. The column heads sort both ways.
   Sketch used: src/components/lab/PositionsBlotterPro.tsx. Kept: the position shape
   (symbol, side, size, entry, mark, leverage), P&L worked from size and the two prices,
   liquidation worked from leverage, sorting on any measure, closing from the row.
   Changed: no card, no pill around the side, no amber; the liquidation price is printed,
   with its distance under it, where the sketch drew a coloured bar; the marks do not tick
   on their own, the caller passes new ones.
   No reference was named for this one.
   Formulas:
   · value         size × mark
   · margin        size × entry ÷ leverage
   · P&L           size × (mark − entry) for a long, size × (entry − mark) for a short
   · on margin     P&L ÷ margin × 100
   · liquidation   entry × (1 − 1 ÷ leverage + maintenance) for a long,
                   entry × (1 + 1 ÷ leverage − maintenance) for a short
   · away          |mark − liquidation| ÷ mark × 100
   · totals        Σ P&L, Σ margin, and Σ P&L ÷ Σ margin × 100
   Motion (2026-09-30): a re-sort glides the rows to their new places by a layout transform
   (250ms), a closed row fades out while the rest close up, the readout swaps in place and
   the close button settles in from 0.97. */

const EASE = [0.16, 1, 0.3, 1] as const
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
const SMOOTH = [0.22, 1, 0.36, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export interface Position {
  symbol: string
  name: string
  side: "long" | "short"
  /** in units of the asset */
  size: number
  entry: number
  mark: number
  leverage: number
}

export interface PositionsTableProps {
  positions?: Position[]
  title?: string
  /** maintenance margin rate, as a fraction of the entry price */
  maintenance?: number
  /** fired when a held position is closed; the row leaves the table */
  onClose?: (position: Position) => void
  className?: string
}

const DEFAULT_POSITIONS: Position[] = [
  { symbol: "BTC", name: "Bitcoin", side: "long", size: 0.85, entry: 64120, mark: 67412.5, leverage: 5 },
  { symbol: "ETH", name: "Ethereum", side: "short", size: 12, entry: 3482.4, mark: 3391.15, leverage: 4 },
  { symbol: "SOL", name: "Solana", side: "long", size: 420, entry: 152.3, mark: 148.62, leverage: 3 },
  { symbol: "AVAX", name: "Avalanche", side: "short", size: 900, entry: 27.84, mark: 28.91, leverage: 2 },
  { symbol: "DOGE", name: "Dogecoin", side: "long", size: 150000, entry: 0.1182, mark: 0.1247, leverage: 10 },
]

type SortKey = "symbol" | "value" | "away" | "pnl"
const COLS = "grid-cols-[1fr_1fr_1fr_1fr_1.15fr]"

const num = (n: number, dp: number) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
/** prices keep the places their size needs: four under a dollar, two above */
const price = (n: number) => num(n, Math.abs(n) < 1 ? 4 : 2)
const size = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 })
const usd = (n: number) => (Math.abs(n) >= 1e4 ? `$${(Math.abs(n) / 1e3).toFixed(1)}K` : `$${num(Math.abs(n), 2)}`)
const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}$${num(Math.abs(n), 2)}`
const signedPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

/**
 * The open book as rows on the page: market and side, size, entry over mark, the
 * liquidation price with its distance, and the unrealised P&L. Pointing at a row dims the
 * rest and reads its margin under the table; pressing holds it and offers the close.
 */
export function PositionsTable({
  positions = DEFAULT_POSITIONS,
  title = "Positions",
  maintenance = 0.005,
  onClose,
  className,
}: PositionsTableProps) {
  const reduced = useReducedMotion()
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "pnl", dir: -1 })
  const [hover, setHover] = useState<string | null>(null)
  const [held, setHeld] = useState<string | null>(null)
  const [closed, setClosed] = useState<string[]>([])

  const idOf = (p: Position) => `${p.symbol}-${p.side}`
  const valueOf = (p: Position) => p.size * p.mark
  const marginOf = (p: Position) => (p.size * p.entry) / p.leverage
  const pnlOf = (p: Position) => (p.side === "long" ? 1 : -1) * p.size * (p.mark - p.entry)
  const liqOf = (p: Position) =>
    Math.max(0, p.side === "long" ? p.entry * (1 - 1 / p.leverage + maintenance) : p.entry * (1 + 1 / p.leverage - maintenance))
  const awayOf = (p: Position) => (p.mark > 0 ? (Math.abs(p.mark - liqOf(p)) / p.mark) * 100 : 0)

  const open = positions.filter((p) => !closed.includes(idOf(p)))
  const measure = (p: Position) => (sort.key === "value" ? valueOf(p) : sort.key === "away" ? awayOf(p) : pnlOf(p))
  const rows = [...open].sort((a, b) =>
    sort.key === "symbol" ? a.symbol.localeCompare(b.symbol) * sort.dir : (measure(a) - measure(b)) * sort.dir,
  )

  const totalPnl = open.reduce((s, p) => s + pnlOf(p), 0)
  const totalMargin = open.reduce((s, p) => s + marginOf(p), 0)
  const totalValue = open.reduce((s, p) => s + valueOf(p), 0)
  const totalPct = totalMargin > 0 ? (totalPnl / totalMargin) * 100 : 0

  const hot = held ?? hover
  const shown = open.find((p) => idOf(p) === hot)
  const holding = shown !== undefined && held === idOf(shown)

  const close = (p: Position) => {
    onClose?.(p)
    setClosed((c) => [...c, idOf(p)])
    setHeld(null)
    setHover(null)
  }

  const head = (key: SortKey | null, label: string, first = false) => {
    const on = key !== null && sort.key === key
    const cls = cn("flex items-center gap-0.5 whitespace-nowrap text-[10.5px]", !first && "justify-end")
    if (key === null)
      return (
        <span role="columnheader" className={cn(cls, "text-foreground/45")}>
          {label}
        </span>
      )
    return (
      <span role="columnheader" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="flex">
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}
          aria-label={`Sort by ${label.toLowerCase()}`}
          className={cn(
            cls,
            "w-full rounded-full outline-none transition-colors duration-200",
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
    <div
      className={cn("w-full max-w-[520px] tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}
      role="table"
      aria-label={`${title}, ${open.length} open, unrealised ${signedUsd(totalPnl)}`}
    >
      {/* no visible title (2026-10-01): the column heads say what this is and the name lives in
          the table's aria-label; the total sits over the P&L column it sums */}
      <div className="mb-3 flex items-baseline justify-end px-3">
        <span className="text-[13px] font-semibold" style={{ color: ink(totalPnl >= 0 ? GREEN : RED) }}>
          {signedUsd(totalPnl)}
          <span className="ml-1.5 text-[10.5px] font-medium">{signedPct(totalPct)}</span>
        </span>
      </div>

      <div role="row" className={cn("grid gap-2 px-3 pb-2", COLS)}>
        {head("symbol", "Market", true)}
        {head("value", "Size")}
        {head(null, "Entry / mark")}
        {head("away", "Liquidation")}
        {head("pnl", "Unrealised P&L")}
      </div>

      <div role="rowgroup" onPointerLeave={() => setHover(null)}>
        <AnimatePresence initial={false}>
        {rows.map((p, i) => {
          const id = idOf(p)
          const pnl = pnlOf(p)
          const on = hot === id
          const dim = hot !== null && hot !== undefined && !on
          const hue = p.side === "long" ? GREEN : RED
          return (
            /* the wrapper owns the re-sort glide and the exit, the row the dim, the inside the entrance */
            <motion.div
              key={id}
              layout={reduced ? false : "position"}
              exit={{ opacity: 0, transition: { duration: 0.15, ease: SMOOTH } }}
              transition={{ layout: { duration: 0.25, ease: SMOOTH } }}
            >
            <div
              role="row"
              tabIndex={0}
              aria-selected={held === id}
              onPointerEnter={() => setHover(id)}
              onFocus={() => setHover(id)}
              onBlur={() => setHover(null)}
              onClick={() => setHeld((h) => (h === id ? null : id))}
              onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setHeld((h) => (h === id ? null : id))
                } else if (e.key === "Escape") setHeld(null)
              }}
              className={cn(
                "cursor-pointer border-t border-foreground/[0.05] outline-none transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.06]",
                held === id && "bg-foreground/[0.04]",
              )}
              style={{ opacity: dim ? 0.45 : 1 }}
            >
              <motion.div
                className={cn("grid items-center gap-2 px-3 py-2", COLS)}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
              >
                <span role="cell" className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[12px] font-semibold text-foreground/90">{p.symbol}</span>
                  <span className="text-[10px] font-medium" style={{ color: ink(hue) }}>
                    {p.side === "long" ? "Long" : "Short"} {p.leverage}×
                  </span>
                </span>
                <span role="cell" className="flex flex-col items-end gap-0.5">
                  <span className="text-[11px] text-foreground/90">{size(p.size)}</span>
                  <span className="text-[10px] text-foreground/45">{usd(valueOf(p))}</span>
                </span>
                <span role="cell" className="flex flex-col items-end gap-0.5">
                  <span className="text-[11px] text-foreground/45">{price(p.entry)}</span>
                  <span className="text-[11px] text-foreground/90">{price(p.mark)}</span>
                </span>
                <span role="cell" className="flex flex-col items-end gap-0.5">
                  <span className="text-[11px] text-foreground/90">{price(liqOf(p))}</span>
                  <span className="text-[10px] text-foreground/45">{awayOf(p).toFixed(1)}% away</span>
                </span>
                <span role="cell" className="flex flex-col items-end gap-0.5" style={{ color: ink(pnl >= 0 ? GREEN : RED) }}>
                  <span className="text-[11.5px] font-semibold">{signedUsd(pnl)}</span>
                  <span className="text-[10px]">{signedPct(marginOf(p) > 0 ? (pnl / marginOf(p)) * 100 : 0)}</span>
                </span>
              </motion.div>
            </div>
            </motion.div>
          )
        })}
        </AnimatePresence>
      </div>

      <div className="flex min-h-[38px] items-center justify-between gap-3 border-t border-foreground/[0.05] px-3 pt-2 text-[10.5px] text-foreground/45">
        <span role="status" className="min-w-0">
          {/* the line swaps in place: 4px and a 2px blur, 150ms */}
          <motion.span
            key={shown ? idOf(shown) : `rest-${open.length}`}
            className="inline-block"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
          {shown ? (
            <>
              <span className="font-medium text-foreground/90">{shown.name}</span> · margin {usd(marginOf(shown))} · mark is{" "}
              {awayOf(shown).toFixed(1)}% {shown.side === "long" ? "above" : "below"} {price(liqOf(shown))}
            </>
          ) : open.length ? (
            `${open.length} open · margin ${usd(totalMargin)} · value ${usd(totalValue)}`
          ) : (
            "No open positions"
          )}
          </motion.span>
        </span>
        {holding && shown && (
          <motion.button
            type="button"
            onClick={() => close(shown)}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: EASE }}
            whileTap={reduced ? undefined : { scale: 0.97, transition: LIFT_SPRING }}
            className="h-7 shrink-0 rounded-full bg-foreground/[0.08] px-3 text-[11px] font-medium text-foreground/90 outline-none transition-colors duration-150 hover:bg-foreground/[0.14] focus-visible:bg-foreground/[0.14]"
          >
            Close {shown.symbol}
          </motion.button>
        )}
      </div>
    </div>
  )
}
