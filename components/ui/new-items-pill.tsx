"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUp } from "lucide-react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const

export interface FeedFill {
  id: number
  time: string
  side: "buy" | "sell"
  symbol: string
  size: string
  price: string
}

const SYMBOLS = ["NOVX", "ARDN", "MRDX", "ZTH", "ORBN"]

/** Fixed session anchor so the tape never depends on the wall clock — the same
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
  const symbol = SYMBOLS[i % SYMBOLS.length]
  const base = 120 + (i % SYMBOLS.length) * 37
  return {
    id: i,
    time: clock(i),
    side: g > 0.5 ? "buy" : "sell",
    symbol,
    size: (Math.floor(g * 900) + 25).toLocaleString("en-US"),
    price: (base + g * 4).toFixed(2),
  }
}

const SEED = 16
const DEFAULT_FILLS: FeedFill[] = Array.from({ length: SEED }, (_, i) => makeFill(SEED - 1 - i))

/** the tape stops growing here so a long session cannot leak rows */
const CAP = 80
/** anything under this counts as "parked at the top", where arrivals may land freely */
const TOP = 4

/**
 * A live tape that refuses to move the ground under you.
 *
 * Parked at the top, fills land and the list grows. Scroll down to read a row and
 * the behaviour inverts: fills still land, but the scroll position is pinned to the
 * row you were on, and the arrivals are counted into a pill instead. Tap the pill to
 * come back to the top and clear it.
 *
 * The pin is the whole component. Prepending to a scrolled list slides everything
 * down by the height of the new row, so the line under your cursor at mousedown is
 * not the line you click — on a fills blotter that is a misread position, and on a
 * request log it is the wrong trace opened. The count is the exact number that
 * arrived while you were away: never rounded, never capped at "9+", because the one
 * question the pill exists to answer is how much you have not seen.
 */
export function NewItemsPill({
  fills = DEFAULT_FILLS,
  intervalMs = 2600,
  live = true,
  title = "Sample tape",
  className,
}: {
  fills?: FeedFill[]
  /** gap between arrivals; the tape freezes when live is false */
  intervalMs?: number
  live?: boolean
  title?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const scroller = useRef<HTMLDivElement>(null)
  const next = useRef(SEED)
  /** scrollHeight captured before a prepend, so the pin can measure the delta */
  const before = useRef(0)
  /** ids seeded on mount — they must not animate in, only later arrivals do */
  const seeded = useRef(new Set(fills.map((f) => f.id)))

  const [tape, setTape] = useState(fills)
  const [pending, setPending] = useState(0)
  const [away, setAway] = useState(false)

  useEffect(() => {
    if (!live) return
    const t = window.setInterval(() => {
      const el = scroller.current
      before.current = el ? el.scrollHeight : 0
      const parked = !el || el.scrollTop < TOP
      setTape((prev) => [makeFill(next.current++), ...prev].slice(0, CAP))
      if (!parked) setPending((n) => n + 1)
    }, intervalMs)
    return () => window.clearInterval(t)
  }, [live, intervalMs])

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
    <div
      className={cn("relative w-full max-w-[480px] overflow-hidden rounded-xl border border-foreground/[0.04]", className)}
      style={{
        background: "var(--card)",
        boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)",
      }}
    >
      <div className="flex items-center justify-between border-b border-foreground/[0.04] bg-foreground/[0.02] px-4 py-2.5">
        <span className="text-[13px] font-medium text-foreground/85">{title}</span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: live ? "var(--chart-up)" : "color-mix(in srgb, var(--foreground) 25%, transparent)" }}
            aria-hidden
          />
          <span className="text-[9px] uppercase tracking-[0.1em] text-foreground/30">{live ? "live" : "paused"}</span>
        </span>
      </div>

      <div className="grid grid-cols-[64px_1fr_72px_76px] gap-2 border-b border-foreground/[0.04] px-4 py-1.5 text-[9px] uppercase tracking-[0.1em] text-foreground/30">
        <span>Time</span>
        <span>Symbol</span>
        <span className="text-right">Size</span>
        <span className="text-right">Price</span>
      </div>

      <div className="relative">
        {/* the pill floats over the tape; only the button itself takes the pointer */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2">
          <AnimatePresence>
            {showPill && (
              <motion.button
                type="button"
                onClick={jump}
                role="status"
                aria-live="polite"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE }}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-foreground/[0.05] px-2.5 py-1 text-[11px] text-foreground/80 transition-colors duration-150 hover:bg-foreground/[0.03]"
                style={{ background: "var(--card)", boxShadow: "0 8px 24px var(--card-shadow, rgba(0,0,0,0.35))" }}
              >
                <ArrowUp className="h-3 w-3 text-foreground/45" aria-hidden />
                <span className="tabular-nums">{pending}</span>
                <span className="text-foreground/50">new</span>
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
          className="h-[264px] overflow-y-auto"
          style={{ overflowAnchor: "none" }}
        >
          {tape.map((f) => {
            const fresh = !seeded.current.has(f.id)
            const up = f.side === "buy"
            return (
              <motion.div
                key={f.id}
                initial={fresh && !reduced ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={reduced ? { duration: 0 } : { duration: 0.15, ease: EASE }}
                className="grid grid-cols-[64px_1fr_72px_76px] items-center gap-2 px-4 py-2.5 transition-colors duration-150 hover:bg-foreground/[0.02]"
              >
                <span className="text-[10.5px] tabular-nums text-foreground/35">{f.time}</span>
                <span className="flex items-center gap-2">
                  <span
                    className="h-3 w-[2px] rounded-full"
                    style={{ background: up ? "var(--chart-up)" : "var(--chart-down)" }}
                    aria-hidden
                  />
                  <span className="text-[12.5px] text-foreground/80">{f.symbol}</span>
                  <span className="text-[9px] uppercase tracking-[0.1em] text-foreground/30">{f.side}</span>
                </span>
                <span className="text-right text-[12px] tabular-nums text-foreground/55">{f.size}</span>
                <span
                  className="text-right text-[12.5px] font-semibold tabular-nums"
                  style={{ color: up ? "var(--chart-up)" : "var(--chart-down)" }}
                >
                  {f.price}
                </span>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
