"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Pause, Play } from "lucide-react"

import { cn } from "@/lib/utils"

/* Fills Blotter, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card or outline: rows sit on the page and part by one hairline
   · the title is plain 13px text, not a heading tag; the page owns the headings
   · the side and the status lost their pills, and the check and cross icons with their
     3px strokes are gone. Buy and sell are coloured words; a fill is green, a rejection is
     red, a working order is muted with its pulsing amber dot (colour pass, 2026-09-30)
   · the pause control is a round fill, not an outlined square. Its icon stays, it is the
     control's meaning
   · pointing at a row, or tabbing to it, keeps it full, dims the others and unfolds its
     detail line
   · the flash on a status flip and the row entrance settle in 400ms, the shake is smaller,
     the detail line unfolds on grid rows, not height
   · the count's formula moved out of a browser tooltip into the label a screen reader
     gets; the edge fades are cut from a token, not a hex */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const AMBER = "var(--chart-amber)"
/** the house smooth-out, for the unfold and the text swap */
const SMOOTH = "cubic-bezier(0.22, 1, 0.36, 1)"

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

/** deterministic demo feed, replayed in order, never randomized */
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

const COLS = "66px minmax(0,1fr) 56px 64px 84px 84px"
const SEED = 5 // rows already resolved on screen at load
const DAY_BASE = 18 // fills settled before the visible window (count = DAY_BASE + seed + streamed)
const MAX_ROWS = 18
/** the soft fade at both edges of the list */
const EDGE_FADE = "linear-gradient(180deg, transparent 0, var(--foreground) 26px, var(--foreground) calc(100% - 26px), transparent 100%)"

const sideColor = (s: FillEvent["side"]) => (s === "buy" ? GREEN : RED)
const tint = (c: string, pct = 10) => `color-mix(in srgb, ${c} ${pct}%, transparent)`
const STATUS_WORD: Record<Status, string> = { working: "Working", filled: "Filled", rejected: "Rejected" }

/** the status as a word; a flip is a text swap in place, 4px out of a 2px blur over 150ms
    (the row never remounts). Filled is green, rejected red, working muted with an amber dot */
function StatusWord({ status, frozen }: { status: Status; frozen: boolean }) {
  return (
    <span className="flex justify-end">
      <motion.span
        key={status}
        initial={frozen ? false : { opacity: 0, y: 4, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={frozen ? { duration: 0 } : { duration: 0.15, ease: EASE }}
        className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", status === "working" && "text-foreground/45")}
        style={status === "rejected" ? { color: RED } : status === "filled" ? { color: GREEN } : undefined}
      >
        {status === "working" && (
          <motion.span
            aria-hidden
            className="h-[5px] w-[5px] rounded-full"
            style={{ background: AMBER }}
            animate={frozen ? undefined : { opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        {STATUS_WORD[status]}
      </motion.span>
    </span>
  )
}

function FillRow({ row, hovered, dim, onHover, frozen }: { row: Row; hovered: boolean; dim: boolean; onHover: (key: string | null) => void; frozen: boolean }) {
  const { ev, status } = row
  const side = sideColor(ev.side)
  const flashColor = status === "rejected" ? RED : GREEN
  return (
    <motion.div
      layout={frozen ? false : "position"}
      initial={frozen ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={frozen ? { duration: 0 } : { duration: 0.4, ease: EASE }}
      className="relative border-b border-foreground/[0.05] outline-none focus-visible:bg-foreground/[0.06]"
      role="row"
      tabIndex={0}
      aria-label={`${ev.time} ${ev.side} ${ev.qty.toLocaleString("en-US")} ${ev.symbol} at ${ev.price.toFixed(2)}, ${STATUS_WORD[status]}`}
      onPointerEnter={() => onHover(row.key)}
      onFocus={() => onHover(row.key)}
      onBlur={() => onHover(null)}
    >
      {/* the flash on a status flip: opacity keyframes over a still tint, no remount */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: tint(flashColor, 9) }}
        initial={false}
        animate={status}
        variants={{
          working: { opacity: 0 },
          filled: frozen ? { opacity: 0 } : { opacity: [0, 1, 0], transition: { duration: 0.4, ease: "easeOut" } },
          rejected: frozen ? { opacity: 0 } : { opacity: [0, 1, 0], transition: { duration: 0.4, ease: "easeOut" } },
        }}
      />
      <motion.div
        initial={false}
        animate={status}
        variants={{
          working: { x: 0 },
          filled: { x: 0 },
          rejected: frozen ? { x: 0 } : { x: [0, -3, 3, -2, 2, 0], transition: { duration: 0.35 } },
        }}
        className="transition-colors duration-150 hover:bg-foreground/[0.03]"
      >
        {/* the grid owns the dim, so it never fights the entrance or the shake around it */}
        <div className="grid items-center gap-3 px-3 py-2.5 transition-opacity duration-200" style={{ gridTemplateColumns: COLS, opacity: dim ? 0.45 : 1 }}>
          <span role="cell" className="text-[11px] text-foreground/45">
            {ev.time}
          </span>
          <span role="cell" className="truncate text-[12.5px] font-semibold text-foreground/90">
            {ev.symbol}
          </span>
          <span role="cell" className="text-[11px] font-medium" style={{ color: side }}>
            {ev.side === "buy" ? "Buy" : "Sell"}
          </span>
          <span role="cell" className="text-right text-[12px] text-foreground/90">
            {ev.qty.toLocaleString("en-US")}
          </span>
          <span role="cell" className="text-right text-[12px] text-foreground/90">
            {ev.price.toFixed(2)}
          </span>
          <span role="cell">
            <StatusWord status={status} frozen={frozen} />
          </span>
        </div>
      </motion.div>
      {/* the detail line unfolds on grid rows 0fr → 1fr over 250ms; reduced motion swaps it at once */}
      <div
        data-detail
        role="status"
        aria-hidden={!hovered}
        className="grid"
        style={{
          gridTemplateRows: hovered ? "1fr" : "0fr",
          opacity: hovered ? 1 : 0,
          transition: frozen ? "opacity 150ms" : `grid-template-rows 250ms ${SMOOTH}, opacity 250ms ${SMOOTH}`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex items-center gap-2 px-3 pb-2.5 pl-[90px] text-[10.5px] text-foreground/45">
            <span>{ev.venue}</span>
            <span className="opacity-40">·</span>
            <span>{ev.orderId}</span>
            <span className="opacity-40">·</span>
            <span>fee ${ev.fee.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Streaming order-fills table in the Ink register. New fills enter at the top with a
 * slide-down that pushes older rows down, arrive as working with a pulsing dot, then
 * resolve in place to filled (a brief green ground) or rejected (red, a brief shake)
 * after a deterministic per-event delay. The list is height-capped with soft fades at
 * both edges; pointing at a row dims the rest and unfolds a slim detail line (venue,
 * order id, fee). The feed is a fixed event array replayed on an interval, pausable
 * from the header, and fully still under reduced motion. The "today" count is
 * derivable: settled before the window, plus the seeded rows, plus every arrival since.
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

  /* derivable: DAY_BASE settled earlier + seed rows + streamed arrivals */
  const today = DAY_BASE + seedCount + streamed

  return (
    <div className={cn("w-full max-w-[640px] tabular-nums", className)} role="table" aria-label={`${title}, ${today} today`}>
      <div className="flex items-center justify-between px-3 pb-3">
        <span className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-foreground/90">{title}</span>
          <span className="text-[11px] text-foreground/45" aria-label={`${today} today: ${DAY_BASE} settled before this window, ${seedCount} seeded, ${streamed} arrived`}>
            {today} today
          </span>
        </span>
        <motion.button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause feed" : "Resume feed"}
          whileTap={frozen ? undefined : { scale: 0.97 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="grid h-7 w-7 place-items-center rounded-full bg-foreground/[0.06] text-foreground/45 outline-none transition-colors duration-150 hover:bg-foreground/[0.08] hover:text-foreground/90 focus-visible:bg-foreground/[0.12]"
        >
          {/* icon swap: the new glyph fades in out of a 2px blur */}
          <motion.span
            key={playing ? "pause" : "play"}
            className="grid place-items-center"
            initial={frozen ? false : { opacity: 0, scale: 0.8, filter: "blur(2px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            {playing ? <Pause size={11} fill="currentColor" strokeWidth={0} /> : <Play size={11} fill="currentColor" strokeWidth={0} />}
          </motion.span>
        </motion.button>
      </div>
      <div role="row" className="grid gap-3 border-b border-foreground/[0.05] px-3 pb-2 text-[10px] text-foreground/45" style={{ gridTemplateColumns: COLS }}>
        <span role="columnheader">Time</span>
        <span role="columnheader">Symbol</span>
        <span role="columnheader">Side</span>
        <span role="columnheader" className="text-right">
          Qty
        </span>
        <span role="columnheader" className="text-right">
          Price
        </span>
        <span role="columnheader" className="text-right">
          Status
        </span>
      </div>
      <div
        role="rowgroup"
        className="overflow-y-auto"
        onPointerLeave={() => setHovered(null)}
        style={{ maxHeight: 360, WebkitMaskImage: EDGE_FADE, maskImage: EDGE_FADE }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((row) => (
            <FillRow key={row.key} row={row} hovered={hovered === row.key} dim={hovered !== null && hovered !== row.key} onHover={setHovered} frozen={frozen} />
          ))}
        </AnimatePresence>
        {/* bottom breathing room so the last row clears the mask fade */}
        <div className="h-5" />
      </div>
    </div>
  )
}
