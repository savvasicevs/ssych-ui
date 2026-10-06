"use client"

import { useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { BUTTON } from "@/components/ui/control-classes"
import { RowAction, rowExit, rowWash, useRowExit } from "@/components/ui/row-action"

/* Positions Table, written new through ssych-component (2026-09-29).
   What it is for: every open position in one read: what it is, how big, where it was
   opened, where it is marked, where it would be liquidated and what it has made or lost.
   Read first: the unrealised P&L, signed and coloured, at the right of each row.
   The pointer: point at a row, or tab to its Close, and the others dim while a Close
   button comes up at the row's end (always shown where there is no hover). The column
   heads sort both ways. No totals above or below the rows (user call, 2026-10-02).
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
   · the label     Σ P&L of the open rows, read out in the table's name
   Motion (2026-09-30, the close 2026-10-02): a re-sort glides the rows to their new places
   by a layout transform (250ms). Close comes up from 4px over 150ms. Pressing it holds the
   row for 420ms: a wash in the colour of its P&L, the button turned to a tick and
   "Closed"; then the row slides 16px right as it fades and folds its height away (300ms)
   while the rows under it close up. Reduced motion keeps the wash and drops the travel.
   2026-10-02 audit: each market carries its token's mark through a renderIcon slot (the
   preview draws the real marks, as Holdings Table does with company marks); the entry
   price is /60 since a trader reads it, value and distance read 10.5px /60, hairlines are
   4%, and an optional Reset (the `resettable` prop, on in the preview) brings the closed
   rows back from the empty state so the close can be replayed. The row Close stays. */

const EASE = [0.16, 1, 0.3, 1] as const
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
  /** fired when a position's Close is pressed; the row leaves the table */
  onClose?: (position: Position) => void
  /** draws the token's real mark at `size` px; the symbol stands alone without it */
  renderIcon?: (symbol: string, size: number) => ReactNode
  /** show a Reset in the empty state that brings the closed rows back (demos) */
  resettable?: boolean
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
/* the last column is the Close button's (row-action.tsx), so it never sits over a figure */
const COLS = "grid-cols-[1fr_1fr_1fr_1fr_1.15fr_56px]"

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
 * rest and brings up its Close.
 */
export function PositionsTable({
  positions = DEFAULT_POSITIONS,
  title = "Positions",
  maintenance = 0.005,
  onClose,
  renderIcon,
  resettable = false,
  className,
}: PositionsTableProps) {
  const reduced = useReducedMotion()
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "pnl", dir: -1 })
  const [hover, setHover] = useState<string | null>(null)
  const [closed, setClosed] = useState<string[]>([])
  const { leaving: closing, start } = useRowExit()

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
  const hot = closing ?? hover

  const close = (p: Position) => {
    if (closing) return
    const id = idOf(p)
    onClose?.(p)
    start(id, () => {
      setClosed((c) => [...c, id])
      setHover(null)
    })
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
      className={cn("w-full max-w-[560px] tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}
      role="table"
      aria-label={`${title}, ${open.length} open, unrealised ${signedUsd(totalPnl)}`}
    >
      {/* no visible title (2026-10-01) and no totals (2026-10-02): the column heads say what
          this is, and the name and the summed P&L live in the table's aria-label */}
      <div role="row" className={cn("grid gap-2 px-3 pb-2", COLS)}>
        {head("symbol", "Market", true)}
        {head("value", "Size")}
        {head(null, "Entry / mark")}
        {head("away", "Liquidation")}
        {head("pnl", "Unrealised P&L")}
        <span role="columnheader" className="sr-only">
          Close
        </span>
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
              className="overflow-hidden"
              exit={rowExit(reduced)}
              transition={{ layout: { duration: 0.25, ease: SMOOTH } }}
            >
            <div
              role="row"
              onPointerEnter={() => setHover(id)}
              onFocus={() => setHover(id)}
              onBlur={() => setHover(null)}
              className="group border-t border-foreground/[0.04] transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.03]"
              style={{
                opacity: dim ? 0.45 : 1,
                /* the closed row washes in the colour of what it made or lost */
                background: closing === id ? rowWash(pnl >= 0 ? GREEN : RED) : undefined,
              }}
            >
              <motion.div
                className={cn("grid items-center gap-2 px-3 py-2", COLS)}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
              >
                <span role="cell" className="flex min-w-0 items-center gap-2">
                  {renderIcon && (
                    <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center">
                      {renderIcon(p.symbol, 24)}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[12px] font-semibold text-foreground/90">{p.symbol}</span>
                    <span className="text-[10px] font-medium" style={{ color: ink(hue) }}>
                      {p.side === "long" ? "Long" : "Short"} {p.leverage}×
                    </span>
                  </span>
                </span>
                <span role="cell" className="flex flex-col items-end gap-0.5">
                  <span className="text-[11px] text-foreground/90">{size(p.size)}</span>
                  <span className="text-[10.5px] text-foreground/60">{usd(valueOf(p))}</span>
                </span>
                <span role="cell" className="flex flex-col items-end gap-0.5">
                  <span className="text-[11px] text-foreground/60">{price(p.entry)}</span>
                  <span className="text-[11px] text-foreground/90">{price(p.mark)}</span>
                </span>
                <span role="cell" className="flex flex-col items-end gap-0.5">
                  <span className="text-[11px] text-foreground/90">{price(liqOf(p))}</span>
                  <span className="text-[10.5px] text-foreground/60">{awayOf(p).toFixed(1)}% away</span>
                </span>
                <span role="cell" className="flex flex-col items-end gap-0.5" style={{ color: ink(pnl >= 0 ? GREEN : RED) }}>
                  <span className="text-[11.5px] font-semibold">{signedUsd(pnl)}</span>
                  <span className="text-[10px]">{signedPct(marginOf(p) > 0 ? (pnl / marginOf(p)) * 100 : 0)}</span>
                </span>
                <span role="cell" className="flex justify-end">
                  <RowAction
                    done={closing === id}
                    disabled={closing !== null}
                    onClick={() => close(p)}
                    tone={ink(pnl >= 0 ? GREEN : RED)}
                    aria-label={closing === id ? `${p.symbol} ${p.side} closed` : `Close ${p.symbol} ${p.side}, ${signedUsd(pnl)}`}
                  />
                </span>
              </motion.div>
            </div>
            </motion.div>
          )
        })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {open.length === 0 && (
          <motion.div
            role="status"
            className="flex flex-col items-center gap-3 border-t border-foreground/[0.04] px-3 pt-4 text-center text-[11px] text-foreground/60"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE, delay: reduced ? 0 : 0.3 }}
          >
            No open positions
            {resettable && (
              <button type="button" onClick={() => setClosed([])} className={cn(BUTTON, "h-7 px-3 text-[11.5px]")}>
                Reset
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
