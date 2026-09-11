"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight, ChevronsUpDown, NotebookPen } from "lucide-react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const INK = "var(--foreground)"

export type TradeSide = "Long" | "Short"
export type TradeOutcome = "Open" | "Win" | "Loss"

export interface JournalRow {
  id: string
  /** ISO date; shown as "Aug 23, 2026, 15:09" */
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

const RANGES = ["7D", "30D", "All time"] as const
type Range = (typeof RANGES)[number]

type SortKey = "at" | "asset" | "side" | "qty" | "entry" | "pnl" | "slippage" | "net" | "holdMin" | "status"
const COLS: { key: SortKey; label: string }[] = [
  { key: "at", label: "Date" },
  { key: "asset", label: "Asset" },
  { key: "side", label: "Side" },
  { key: "qty", label: "Size" },
  { key: "entry", label: "Entry / Exit" },
  { key: "pnl", label: "P&L" },
  { key: "slippage", label: "Slippage" },
  { key: "net", label: "Net P&L" },
  { key: "holdMin", label: "Hold" },
  { key: "status", label: "Status" },
]

/* ten columns when the card has room; under 768px of container the slippage
   and hold columns step out and the grid closes up, so the table never crushes */
const GRID =
  "grid items-center gap-3 grid-cols-[136px_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,0.8fr)_minmax(0,0.85fr)_minmax(0,0.75fr)_64px] @max-3xl:grid-cols-[124px_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_64px]"
const NARROW_HIDDEN = new Set<SortKey>(["slippage", "holdMin"])

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function fmtDate(iso: string) {
  const [d, t] = iso.split("T")
  const [y, m, day] = d.split("-").map(Number)
  return `${MONTHS[m - 1]} ${day}, ${y}, ${t.slice(0, 5)}`
}
const money = (n: number, dp = 2) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
const signed = (n: number) => `${n < 0 ? "−" : "+"}${money(n)}`
function hold(min: number | null) {
  if (min === null) return "—"
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

/** coin disc: the bitcoin mark for BTC, a two-letter monogram for anything
 *  else. Self-contained so the file installs on its own. */
const COIN_COLORS: Record<string, string> = { BTC: "var(--coin-btc, #f7931a)", ETH: "#627eea", SOL: "#9945ff" }
function Coin({ symbol, size = 18 }: { symbol: string; size?: number }) {
  const s = symbol.toUpperCase()
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: COIN_COLORS[s] ?? "color-mix(in srgb, var(--foreground) 55%, transparent)", fontSize: Math.round(size * 0.36) }}
    >
      {s === "BTC" ? (
        // the canonical mark leans ~14 degrees
        <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" style={{ transform: "rotate(14deg)" }}>
          <path d="M9 5v14M9 5h5a3 3 0 0 1 0 6H9m0 0h6a3 3 0 0 1 0 6H9M11 3v2M14 3v2M11 19v2M14 19v2" />
        </svg>
      ) : (
        s.slice(0, 2)
      )}
    </span>
  )
}

/** outcome pill: a soft vertical gradient in the outcome's hue, hairlined in
 *  the same hue — the "lit" feeling comes from the top being a touch brighter */
function Pill({ status }: { status: TradeOutcome }) {
  const hue = status === "Win" ? GREEN : status === "Loss" ? RED : INK
  const strength = status === "Open" ? [10, 4, 18] : [22, 8, 32]
  return (
    <span
      className={cn("inline-flex h-[20px] items-center justify-center rounded-full px-2.5 text-[10.5px] font-medium tabular-nums", status === "Open" && "text-foreground/80")}
      style={{
        color: status === "Open" ? undefined : hue,
        background: `linear-gradient(180deg, color-mix(in srgb, ${hue} ${strength[0]}%, transparent), color-mix(in srgb, ${hue} ${strength[1]}%, transparent))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue} ${strength[2]}%, transparent), inset 0 1px 0 0 color-mix(in srgb, ${hue} 14%, transparent)`,
      }}
    >
      {status}
    </span>
  )
}

/**
 * Trade journal in the Ink register: a trade log where the one open position
 * is lit and every closed one is judged. The open row carries an accent spine
 * and a green wash that fades out across the first columns, so the eye lands
 * on the trade still moving before it reads anything. Closed rows settle into
 * outcome pills, win or loss, each a soft vertical gradient in its own hue
 * with a hairline of the same hue. Column heads sort on click; the range
 * control's thumb slides, it does not spring; the pager shows the first five
 * pages and the last. Net P&L carries its formula in the tooltip.
 */
export function TradeJournalTable({
  rows = DEFAULT_ROWS,
  title = "Trading Journal",
  context = { name: "$50K Challenge", ref: "#1041877", phase: "Phase 1" },
  pages = 12,
  className,
}: {
  rows?: JournalRow[]
  title?: string
  /** the challenge chip above the card; pass null to drop it */
  context?: { name: string; ref: string; phase: string } | null
  pages?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const [range, setRange] = useState<Range>("7D")
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "at", dir: -1 })
  const [page, setPage] = useState(1)
  const [hot, setHot] = useState<string | null>(null)

  const val = (r: JournalRow, k: SortKey): number | string =>
    k === "net" ? net(r) : k === "at" ? r.at : ((r[k] ?? -Infinity) as number | string)
  const sorted = [...rows].sort((a, b) => {
    const x = val(a, sort.key)
    const y = val(b, sort.key)
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
  })
  const toggle = (k: SortKey) => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }))

  /* the pager shows the first five and the last */
  const pageNos = pages <= 6 ? Array.from({ length: pages }, (_, i) => i + 1) : [1, 2, 3, 4, 5, 0, pages]
  const slide = reduced ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const }

  return (
    <div className={cn("flex w-full max-w-[800px] flex-col items-center gap-4", className)}>
      {context && (
        <div className="inline-flex items-center gap-2.5 rounded-full border border-foreground/[0.06] bg-foreground/[0.04] py-1.5 pl-3 pr-2.5 text-[12px]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
          <span className="font-medium text-foreground/85">{context.name}</span>
          <span className="tabular-nums text-foreground/45">{context.ref}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
            style={{ color: GREEN, background: `color-mix(in srgb, ${GREEN} 12%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${GREEN} 28%, transparent)` }}
          >
            {context.phase}
          </span>
        </div>
      )}

      <div
        className="@container w-full overflow-hidden rounded-xl border border-foreground/[0.06]"
        style={{ background: "var(--card)", boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)" }}
      >
        {/* header: title left, the range control right */}
        <div className="flex items-center gap-3 border-b border-foreground/[0.06] px-4 py-3">
          <span className="grid h-6 w-6 place-items-center rounded-md border border-foreground/[0.08] text-foreground/45">
            <NotebookPen size={13} strokeWidth={1.75} />
          </span>
          <span className="text-[13px] font-medium text-foreground/85">{title}</span>
          <div aria-label="Range" className="relative ms-auto inline-flex rounded-lg bg-foreground/[0.03] p-[3px]" role="radiogroup">
            {RANGES.map((r) => {
              const on = r === range
              return (
                <button
                  aria-checked={on}
                  className={cn(
                    "relative z-10 h-6 rounded-md px-2.5 text-[11px] font-medium tabular-nums transition-colors duration-200",
                    on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/70",
                  )}
                  key={r}
                  onClick={() => setRange(r)}
                  role="radio"
                  type="button"
                >
                  {on && (
                    /* sliding tabs deliberately do not spring */
                    <motion.span
                      className="absolute inset-0 -z-10 rounded-md border border-foreground/[0.06] bg-foreground/[0.08]"
                      layoutId="journal-range"
                      transition={slide}
                    />
                  )}
                  {r}
                </button>
              )
            })}
          </div>
        </div>

        {/* column heads — each a real button, each sortable */}
        <div className={cn(GRID, "border-b border-foreground/[0.06] px-4 py-2")}>
          {COLS.map((c) => {
            const on = sort.key === c.key
            return (
              <button
                aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                className={cn(
                  "inline-flex items-center gap-1 whitespace-nowrap text-[10.5px] transition-colors duration-150",
                  on ? "text-foreground/85" : "text-foreground/45 hover:text-foreground/65",
                  NARROW_HIDDEN.has(c.key) && "@max-3xl:hidden",
                )}
                key={c.key}
                onClick={() => toggle(c.key)}
                type="button"
              >
                {c.label}
                <ChevronsUpDown className="transition-opacity duration-150" size={11} strokeWidth={1.75} style={{ opacity: on ? 0.9 : 0.4 }} />
              </button>
            )
          })}
        </div>

        <div className="relative">
          {sorted.map((r, i) => {
            const open = r.status === "Open"
            const n = net(r)
            const isHot = hot === r.id
            return (
              <div
                className={cn(GRID, "relative px-4 py-3", i > 0 && "border-t border-foreground/[0.04]")}
                key={r.id}
                onPointerEnter={() => setHot(r.id)}
                onPointerLeave={() => setHot(null)}
              >
                {/* THE GRADIENT: the open row is lit from its spine, a wash that
                    is gone by the fourth column — the light belongs to the
                    position still moving. Hover borrows the same wash in ink. */}
                {open && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-full"
                    style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${GREEN} 13%, transparent), color-mix(in srgb, ${GREEN} 4%, transparent) 38%, transparent 62%)` }}
                  />
                )}
                {open && <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full" style={{ background: GREEN }} />}
                {isHot && !open && (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    layoutId="journal-hover"
                    style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--foreground) 5%, transparent), transparent 70%)" }}
                    transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE }}
                  />
                )}

                <span className={cn("relative whitespace-nowrap text-[12px] tabular-nums", open ? "text-foreground/85" : "text-foreground/45")}>{fmtDate(r.at)}</span>
                <span className="relative flex items-center gap-2">
                  <Coin symbol={r.asset} />
                  <span className="text-[12px] font-medium text-foreground/85">{r.asset}</span>
                </span>
                <span className="relative text-[12px] font-medium" style={{ color: r.side === "Long" ? GREEN : RED }}>
                  {r.side}
                </span>
                <span className="relative flex flex-col leading-tight">
                  <span className="text-[12px] tabular-nums text-foreground/85">{r.qty.toFixed(4)}</span>
                  <span className="text-[10.5px] tabular-nums text-foreground/45">{money(r.notional, 0)}</span>
                </span>
                <span className="relative flex flex-col leading-tight">
                  <span className="text-[12px] tabular-nums text-foreground/85">{r.entry.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span className="text-[10.5px] tabular-nums text-foreground/45">{r.exit === null ? "—" : r.exit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </span>
                <span className={cn("relative text-[12px] font-medium tabular-nums", r.pnl === null && "text-foreground/45")} style={{ color: r.pnl === null ? undefined : r.pnl < 0 ? RED : GREEN }}>
                  {r.pnl === null ? "—" : signed(r.pnl)}
                </span>
                <span className={cn("relative text-[12px] tabular-nums @max-3xl:hidden", r.slippage ? "text-foreground/85" : "text-foreground/45")}>
                  {r.slippage ? `+${r.slippage.toFixed(3)}%` : "0.000%"}
                </span>
                {/* net = gross − fees; fees = 0.05% of notional per side, so the
                    number is re-derivable from the size column beside it */}
                <span
                  className={cn("relative text-[12px] font-medium tabular-nums", open && "text-foreground/45")}
                  style={{ color: open ? undefined : n < 0 ? RED : GREEN }}
                  title={`gross ${r.pnl === null ? "0.00" : r.pnl.toFixed(2)} − fees ${fees(r).toFixed(2)} (0.05% × ${money(r.notional, 0)} × ${open ? 1 : 2} sides)`}
                >
                  {open ? `−${money(fees(r))}` : signed(n)}
                </span>
                <span className="relative whitespace-nowrap text-[12px] tabular-nums text-foreground/45 @max-3xl:hidden">{hold(r.holdMin)}</span>
                <span className="relative flex justify-end">
                  <Pill status={r.status} />
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* the pager: first five, a gap, the last — the active page carries the
          same soft plate the range thumb does */}
      <nav aria-label="Pages" className="flex items-center gap-1.5">
        <button
          aria-label="Previous page"
          className="grid h-7 w-7 place-items-center rounded-full border border-foreground/[0.08] text-foreground/45 transition-colors duration-150 hover:text-foreground/80 disabled:pointer-events-none disabled:opacity-35"
          disabled={page === 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          type="button"
        >
          <ChevronLeft size={13} />
        </button>
        {pageNos.map((p, i) =>
          p === 0 ? (
            <span className="w-5 text-center text-[11px] text-foreground/45" key={`gap-${i}`}>
              …
            </span>
          ) : (
            <button
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "relative h-7 min-w-7 rounded-full px-2 text-[11px] tabular-nums transition-colors duration-150",
                p === page ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/75",
              )}
              key={p}
              onClick={() => setPage(p)}
              type="button"
            >
              {p === page && (
                <motion.span aria-hidden className="absolute inset-0 -z-10 rounded-full border border-foreground/[0.06] bg-foreground/[0.08]" layoutId="journal-page" transition={slide} />
              )}
              {String(p).padStart(2, "0")}
            </button>
          ),
        )}
        <button
          aria-label="Next page"
          className="grid h-7 w-7 place-items-center rounded-full border border-foreground/[0.08] text-foreground/45 transition-colors duration-150 hover:text-foreground/80 disabled:pointer-events-none disabled:opacity-35"
          disabled={page === pages}
          onClick={() => setPage((p) => Math.min(pages, p + 1))}
          type="button"
        >
          <ChevronRight size={13} />
        </button>
      </nav>
    </div>
  )
}
