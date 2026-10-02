"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Event Feed, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: what happened to the names being watched, grouped by day, with the
   price each event left behind.
   Read first: the headline of each event. The ticker and the time sit above it, the price
   and the signed move to the right.
   The pointer: point at an event, or tab to it, and the others dim; the readout at the top
   turns the percent into dollars. Press an event to keep it read out while the
   pointer moves on; press it again to let go.
   Lab sketch: src/components/lab/EventFeed.tsx. Kept: days as groups, the data shape
   (symbol, time, headline, price, delta) and the tabular price column. Changed: no card
   around each day and no header band; the move is text in green or red, not a pill, and a
   fall is red, not amber; the coin is a fill without a ring. Sample prices were not
   plausible (one ticker at two far prices) and the headlines did not belong to their
   tickers: both are rewritten, and the two AAPL prints now agree with each other.
   Formulas:
   · price before = price / (1 + delta / 100)      (228.02 / 0.987 = 231.02)
   · move         = price − price before           (228.02 − 231.02 = −3.00)
   · up and down  = count of events by the sign of delta (sample: 2 up, 2 down)    Marks (2026-09-30): a token shows its real mark (TokenIcon), a company or a wallet its
   real logo (BrandIcon); two letters on an ink disc only where no mark exists.
   Shipped alone: a mark is a disc in the brand's colour with the ticker's first letters in
   white; pass `renderIcon` to draw the real marks instead. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export type FeedEvent = {
  symbol: string
  time: string
  headline: string
  /** the price after the event */
  price: number
  /** the move on the event, in percent */
  delta: number
}

export type FeedDay = { day: string; events: FeedEvent[] }

export interface EventFeedProps {
  days?: FeedDay[]
  title?: string
  /** draws a ticker's mark in place of the brand-coloured disc */
  renderIcon?: (symbol: string, size: number) => ReactNode
  className?: string
}

/** brand discs by ticker; the hex is only the fallback of the custom property */
const BRAND: Record<string, string> = {
  AAPL: "var(--coin-aapl, #7d7d82)",
  SMCI: "var(--coin-smci, #151f6d)",
  MSFT: "var(--coin-msft, #00a4ef)",
  NVDA: "var(--coin-nvda, #76b900)",
  GOOGL: "var(--coin-googl, #4285f4)",
  AMZN: "var(--coin-amzn, #ff9900)",
  META: "var(--coin-meta, #0467df)",
  TSLA: "var(--coin-tsla, #cc0000)",
}

/** a ticker's mark: the caller's drawing, the brand disc, or two letters on ink */
function Mark({ symbol, size, renderIcon }: { symbol: string; size: number; renderIcon?: EventFeedProps["renderIcon"] }) {
  if (renderIcon) return <span className="mt-0.5 inline-flex shrink-0">{renderIcon(symbol, size)}</span>
  const disc = BRAND[symbol.toUpperCase()]
  return (
    <span
      aria-hidden
      className={cn("mt-0.5 grid shrink-0 place-items-center rounded-full text-[8.5px] font-semibold", !disc && "bg-foreground/[0.06] text-foreground/70")}
      // oxlint-disable-next-line shadcn/no-raw-colors -- the glyph on a brand disc is white in both themes
      style={{ width: size, height: size, background: disc, color: disc ? "white" : undefined }}
    >
      {symbol.slice(0, 2)}
    </span>
  )
}

const DEFAULT_DAYS: FeedDay[] = [
  {
    day: "Today, September 1",
    events: [
      { symbol: "AAPL", time: "12:30", headline: "Hotel chains add room keys to phone wallets; 14% of guests at branded hotels now open the door with a phone.", price: 228.02, delta: -1.3 },
      { symbol: "SMCI", time: "11:05", headline: "Server maker files its delayed annual report and clears the exchange's listing deadline.", price: 41.86, delta: 6.4 },
    ],
  },
  {
    day: "Yesterday, August 31",
    events: [
      { symbol: "AAPL", time: "16:10", headline: "Teardown shows the new desktop's power board is cut out to seat taller parts and save height.", price: 231.02, delta: -0.6 },
      { symbol: "MSFT", time: "14:45", headline: "On-device models now rewrite text and sum up notifications without a round trip to the cloud.", price: 441.2, delta: 0.8 },
    ],
  },
]

const signed = (v: number, dp = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}`
const before = (e: FeedEvent) => e.price / (1 + e.delta / 100)

/**
 * A market feed in the Ink register: events under their day, each a ticker, a two-line
 * headline and the price it left. Pointing at one dims the rest and reads its move in
 * dollars in the readout at the top.
 */
export function EventFeed({ days = DEFAULT_DAYS, title = "What's happening", renderIcon, className }: EventFeedProps) {
  const reduced = useReducedMotion()
  const [hover, setHover] = useState<string | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const hot = hover ?? pin

  const all = days.flatMap((d, di) => d.events.map((e, ei) => ({ ...e, id: `${di}-${ei}` })))
  const ups = all.filter((e) => e.delta >= 0).length
  const shown = all.find((e) => e.id === hot)

  let order = 0

  return (
    <div className={cn("w-full max-w-[520px] tabular-nums", className)} role="group" aria-label={`${title}, ${all.length} events, ${ups} up, ${all.length - ups} down`}>
      {/* no visible title (2026-10-01): the name lives in the group's aria-label; the readout leads */}
      <div className="flex items-baseline gap-3 px-3 pb-1">
        <span role="status" className="truncate text-[10.5px] text-foreground/45">
          {/* the line crosses over when the event changes (4px, 2px blur, 150ms) */}
          <motion.span
          key={shown?.id ?? "rest"}
          className="inline-block"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          {shown ? (
            <>
              <span className="font-medium text-foreground/90">{shown.symbol}</span> ${before(shown).toFixed(2)} to ${shown.price.toFixed(2)},{" "}
              <span style={{ color: shown.delta >= 0 ? GREEN : RED }}>{signed(shown.price - before(shown))}</span>
            </>
          ) : (
            `${all.length} events · ${ups} up, ${all.length - ups} down`
          )}
          </motion.span>
        </span>
      </div>

      <div onPointerLeave={() => setHover(null)}>
        {days.map((d, di) => (
          <div key={d.day} role="group" aria-label={`${d.day}, ${d.events.length} events`}>
            <div className="px-3 pb-1.5 pt-4">
              <span className="text-[11px] text-foreground/45">{d.day}</span>
            </div>
            {d.events.map((e, ei) => {
              const id = `${di}-${ei}`
              const i = order++
              const up = e.delta >= 0
              return (
                /* the outer wrapper owns the dim so it never fights the entrance inside */
                <div key={id} className="transition-opacity duration-200 motion-reduce:transition-none" style={{ opacity: hot !== null && hot !== id ? 0.45 : 1 }}>
                  <motion.button
                    type="button"
                    aria-pressed={pin === id}
                    aria-label={`${e.symbol}, ${e.time}, ${e.headline} $${e.price.toFixed(2)}, ${signed(e.delta)}%`}
                    onPointerEnter={() => setHover(id)}
                    onFocus={() => setHover(id)}
                    onBlur={() => setHover(null)}
                    onClick={() => setPin((p) => (p === id ? null : id))}
                    className={cn(
                      "flex w-full items-start gap-3 border-t border-foreground/[0.05] px-3 py-3 text-left outline-none transition-colors duration-150 hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.06] motion-reduce:transition-none",
                      pin === id && "bg-foreground/[0.03]",
                    )}
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: i * 0.035 }}
                  >
                    <Mark symbol={e.symbol} size={24} renderIcon={renderIcon} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-[11.5px] font-semibold text-foreground/90">{e.symbol}</span>
                        <span className="text-[10px] text-foreground/35">{e.time}</span>
                      </span>
                      <span className="mt-1 block text-[12px] leading-[1.5] text-foreground/70">{e.headline}</span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2.5 pt-px">
                      <span className="w-[52px] text-right text-[11.5px] text-foreground/90">${e.price.toFixed(2)}</span>
                      <span className="w-[46px] text-right text-[11px] font-medium" style={{ color: up ? GREEN : RED }}>
                        {signed(e.delta)}%
                      </span>
                    </span>
                  </motion.button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
