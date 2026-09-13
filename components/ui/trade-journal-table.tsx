"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"

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

const COLS = "96px minmax(0,1fr) 52px 64px 84px 84px 72px"
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
const tint = (c: string, pct = 10) => `color-mix(in srgb, ${c} ${pct}%, transparent)`

/** outcome pill, in the fills-blotter shape: a check for a win, a cross for a loss, a dot while open */
function StatusPill({ status }: { status: TradeOutcome }) {
  const color = status === "Win" ? GREEN : status === "Loss" ? RED : undefined
  return (
    <span className="flex justify-end">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium leading-[1.6]",
          status === "Open" && "border-foreground/[0.08] bg-foreground/[0.03] text-foreground/60",
        )}
        style={color ? { color, borderColor: tint(color, 22), background: tint(color, 10) } : undefined}
      >
        {status === "Open" && <span className="h-[5px] w-[5px] rounded-full" style={{ background: GREEN }} />}
        {status === "Win" && <Check size={10} strokeWidth={3} />}
        {status === "Loss" && <X size={10} strokeWidth={3} />}
        {status}
      </span>
    </span>
  )
}

/**
 * Trade journal in the Ink register, drawn like the fills blotter: a card with
 * a title and trade count, one quiet column head, and rows that read date,
 * asset, side, size, entry, net P&L and outcome. The range control keeps the
 * trades opened within 7 or 30 days of the newest one. Net P&L carries its
 * formula in the tooltip: gross minus 0.05% of notional per side.
 */
export function TradeJournalTable({
  rows = DEFAULT_ROWS,
  title = "Trade journal",
  className,
}: {
  rows?: JournalRow[]
  title?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const [range, setRange] = useState<Range>("All")

  const newest = Math.max(...rows.map((r) => Date.parse(r.at)))
  const days = RANGES.find((r) => r.label === range)!.days
  const shown = [...rows]
    .filter((r) => newest - Date.parse(r.at) <= days * DAY_MS)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

  return (
    <div
      className={cn("w-full max-w-[640px] overflow-hidden rounded-2xl border border-foreground/[0.06]", className)}
      style={{ background: "var(--card)", boxShadow: "0 16px 36px color-mix(in srgb, var(--foreground) 6%, transparent)" }}
    >
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-[15px] font-medium leading-tight text-foreground/90">{title}</h3>
          <span className="text-[11.5px] tabular-nums text-foreground/45">
            {shown.length} {shown.length === 1 ? "trade" : "trades"}
          </span>
        </div>
        <div aria-label="Range" className="flex items-center gap-0.5 rounded-full bg-foreground/[0.03] p-[3px]" role="radiogroup">
          {RANGES.map(({ label }) => {
            const on = label === range
            return (
              <button
                aria-checked={on}
                className={cn(
                  "relative h-6 rounded-full px-2.5 text-[11px] font-medium tabular-nums transition-colors duration-200",
                  on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/70",
                )}
                key={label}
                onClick={() => setRange(label)}
                role="radio"
                type="button"
              >
                {on && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-foreground/[0.08]"
                    layoutId="journal-range"
                    transition={reduced ? { duration: 0 } : { duration: 0.25, ease: EASE }}
                  />
                )}
                <span className="relative">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-3 border-b border-foreground/[0.06] px-4 pb-2 text-[10px] text-foreground/45" style={{ gridTemplateColumns: COLS }}>
        <span>Date</span>
        <span>Asset</span>
        <span>Side</span>
        <span className="text-right">Size</span>
        <span className="text-right">Entry</span>
        <span className="text-right">Net P&amp;L</span>
        <span className="text-right">Status</span>
      </div>

      <div>
        {shown.map((r) => {
          const open = r.status === "Open"
          const n = net(r)
          const side = r.side === "Long" ? GREEN : RED
          return (
            <div
              className="grid items-center gap-3 border-b border-foreground/[0.04] px-4 py-2.5 transition-colors duration-150 last:border-b-0 hover:bg-foreground/[0.025]"
              key={r.id}
              style={{ gridTemplateColumns: COLS }}
            >
              <span className="whitespace-nowrap text-[11px] tabular-nums text-foreground/45">{fmtDate(r.at)}</span>
              <span className="truncate text-[12.5px] font-semibold text-foreground/85">{r.asset}</span>
              <span>
                <span className="inline-block rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-medium leading-[1.5]" style={{ color: side, background: tint(side, 10) }}>
                  {r.side}
                </span>
              </span>
              <span className="text-right text-[12px] tabular-nums text-foreground/85">{r.qty.toFixed(4)}</span>
              <span className="text-right text-[12px] tabular-nums text-foreground/85">{r.entry.toLocaleString("en-US")}</span>
              {/* net = gross − fees; fees = 0.05% of notional per side */}
              <span
                className={cn("text-right text-[12px] font-medium tabular-nums", open && "text-foreground/45")}
                style={{ color: open ? undefined : n < 0 ? RED : GREEN }}
                title={`gross ${r.pnl === null ? "0.00" : r.pnl.toFixed(2)} − fees ${fees(r).toFixed(2)} (0.05% × ${money(r.notional, 0)} × ${open ? 1 : 2} sides)`}
              >
                {open ? `−${money(fees(r))}` : signed(n)}
              </span>
              <StatusPill status={r.status} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
