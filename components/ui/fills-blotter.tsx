"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { LiveToggle } from "@/components/ui/live-toggle"
import { usePointed } from "@/components/ui/use-pointed"

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
     gets; the edge fades are cut from a token, not a hex
   2026-10-02 audit: his call that anything streaming runs only while pointed at, so the
   blotter rests on its 5 seeded fills and the feed runs while the pointer is on the table
   (usePointed); the round pause button became the shared IconToggle at a fixed width, a
   filled play mark reading "Play" or a pulsing green dot reading "Live", which pins the
   feed on or pauses it while the pointer stays. The "19 today" count beside the title is
   gone (it stays in the aria-label). Heads are 10.5px. The detail line no longer unfolds
   under a pointed row and pushes the rows below down: venue, order id and fee swap in
   place inside the row, after the symbol, at 10.5px /60, gap-3 apart with no dots.
   2026-10-02 round 2: his note "broken on hover". Pointing at the table started the feed,
   and every arrival pushed the rows down under a still pointer: the lit row with its detail
   slid away while the row under the pointer stayed dimmed, the table grew from 5 rows
   toward its 360px cap (re-centring itself in the stage), a scrollbar could appear and
   narrow the columns, the detail was clipped mid word in a 200px column, and rows trimmed
   off the end were popped out of the clipped list (popLayout, which also breaks inside the
   preview iframe) and flashed under it. Now the list is a fixed 300px with no scrollbar and
   8 seeded rows of a fixed 40px, so nothing grows; pointing at a row (or focusing it) holds
   the arrivals, so the row being read never moves, while working orders still resolve in
   place; the feed runs while the pointer is on the title or heads, or when Live is pinned
   and the pointer is away from the rows. The fixed columns are trimmed to their content
   so the symbol column has room for venue, order id and fee, and a narrow host fades the
   detail at its right edge instead of cutting it. The top edge fades only once the list is
   scrolled, so the newest row is never half faded. The toggle is the shared LiveToggle.
   Formulas:
   · today = 18 settled before the window + the seeded rows + every arrival since */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const AMBER = "var(--chart-amber)"

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

const COLS = "56px minmax(0,1fr) 40px 52px 72px 76px"
const SEED = 8 // rows already resolved on screen at load, enough to fill the list
const ROW_H = 40
/** the list holds 7.5 rows, so the half row at the bottom says there is more */
const LIST_H = 300
const DAY_BASE = 18 // fills settled before the visible window (count = DAY_BASE + seed + streamed)
const MAX_ROWS = 18
/** the soft fade at the bottom edge, and at the top once the list is scrolled */
const edgeFade = (top: boolean) =>
  `linear-gradient(180deg, ${top ? "transparent 0, black 26px" : "black 0"}, black calc(100% - 26px), transparent 100%)`
/** the detail fades out at the right edge of a narrow symbol column instead of being cut */
const DETAIL_FADE = "linear-gradient(90deg, black calc(100% - 16px), transparent)"

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
      aria-label={`${ev.time} ${ev.side} ${ev.qty.toLocaleString("en-US")} ${ev.symbol} at ${ev.price.toFixed(2)}, ${STATUS_WORD[status]}, ${ev.venue}, ${ev.orderId}, fee $${ev.fee.toFixed(2)}`}
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
        <div className="grid items-center gap-3 px-3 transition-opacity duration-200" style={{ gridTemplateColumns: COLS, height: ROW_H - 1, opacity: dim ? 0.45 : 1 }}>
          <span role="cell" className="text-[11px] text-foreground/45">
            {ev.time}
          </span>
          {/* the pointed row reads its venue, order id and fee in place, after the symbol: no
              row moves (2026-10-02 audit); the extras swap in (4px, 2px blur, 150ms) */}
          <span role="cell" className="flex min-w-0 items-baseline gap-3 whitespace-nowrap">
            <span className="shrink-0 text-[12.5px] font-semibold text-foreground/90">{ev.symbol}</span>
            <AnimatePresence initial={false}>
              {hovered && (
                <motion.span
                  key="detail"
                  data-detail
                  aria-hidden
                  className="flex min-w-0 flex-1 items-baseline gap-3 overflow-hidden text-[10.5px] text-foreground/60"
                  style={{ maskImage: DETAIL_FADE, WebkitMaskImage: DETAIL_FADE }}
                  initial={frozen ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.15, ease: EASE }}
                >
                  <span className="shrink-0">{ev.venue}</span>
                  <span className="shrink-0">fee ${ev.fee.toFixed(2)}</span>
                  <span className="shrink-0">{ev.orderId}</span>
                </motion.span>
              )}
            </AnimatePresence>
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
    </motion.div>
  )
}

/**
 * Streaming order-fills table in the Ink register. New fills enter at the top with a
 * slide-down that pushes older rows down, arrive as working with a pulsing dot, then
 * resolve in place to filled (a brief green ground) or rejected (red, a brief shake)
 * after a deterministic per-event delay. The list is a fixed height with a soft fade at
 * the bottom; pointing at a row dims the rest, reads its venue, fee and order id in place
 * and holds the arrivals so the row never moves. The feed is a fixed event array replayed
 * on an interval while the table is pointed at (or pinned on from the header), and still
 * under reduced motion unless pinned on. The "today" count, in the aria-label, is derivable: settled before the
 * window, plus the seeded rows, plus every arrival since.
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
  const snapshot = isSnapshot()
  const pointed = usePointed()
  /* "auto" streams while pointed at, "on" is pinned by the toggle, "off" is paused by it
     until the pointer leaves (then it goes back to auto) */
  const [mode, setMode] = useState<"auto" | "on" | "off">("auto")
  const playing = !snapshot && (mode === "on" || (mode === "auto" && pointed.live && !frozen))
  useEffect(() => {
    if (!pointed.live && mode === "off") setMode("auto")
  }, [pointed.live, mode])
  const [hovered, setHovered] = useState<string | null>(null)
  /* reading a row holds the arrivals, so the row under the pointer never slides away */
  const streaming = playing && hovered === null
  const [scrolled, setScrolled] = useState(false)
  const ptrRef = useRef(seedCount)
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    if (!streaming) return
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
  }, [streaming, intervalMs, events])

  useEffect(() => {
    const pending = timeoutsRef.current
    return () => pending.forEach(clearTimeout)
  }, [])

  /* derivable: DAY_BASE settled earlier + seed rows + streamed arrivals */
  const today = DAY_BASE + seedCount + streamed

  return (
    <div
      ref={pointed.ref}
      {...pointed.bind}
      className={cn("w-full max-w-[640px] tabular-nums", className)}
      role="table"
      aria-label={`${title}, ${today} today: ${DAY_BASE} settled before this window, ${seedCount} seeded, ${streamed} arrived`}
    >
      <div className="flex items-center justify-between px-3 pb-3">
        <span className="text-[13px] font-medium text-foreground/90">{title}</span>
        {/* live-toggle.tsx, the tape family's toggle; its signal moves only while fills land */}
        <span className="-mr-2">
          <LiveToggle
            live={playing}
            onLiveChange={(next) => setMode(next ? "on" : "off")}
            animate={streaming}
            aria-label={playing ? "Live, press to pause the feed" : "Paused, press to play the feed"}
          />
        </span>
      </div>
      <div role="row" className="grid gap-3 border-b border-foreground/[0.05] px-3 pb-2 text-[10.5px] text-foreground/45" style={{ gridTemplateColumns: COLS }}>
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
      {/* a fixed height with no scrollbar: arrivals never grow the table or narrow its columns */}
      <div
        role="rowgroup"
        className="no-scrollbar relative overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onPointerLeave={() => setHovered(null)}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)}
        /* scrollbarWidth inline too: a host page with an unlayered global scrollbar rule (this site's
           index.css) beats the utility, and a scrollbar showed on the browse wall (his call, 2026-10-02) */
        style={{ height: LIST_H, overflowAnchor: "none", scrollbarWidth: "none", WebkitMaskImage: edgeFade(scrolled), maskImage: edgeFade(scrolled) }}
      >
        <AnimatePresence initial={false}>
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
