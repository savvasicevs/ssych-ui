"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, Pause, Play, X } from "lucide-react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

/** the visual-regression runner freezes every feed */
const isSnapshot = () => typeof navigator !== "undefined" && /\bChromatic\b/.test(navigator.userAgent)

export type FillEvent = {
  id: string
  /** wall-clock label, already formatted (deterministic feed) */
  time: string
  symbol: string
  side: "buy" | "sell"
  qty: number
  price: number
  /** ms after arrival when the working order resolves */
  resolveMs: number
  outcome: "filled" | "rejected"
  venue: string
  orderId: string
  fee: number
}

type Status = "working" | "filled" | "rejected"
type Row = { key: string; ev: FillEvent; status: Status }

/** deterministic demo feed — replayed in order, never randomized */
const DEFAULT_EVENTS: FillEvent[] = [
  { id: "f01", time: "14:29:47", symbol: "AAPL", side: "buy", qty: 200, price: 229.41, resolveMs: 2400, outcome: "filled", venue: "NASDAQ", orderId: "ord-84121", fee: 1.04 },
  { id: "f02", time: "14:30:02", symbol: "NVDA", side: "sell", qty: 50, price: 1189.2, resolveMs: 2000, outcome: "filled", venue: "ARCA", orderId: "ord-84127", fee: 2.31 },
  { id: "f03", time: "14:30:18", symbol: "TSLA", side: "buy", qty: 120, price: 244.87, resolveMs: 3000, outcome: "rejected", venue: "IEX", orderId: "ord-84130", fee: 0 },
  { id: "f04", time: "14:30:31", symbol: "MSFT", side: "buy", qty: 80, price: 428.55, resolveMs: 2200, outcome: "filled", venue: "NASDAQ", orderId: "ord-84133", fee: 0.86 },
  { id: "f05", time: "14:30:49", symbol: "AMZN", side: "sell", qty: 150, price: 186.12, resolveMs: 2600, outcome: "filled", venue: "EDGX", orderId: "ord-84139", fee: 1.12 },
  { id: "f06", time: "14:31:04", symbol: "META", side: "buy", qty: 60, price: 512.3, resolveMs: 2200, outcome: "filled", venue: "NASDAQ", orderId: "ord-84142", fee: 0.77 },
  { id: "f07", time: "14:31:19", symbol: "SPY", side: "sell", qty: 300, price: 549.66, resolveMs: 2800, outcome: "filled", venue: "ARCA", orderId: "ord-84150", fee: 4.12 },
  { id: "f08", time: "14:31:35", symbol: "COIN", side: "buy", qty: 40, price: 231.09, resolveMs: 3200, outcome: "rejected", venue: "MEMX", orderId: "ord-84154", fee: 0 },
  { id: "f09", time: "14:31:52", symbol: "GOOG", side: "buy", qty: 90, price: 176.44, resolveMs: 2200, outcome: "filled", venue: "NASDAQ", orderId: "ord-84158", fee: 0.63 },
  { id: "f10", time: "14:32:08", symbol: "AMD", side: "sell", qty: 220, price: 158.9, resolveMs: 2600, outcome: "filled", venue: "BATS", orderId: "ord-84163", fee: 1.4 },
  { id: "f11", time: "14:32:24", symbol: "NFLX", side: "buy", qty: 25, price: 689.75, resolveMs: 2400, outcome: "filled", venue: "IEX", orderId: "ord-84169", fee: 0.51 },
  { id: "f12", time: "14:32:41", symbol: "QQQ", side: "sell", qty: 180, price: 481.23, resolveMs: 3000, outcome: "rejected", venue: "EDGX", orderId: "ord-84174", fee: 0 },
  { id: "f13", time: "14:32:57", symbol: "PLTR", side: "buy", qty: 500, price: 28.64, resolveMs: 2000, outcome: "filled", venue: "MEMX", orderId: "ord-84180", fee: 1.9 },
  { id: "f14", time: "14:33:12", symbol: "ORCL", side: "sell", qty: 110, price: 141.37, resolveMs: 2600, outcome: "filled", venue: "NYSE", orderId: "ord-84186", fee: 0.94 },
]

const COLS = "66px minmax(0,1fr) 56px 64px 84px 104px"
const SEED = 5 // rows already resolved on screen at load
const DAY_BASE = 18 // fills settled before the visible window (count = DAY_BASE + seed + streamed)
const MAX_ROWS = 18

const sideColor = (s: FillEvent["side"]) => (s === "buy" ? GREEN : RED)
const tint = (c: string, pct = 10) => `color-mix(in srgb, ${c} ${pct}%, transparent)`

/** status pill — crossfades content in place on status flips (row never remounts) */
function StatusPill({ status, frozen }: { status: Status; frozen: boolean }) {
  const color = status === "filled" ? GREEN : status === "rejected" ? RED : undefined
  return (
    <span className="flex justify-end">
      <motion.span
        key={status}
        initial={frozen ? false : { opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={frozen ? { duration: 0 } : { duration: 0.3, ease: EASE }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium leading-[1.6]",
          status === "working" && "border-foreground/[0.08] bg-foreground/[0.03] text-foreground/45",
        )}
        style={color ? { color, borderColor: tint(color, 22), background: tint(color, 10) } : undefined}
      >
        {status === "working" && (
          <motion.span
            className="h-[5px] w-[5px] rounded-full bg-foreground/45"
            animate={frozen ? undefined : { opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        {status === "filled" && <Check size={10} strokeWidth={3} />}
        {status === "rejected" && <X size={10} strokeWidth={3} />}
        {status === "working" ? "Working" : status === "filled" ? "Filled" : "Rejected"}
      </motion.span>
    </span>
  )
}

function FillRow({ row, hovered, onHover, frozen }: { row: Row; hovered: boolean; onHover: (key: string | null) => void; frozen: boolean }) {
  const { ev, status } = row
  const side = sideColor(ev.side)
  const flashColor = status === "rejected" ? RED : GREEN
  return (
    <motion.div
      layout={frozen ? false : "position"}
      initial={frozen ? false : { opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={frozen ? { duration: 0 } : { duration: 0.45, ease: EASE }}
      className="relative border-b border-foreground/[0.04] last:border-b-0"
      onMouseEnter={() => onHover(row.key)}
      onMouseLeave={() => onHover(null)}
    >
      {/* status-flip tint flash — opacity keyframes over a static tint, no remount */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: tint(flashColor, 9) }}
        initial={false}
        animate={status}
        variants={{
          working: { opacity: 0 },
          filled: frozen ? { opacity: 0 } : { opacity: [0, 1, 0], transition: { duration: 0.9, ease: "easeOut" } },
          rejected: frozen ? { opacity: 0 } : { opacity: [0, 1, 0], transition: { duration: 0.7, ease: "easeOut" } },
        }}
      />
      <motion.div
        initial={false}
        animate={status}
        variants={{
          working: { x: 0 },
          filled: { x: 0 },
          rejected: frozen ? { x: 0 } : { x: [0, -5, 5, -3, 3, 0], transition: { duration: 0.45 } },
        }}
        className="grid items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-foreground/[0.025]"
        style={{ gridTemplateColumns: COLS }}
      >
        <span className="text-[11px] tabular-nums tracking-[0.02em] text-foreground/45">{ev.time}</span>
        <span className="truncate text-[12.5px] font-semibold text-foreground/85">{ev.symbol}</span>
        <span>
          <span className="inline-block rounded-[6px] px-1.5 py-0.5 text-[10.5px] font-medium leading-[1.5]" style={{ color: side, background: tint(side, 10) }}>
            {ev.side === "buy" ? "Buy" : "Sell"}
          </span>
        </span>
        <span className="text-right text-[12px] tabular-nums text-foreground/85">{ev.qty.toLocaleString("en-US")}</span>
        <span className="text-right text-[12px] tabular-nums text-foreground/85">{ev.price.toFixed(2)}</span>
        <StatusPill status={status} frozen={frozen} />
      </motion.div>
      <AnimatePresence initial={false}>
        {hovered && (
          <motion.div
            data-detail
            initial={frozen ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={frozen ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 40 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 pb-2.5 pl-[78px] text-[10.5px] tabular-nums text-foreground/45">
              <span>{ev.venue}</span>
              <span className="opacity-40">·</span>
              <span>{ev.orderId}</span>
              <span className="opacity-40">·</span>
              <span>fee ${ev.fee.toFixed(2)}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/**
 * Streaming order-fills table in the Ink register. New fills enter at the top
 * with a slide-down that pushes older rows down, arrive as working with a
 * pulsing dot, then resolve in place to filled (green check, a brief row tint)
 * or rejected (red, a brief shake) after a deterministic per-event delay. The
 * list is height-capped with soft fades at both edges; hovering a row unfolds
 * a slim detail line (venue, order id, fee). The feed is a fixed event array
 * replayed on an interval, pausable from the header, and fully still under
 * reduced motion. The "today" count is derivable: settled before the window,
 * plus the seeded rows, plus every arrival since.
 */
export function FillsBlotter({
  title = "Fills",
  events = DEFAULT_EVENTS,
  intervalMs = 1800,
  className,
}: {
  title?: string
  events?: FillEvent[]
  /** ms between arrivals */
  intervalMs?: number
  className?: string
}) {
  const frozen = (useReducedMotion() ?? false) || isSnapshot()
  const seedCount = Math.min(SEED, events.length)
  const [rows, setRows] = useState<Row[]>(() =>
    events
      .slice(0, seedCount)
      .map((ev): Row => ({ key: ev.id, ev, status: ev.outcome }))
      .reverse(),
  )
  const [streamed, setStreamed] = useState(0)
  const [playing, setPlaying] = useState(!frozen)
  const [hovered, setHovered] = useState<string | null>(null)
  const ptrRef = useRef(seedCount)
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    if (frozen || !playing) return
    const iv = setInterval(() => {
      const ptr = ptrRef.current
      ptrRef.current += 1
      const ev = events[ptr % events.length]
      const key = `${ev.id}·${Math.floor(ptr / events.length)}`
      setRows((rs) => [{ key, ev, status: "working" as Status }, ...rs].slice(0, MAX_ROWS))
      setStreamed((n) => n + 1)
      const to = setTimeout(() => {
        timeoutsRef.current.delete(to)
        setRows((rs) => rs.map((r) => (r.key === key ? { ...r, status: ev.outcome } : r)))
      }, ev.resolveMs)
      timeoutsRef.current.add(to)
    }, intervalMs)
    return () => clearInterval(iv)
  }, [frozen, playing, intervalMs, events])

  useEffect(() => {
    const pending = timeoutsRef.current
    return () => pending.forEach(clearTimeout)
  }, [])

  return (
    <div
      className={cn("w-full max-w-[640px] overflow-hidden rounded-2xl border border-foreground/[0.06]", className)}
      style={{ background: "var(--card)" }}
    >
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-[15px] font-medium leading-tight text-foreground/90">{title}</h3>
          {/* derivable: DAY_BASE settled earlier + seed rows + streamed arrivals */}
          <span className="text-[11.5px] tabular-nums text-foreground/45" title={`${DAY_BASE} settled before this window + ${seedCount} seeded + ${streamed} arrived`}>
            {DAY_BASE + seedCount + streamed} today
          </span>
        </div>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause feed" : "Resume feed"}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] border border-foreground/[0.08] bg-foreground/[0.03] text-foreground/45 transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground/80"
        >
          {playing ? <Pause size={11} fill="currentColor" strokeWidth={0} /> : <Play size={11} fill="currentColor" strokeWidth={0} />}
        </button>
      </div>
      <div className="grid gap-3 border-b border-foreground/[0.06] px-4 pb-2 text-[10px] text-foreground/45" style={{ gridTemplateColumns: COLS }}>
        <span>Time</span>
        <span>Symbol</span>
        <span>Side</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Price</span>
        <span className="text-right">Status</span>
      </div>
      <div
        className="overflow-y-auto"
        style={{
          maxHeight: 360,
          WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%)",
          maskImage: "linear-gradient(180deg, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%)",
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((row) => (
            <FillRow key={row.key} row={row} hovered={hovered === row.key} onHover={setHovered} frozen={frozen} />
          ))}
        </AnimatePresence>
        {/* bottom breathing room so the last row clears the mask fade */}
        <div className="h-5" />
      </div>
    </div>
  )
}
