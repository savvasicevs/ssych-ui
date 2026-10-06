"use client"

import { useEffect, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { SegmentedControl } from "@/components/ui/segmented-control"

/* Trade Journal Table, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card, outline or drop shadow: rows sit on the page and part by one hairline
   · the title is plain 13px text, not a heading tag; the page owns the headings
   · the side and the outcome lost their pills, and the check and cross icons with their
     3px strokes are gone. Long and short are coloured words, and so is the outcome: a
     win is green and a loss red (2026-09-30, the pass and fail colour came back)
   · the net P&L formula moved out of a browser tooltip into the line under the table,
     where pointing at a row, or tabbing to it, writes it out; at rest that line sums the
     net of the trades on screen
   · pointing at a row dims the others
   · the range switcher is the quiet pill: 28px tall, one sliding fill at 8% ink
   2026-10-02 audit: the line under the table no longer sums the trades at rest; it reads
   only the pointed row's formula, wraps to a second line inside a fixed two line height so
   a long formula is never cut, and keeps its height empty at rest (the net total and the
   count stay in the aria-label). The count beside the title is gone. The range switch is
   the shared SegmentedControl. Heads are 10.5px /45 and sort on a click, the sorted one /90
   with a chevron, date (newest first) by default. An open trade shows an en dash under
   Net P&L, since it has no net yet; its entry fee is in its pointed formula.
   Formulas:
   · fees  0.05% × notional per side: 2 sides on a closed trade, 1 on an open one
   · net   gross P&L − fees (closed trades)
   · range the trades opened within 7 or 30 days of the newest one */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export type TradeSide = "Long" | "Short"
export type TradeOutcome = "Open" | "Win" | "Loss"

export interface JournalRow {
  id: string
  /** ISO date; shown as "Aug 23, 15:09" */
  at: string
  asset: string
  side: TradeSide
  /** position size in units and its notional in $ */
  qty: number
  notional: number
  entry: number
  exit: number | null
  /** gross P&L in $; null while open */
  pnl: number | null
  /** slippage in % of notional */
  slippage: number
  /** hold time in minutes; null while open */
  holdMin: number | null
  status: TradeOutcome
}

/* fees are one flat rule so net is always derivable: net = gross − 0.05% of
   notional per side (two sides on a closed trade, one on an open one) */
const FEE_RATE = 0.0005
const fees = (r: JournalRow) => r.notional * FEE_RATE * (r.status === "Open" ? 1 : 2)
const net = (r: JournalRow) => (r.pnl ?? 0) - fees(r)

const DEFAULT_ROWS: JournalRow[] = [
  { id: "t-1041877-6", at: "2026-08-23T15:09:00", asset: "BTC", side: "Long", qty: 0.1546, notional: 11951, entry: 77288, exit: null, pnl: null, slippage: 0, holdMin: null, status: "Open" },
  { id: "t-1041877-5", at: "2026-07-30T11:22:00", asset: "BTC", side: "Long", qty: 0.08, notional: 5167, entry: 64590, exit: 72660, pnl: 645.6, slippage: 0, holdMin: 1445, status: "Win" },
  { id: "t-1041877-4", at: "2026-07-27T16:11:00", asset: "BTC", side: "Short", qty: 0.05, notional: 3261, entry: 65220, exit: 64914, pnl: 15.3, slippage: 0.292, holdMin: 16, status: "Win" },
  { id: "t-1041877-3", at: "2026-07-20T17:27:00", asset: "BTC", side: "Short", qty: 0.02, notional: 1298, entry: 64890, exit: 65963, pnl: -21.46, slippage: 0, holdMin: 966, status: "Loss" },
  { id: "t-1041877-2", at: "2026-07-20T16:18:00", asset: "BTC", side: "Long", qty: 0.06, notional: 3884, entry: 64734, exit: 65000, pnl: 15.96, slippage: 0, holdMin: 887, status: "Win" },
]

/** a range keeps the trades opened within that many days of the newest one */
const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "All", days: Infinity },
] as const
type Range = (typeof RANGES)[number]["label"]

const COLS = "96px minmax(0,1fr) 52px 64px 84px 84px 56px"
const DAY_MS = 86_400_000

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function fmtDate(iso: string) {
  const [d, t] = iso.split("T")
  const [, m, day] = d.split("-").map(Number)
  return `${MONTHS[m - 1]} ${day}, ${t.slice(0, 5)}`
}
const money = (n: number, dp = 2) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
const signed = (n: number) => `${n < 0 ? "−" : "+"}${money(n)}`

/** the formula behind one row's net, written out with its inputs */
const formula = (r: JournalRow) =>
  r.status === "Open"
    ? `fees so far ${money(fees(r))} = 0.05% × ${money(r.notional, 0)} × 1 side, net when it closes`
    : `gross ${signed(r.pnl ?? 0)} − fees ${money(fees(r))} (0.05% × ${money(r.notional, 0)} × 2 sides)`

type SortKey = "date" | "asset" | "side" | "size" | "entry" | "net" | "status"
const SORT_VALUE: Record<SortKey, (r: JournalRow) => number | string> = {
  date: (r) => Date.parse(r.at),
  asset: (r) => r.asset,
  side: (r) => r.side,
  size: (r) => r.qty,
  entry: (r) => r.entry,
  /* an open trade has no net yet: it sorts below every closed one */
  net: (r) => (r.status === "Open" ? -Infinity : net(r)),
  status: (r) => r.status,
}

/**
 * Trade journal in the Ink register: a title and a range switcher, one sortable column
 * head, and rows that read date, asset, side, size, entry, net P&L and outcome. The
 * range keeps the trades opened within 7 or 30 days of the newest one. Pointing at a
 * row dims the rest and writes its net P&L formula under the table: gross minus 0.05%
 * of notional per side.
 */
export function TradeJournalTable({
  rows = DEFAULT_ROWS,
  title = "Trade journal",
  renderIcon,
  className,
}: {
  rows?: JournalRow[]
  title?: string
  /** draws an asset's mark (a token or company logo) before its name (2026-10-06); none left out */
  renderIcon?: (symbol: string, size: number) => ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const [range, setRange] = useState<Range>("All")
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 })
  const [hot, setHot] = useState<string | null>(null)
  /* rows rise in once on mount, 40ms apart and capped at eight; after that a row that a
     range brings in rises alone and the hover dim is quick */
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLanded(true), reduced ? 0 : 8 * 40 + 320)
    return () => clearTimeout(t)
  }, [reduced])

  const newest = Math.max(...rows.map((r) => Date.parse(r.at)))
  const days = RANGES.find((r) => r.label === range)!.days
  const by = SORT_VALUE[sort.key]
  const shown = [...rows]
    .filter((r) => newest - Date.parse(r.at) <= days * DAY_MS)
    .sort((a, b) => {
      const x = by(a)
      const y = by(b)
      const c = typeof x === "string" ? x.localeCompare(String(y)) : x === y ? 0 : x < (y as number) ? -1 : 1
      /* ties fall back to the newest first */
      return c * sort.dir || Date.parse(b.at) - Date.parse(a.at)
    })
  /* the net of every trade on screen, each one gross minus its own fees */
  const total = shown.reduce((s, r) => s + net(r), 0)
  const count = `${shown.length} ${shown.length === 1 ? "trade" : "trades"}`
  const pointed = shown.find((r) => r.id === hot)

  const head = (key: SortKey, label: string, right = false) => {
    const on = sort.key === key
    return (
      <span role="columnheader" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="flex">
        <button
          type="button"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}
          aria-label={`Sort by ${label.toLowerCase()}`}
          className={cn(
            "flex w-full items-center gap-0.5 whitespace-nowrap rounded-full text-[10.5px] outline-none transition-colors duration-200",
            right && "justify-end",
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
    <div className={cn("w-full max-w-[640px] tabular-nums", className)} role="table" aria-label={`${title}, ${count}, net ${signed(total)} after fees`}>
      <div className="flex items-center justify-between px-3 pb-3">
        <span className="text-[13px] font-medium text-foreground/90">{title}</span>
        <SegmentedControl options={RANGES.map((r) => r.label)} value={range} onChange={(v) => setRange(v as Range)} />
      </div>

      <div role="row" className="grid gap-3 border-b border-foreground/[0.04] px-3 pb-2" style={{ gridTemplateColumns: COLS }}>
        {head("date", "Date")}
        {head("asset", "Asset")}
        {head("side", "Side")}
        {head("size", "Size", true)}
        {head("entry", "Entry", true)}
        {head("net", "Net P&L", true)}
        {head("status", "Status", true)}
      </div>

      <div role="rowgroup" onPointerLeave={() => setHot(null)}>
        {shown.map((r, i) => {
          const open = r.status === "Open"
          const n = net(r)
          const dim = hot !== null && hot !== r.id
          return (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: dim ? 0.45 : 1, y: 0 }}
              transition={
                reduced
                  ? { duration: 0.2 }
                  : landed
                    ? { duration: 0.2, ease: EASE }
                    : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.04 }
              }
              role="row"
              tabIndex={0}
              onPointerEnter={() => setHot(r.id)}
              onFocus={() => setHot(r.id)}
              onBlur={() => setHot(null)}
              className="grid items-center gap-3 border-b border-foreground/[0.04] px-3 py-2.5 outline-none transition-[background-color] duration-200 hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.06]"
              key={r.id}
              style={{ gridTemplateColumns: COLS }}
            >
              <span role="cell" className="whitespace-nowrap text-[11px] text-foreground/60">
                {fmtDate(r.at)}
              </span>
              <span role="cell" className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-foreground/90">
                {renderIcon && <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center">{renderIcon(r.asset, 20)}</span>}
                <span className="truncate">{r.asset}</span>
              </span>
              <span role="cell" className="text-[11px] font-medium" style={{ color: r.side === "Long" ? GREEN : RED }}>
                {r.side}
              </span>
              <span role="cell" className="text-right text-[12px] text-foreground/90">
                {r.qty.toFixed(4)}
              </span>
              <span role="cell" className="text-right text-[12px] text-foreground/90">
                {r.entry.toLocaleString("en-US")}
              </span>
              {/* net = gross − fees; fees = 0.05% of notional per side */}
              <span
                role="cell"
                className={cn("text-right text-[12px] font-medium", open && "text-foreground/45")}
                style={{ color: open ? undefined : n < 0 ? RED : GREEN }}
              >
                {open ? "–" : signed(n)}
              </span>
              {/* the outcome is a pass or a fail: win in green, loss in red, open stays muted */}
              <span
                role="cell"
                className={cn("text-right text-[11px]", open && "text-foreground/45")}
                style={{ color: open ? undefined : r.status === "Win" ? GREEN : RED }}
              >
                {r.status}
              </span>
            </motion.div>
          )
        })}
      </div>

      {/* the pointed row's formula only; two lines tall so a long one wraps and is never
          cut, and empty at rest (2026-10-02 audit). It swaps in place when the row changes */}
      <div role="status" className="h-[38px] px-3 pt-2 text-[10.5px] leading-[15px] text-foreground/60">
        {pointed ? (
          <motion.span
            key={pointed.id}
            className="block"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            {pointed.status === "Open" ? (
              <>
                <span className="font-medium text-foreground/90">open</span> {formula(pointed)}
              </>
            ) : (
              <>
                <span className="font-medium text-foreground/90">net {signed(net(pointed))}</span> = {formula(pointed)}
              </>
            )}
          </motion.span>
        ) : (
          <span aria-hidden>&nbsp;</span>
        )}
      </div>
    </div>
  )
}
