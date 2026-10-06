"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUp } from "lucide-react"

import { cn } from "@/lib/utils"
import { LiveToggle } from "@/components/ui/live-toggle"
import { usePointed } from "@/components/ui/use-pointed"

/* New Items Pill, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card, no header band, no inner shadow: the tape sits on the page with one hairline
     under the column names
   · the pill has no outline and no shadow: it is a solid round fill, so rows passing under
     it do not show through
   · sentence case everywhere: column names, the side and the live state were set in
     letter-spaced capitals
   · the live dot is green again while the tape is live (2026-09-30: live is a healthy
     state, and green is how the library says healthy); paused falls back to ink
   · pointing at a row gives it a faint fill and dims the others
   · the pill is a real button inside a status region (it was a button with the status role,
     which hid it from a screen reader as a button)
   · corners of 8px and under, every figure tabular from the root
   Props are the same.
   2026-10-02 audit: the tape fed a fill every interval from mount; now it feeds only while
   it is pointed at, or while you are scrolled away (that is when the pill counts), and it
   rests still and complete otherwise (his call, usePointed). The static dot and the word
   Live became a real control, an IconToggle with a pulsing green dot for Live and a pause
   mark for Paused, at a fixed width, that pauses the tape. The visible title is gone (it is
   the log's aria-label); the column heads are 10.5px /45 over the 4% hairline; the tape
   hides its scrollbar and fades at the bottom edge (and the top while scrolled away). Each
   row is coloured once: the side tick carries the direction, the price is ink /90 at
   weight 400, the Buy and Sell words went to the screen reader. Time at /45, size at /60,
   the pill's count changes in place. Width 440 like the other AI and operations lists.
   The `live` prop now sets where the toggle starts.
   2026-10-02 round 2: his note on the Live control, no green dot. The toggle is the shared
   LiveToggle (live-toggle.tsx), the same as the tapes', in ink without a dot, its look
   picked by the LiveToggleVariant around it. It reads Live while the tape may run, and its
   signal moves only while fills actually land (pointed at, or scrolled away). The sample
   tape is on topic: invented tickers became a desk's real mix (BTC-USD, ETH-USD, SOL-USD
   and TAO-USD on Coinbase, NVDA on Nasdaq) at plausible prices, sizes in each one's unit,
   and the venue after the symbol; the default title (aria only) is "Desk fills, Coinbase and Nasdaq".
   Formulas:
   · price = base × (1 + (g − 0.5) × 0.2%), g a hash of the fill's number
   · size  = the instrument's range at a second hash h (BTC 0.005 to 0.825, NVDA 5 to 900 shares) */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export interface FeedFill {
  id: number
  time: string
  side: "buy" | "sell"
  symbol: string
  size: string
  price: string
  /** where it printed (Coinbase, Nasdaq…); shown after the symbol when given */
  venue?: string
}

/* a desk's mixed tape: four crypto pairs on Coinbase and one stock on Nasdaq. Size is in
   the instrument's own unit (coins, or shares for NVDA); price walks within ±0.1% of base */
const INSTRUMENTS = [
  { symbol: "BTC-USD", venue: "Coinbase", base: 97482.5, size: (g: number) => (0.005 + g * 0.82).toFixed(4) },
  { symbol: "ETH-USD", venue: "Coinbase", base: 3714.2, size: (g: number) => (0.05 + g * 18).toFixed(3) },
  { symbol: "NVDA", venue: "Nasdaq", base: 138.27, size: (g: number) => String(Math.round(5 + g * 895)) },
  { symbol: "SOL-USD", venue: "Coinbase", base: 214.63, size: (g: number) => (1 + g * 340).toFixed(2) },
  { symbol: "TAO-USD", venue: "Coinbase", base: 486.9, size: (g: number) => (0.5 + g * 64).toFixed(2) },
]

/** Fixed session anchor so the tape never depends on the wall clock: the same
 *  index always renders the same second, on the server and on every re-render. */
const OPEN_SECONDS = 9 * 3600 + 32 * 60

function clock(i: number) {
  const t = OPEN_SECONDS + i * 7
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(Math.floor(t / 3600) % 24)}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`
}

/* hash-sine: a fill is a pure function of its sequence number, so replaying the
   tape gives byte-identical rows. */
function makeFill(i: number): FeedFill {
  const g = Math.abs(Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1
  const ins = INSTRUMENTS[i % INSTRUMENTS.length]
  /* a second hash for the size, so size and price do not move together */
  const h = Math.abs(Math.sin(i * 7.1337 + 11.17) * 24634.6345) % 1
  return {
    id: i,
    time: clock(i),
    side: g > 0.5 ? "buy" : "sell",
    symbol: ins.symbol,
    venue: ins.venue,
    size: ins.size(h),
    price: (ins.base * (1 + (g - 0.5) * 0.002)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }
}

const SEED = 16
const DEFAULT_FILLS: FeedFill[] = Array.from({ length: SEED }, (_, i) => makeFill(SEED - 1 - i))

/** the tape stops growing here so a long session cannot leak rows */
const CAP = 80
/** anything under this counts as "parked at the top", where arrivals may land freely */
const TOP = 4

const COLS = "grid grid-cols-[64px_1fr_72px_76px] items-center gap-2 px-3"

/**
 * A live tape that refuses to move the ground under you.
 *
 * Parked at the top, fills land and the list grows. Scroll down to read a row and
 * the behaviour inverts: fills still land, but the scroll position is pinned to the
 * row you were on, and the arrivals are counted into a pill instead. Tap the pill to
 * come back to the top and clear it. The count is the exact number that arrived while
 * you were away, never rounded.
 */
export function NewItemsPill({
  fills = DEFAULT_FILLS,
  intervalMs = 2600,
  live = true,
  title = "Desk fills, Coinbase and Nasdaq",
  className,
}: {
  fills?: FeedFill[]
  /** gap between arrivals while the tape runs */
  intervalMs?: number
  /** where the Live toggle starts; false starts it paused */
  live?: boolean
  title?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const scroller = useRef<HTMLDivElement>(null)
  const next = useRef(SEED)
  /** scrollHeight captured before a prepend, so the pin can measure the delta */
  const before = useRef(0)
  /** ids seeded on mount: they stagger in once with the mount, later arrivals rise alone */
  const seeded = useRef(new Set(fills.map((f) => f.id)))

  const [tape, setTape] = useState(fills)
  const [pending, setPending] = useState(0)
  const [away, setAway] = useState(false)
  /* the toggle; the prop sets where it starts and follows it when it changes */
  const [on, setOn] = useState(live)
  useEffect(() => setOn(live), [live])
  /* fills land only while the tape is looked at: pointed, or scrolled away from the top
     (his call, 2026-10-02); at rest it holds still */
  const { ref, live: pointed, bind } = usePointed()
  const running = on && (pointed || away)

  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => {
      const el = scroller.current
      before.current = el ? el.scrollHeight : 0
      const parked = !el || el.scrollTop < TOP
      setTape((prev) => [makeFill(next.current++), ...prev].slice(0, CAP))
      if (!parked) setPending((n) => n + 1)
    }, intervalMs)
    return () => window.clearInterval(t)
  }, [running, intervalMs])

  /* Runs before paint: add back exactly the height that was inserted above the
     viewport, so the visible rows never move. useEffect is too late and shows a jump. */
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !before.current) return
    const delta = el.scrollHeight - before.current
    if (delta > 0 && el.scrollTop > 0) el.scrollTop += delta
    before.current = 0
  }, [tape])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const parked = el.scrollTop < TOP
    setAway(!parked)
    if (parked) setPending(0)
  }

  const jump = () => {
    scroller.current?.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" })
    setPending(0)
  }

  const showPill = pending > 0 && away

  return (
    <div ref={ref} {...bind} role="group" aria-label={title} className={cn("relative w-[440px] max-w-full tabular-nums", className)}>
      {/* no visible title (spec 14.1): the heads name the tape; Live is a real toggle */}
      <div className="flex justify-end pb-1.5">
        <LiveToggle
          live={on}
          onLiveChange={setOn}
          animate={running}
          aria-label={on ? "Live, press to pause the tape" : "Paused, press to resume the tape"}
        />
      </div>

      <div className={cn(COLS, "border-b border-foreground/[0.04] pb-1.5 text-[10.5px] text-foreground/45")}>
        <span>Time</span>
        <span>Symbol</span>
        <span className="text-right">Size</span>
        <span className="text-right">Price</span>
      </div>

      <div className="relative">
        {/* the pill floats over the tape; only the button itself takes the pointer */}
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2"
        >
          <AnimatePresence>
            {showPill && (
              <motion.button
                type="button"
                onClick={jump}
                aria-label={`${pending} new, back to the top`}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: reduced ? 0.15 : 0.25, ease: EASE } }}
                exit={reduced ? { opacity: 0, transition: { duration: 0.15 } } : { opacity: 0, y: -4, transition: { duration: 0.15, ease: EASE } }}
                whileTap={reduced ? undefined : { scale: 0.97, transition: { type: "spring", stiffness: 500, damping: 30 } }}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--foreground)_14%,var(--background))] px-2.5 py-1 text-[11px] outline-none transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--foreground)_20%,var(--background))] focus-visible:bg-[color-mix(in_srgb,var(--foreground)_20%,var(--background))] motion-reduce:transition-none"
              >
                <ArrowUp className="h-3 w-3 text-foreground/45" strokeWidth={1.8} aria-hidden />
                {/* the count changes in place with each arrival: a live tick, so no re-entry (spec 13.4) */}
                <span className="font-semibold text-foreground/90">{pending}</span>
                <span className="text-foreground/45">new</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* overflow-anchor: none is load-bearing. Chrome ships scroll anchoring on by
            default and already shifts scrollTop when content lands above the viewport,
            so leaving it on makes the pin below fire on top of the browser's and the
            tape jumps by twice the inserted height. Safari implements neither, so the
            fix is to switch the browser's off everywhere and own the correction here. */}
        <div
          ref={scroller}
          onScroll={onScroll}
          role="log"
          aria-label={`${title}, newest first`}
          className="group/tape h-[264px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            overflowAnchor: "none",
            /* no scrollbar; the edges fade instead, the top one only once you have scrolled away */
            maskImage: `linear-gradient(to bottom, ${away ? "transparent 0, black 20px" : "black 0"}, black calc(100% - 24px), transparent 100%)`,
            WebkitMaskImage: `linear-gradient(to bottom, ${away ? "transparent 0, black 20px" : "black 0"}, black calc(100% - 24px), transparent 100%)`,
          }}
        >
          {tape.map((f, i) => {
            const fresh = !seeded.current.has(f.id)
            const up = f.side === "buy"
            // on mount the first 8 seeded rows rise in 35ms apart; a later arrival rises in
            // on its own. Rows past 8 are simply there. Reduced motion keeps the fade only.
            const enters = fresh || i < 8
            return (
              <motion.div
                key={f.id}
                initial={enters ? (reduced ? { opacity: 0 } : { opacity: 0, y: 6 }) : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: fresh ? 0.25 : 0.3, ease: EASE, delay: fresh ? 0 : i * 0.035 }}
              >
                {/* the dim is plain CSS on the inner row: rows move under a still pointer when
                    a fill lands, and the browser keeps hover honest where state would go stale */}
                <div
                  className={cn(
                    COLS,
                    "rounded-[8px] py-2.5 transition-[opacity,background-color] duration-150 hover:bg-foreground/[0.04] group-hover/tape:[&:not(:hover)]:opacity-50 motion-reduce:transition-none",
                  )}
                >
                  <span className="text-[10.5px] text-foreground/45">{f.time}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    {/* the side tick is the one mark of direction; the word is for a screen reader */}
                    <span aria-hidden className="h-3 w-[2px] rounded-full" style={{ background: up ? GREEN : RED }} />
                    <span className="sr-only">{up ? "Buy" : "Sell"}</span>
                    <span className="truncate text-[12.5px] text-foreground/90">{f.symbol}</span>
                    {f.venue && <span className="shrink-0 text-[10.5px] text-foreground/45">{f.venue}</span>}
                  </span>
                  <span className="text-right text-[12px] text-foreground/60">{f.size}</span>
                  <span className="text-right text-[12.5px] text-foreground/90">{f.price}</span>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
