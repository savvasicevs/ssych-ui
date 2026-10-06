"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { SURFACE } from "@/components/ui/control-classes"
import { LiveFigure } from "@/components/ui/live-figure"

/* Event Feed, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: what happened to the names being watched, grouped by day, with the
   price each event left behind.
   Read first: the headline of each event. The ticker and the time sit above it, the price
   and the signed move to the right.
   The pointer: point at an event, or tab to it, and the others dim; its percent turns into
   the dollar move in place. Press an event to keep it read out while the
   pointer moves on; press it again to let go.
   Lab sketch: src/components/lab/EventFeed.tsx. Kept: days as groups, the data shape
   (symbol, time, headline, price, delta) and the tabular price column. Changed: no card
   around each day and no header band; the move is text in green or red, not a pill, and a
   fall is red, not amber; the coin is a fill without a ring. Sample prices were not
   plausible (one ticker at two far prices) and the headlines did not belong to their
   tickers: both are rewritten, and the two AAPL prints now agree with each other.
   Formulas:
   · price before = price / (1 + delta / 100)      (SMCI 41.86 / 0.918 = 45.60)
   · move         = price − price before           (41.86 − 45.60 = −3.74)
   · up and down  = count of events by the sign of delta (sample: 4 up, 1 down)
   Marks (2026-09-30): a token shows its real mark (TokenIcon), a company or a wallet its
   real logo (BrandIcon); two letters on an ink disc only where no mark exists.
   Shipped alone: a mark is a disc in the brand's colour with the ticker's first letters in
   white; pass `renderIcon` to draw the real marks instead.
   2026-10-02 audit: the empty readout band at the top is gone (it was an nbsp at rest and
   on hover repeated the row's own price); the pointed row now swaps its percent for the
   dollar move in place. Ticker at weight 500, day heads at the 10.5px list head size, time
   at /45, hairlines at 4% and none under a day head, the pinned and pointed row on 12px
   corners, and the width set to 440 like the other AI and operations lists.
   2026-10-02 round 2: the sample is market moving events in place of consumer tech news:
   an NVDA earnings beat with EPS against the estimate, a TAO exchange listing and spot SOL
   ETF inflows today, an SMCI guidance cut and an MSFT analyst upgrade yesterday, each with
   the move it left. Prices stay under $1,000 so the price column holds. The formulas below
   use the SMCI print. */

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
    day: "Today, October 2",
    events: [
      { symbol: "NVDA", time: "16:20", headline: "Q3 EPS of $1.24 against $1.12 expected; data center revenue up 48% on the year.", price: 186.42, delta: 4.6 },
      { symbol: "TAO", time: "14:05", headline: "Listed for spot trading on two Korean exchanges; KRW and USDT books opened at 14:00.", price: 412.3, delta: 9.8 },
      { symbol: "SOL", time: "11:30", headline: "Spot SOL ETFs take $184M of net inflows, the fifth straight day of inflows.", price: 148.2, delta: 3.1 },
    ],
  },
  {
    day: "Yesterday, October 1",
    events: [
      { symbol: "SMCI", time: "16:10", headline: "Cuts full year revenue guidance to $21B from $23B on delayed rack shipments.", price: 41.86, delta: -8.2 },
      { symbol: "MSFT", time: "09:15", headline: "Analyst upgrade to buy with a $560 target, up from $500, on Azure AI capacity.", price: 512.4, delta: 1.9 },
    ],
  },
]

const signed = (v: number, dp = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}`
const before = (e: FeedEvent) => e.price / (1 + e.delta / 100)

/**
 * A market feed in the Ink register: events under their day, each a ticker, a two-line
 * headline and the price it left. Pointing at one dims the rest and reads its move in
 * dollars in the readout at the top.
 * 2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
 */
export function EventFeed({ days = DEFAULT_DAYS, title = "Market events", renderIcon, className }: EventFeedProps) {
  const reduced = useReducedMotion()
  const [hover, setHover] = useState<string | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const hot = hover ?? pin

  const all = days.flatMap((d, di) => d.events.map((e, ei) => ({ ...e, id: `${di}-${ei}` })))
  const ups = all.filter((e) => e.delta >= 0).length
  const shown = all.find((e) => e.id === hot)

  let order = 0

  return (
    <div className={cn("w-[440px] max-w-full tabular-nums", className)} role="group" aria-label={`${title}, ${all.length} events, ${ups} up, ${all.length - ups} down`}>
      {/* no visible title (2026-10-01) and no readout line (2026-10-02 audit): the name lives
          in the group's aria-label, the pointed row reads its dollar move in place */}
      <span role="status" className="sr-only">
        {shown ? `${shown.symbol} $${before(shown).toFixed(2)} to $${shown.price.toFixed(2)}, ${signed(shown.price - before(shown))}` : ""}
      </span>
      <div onPointerLeave={() => setHover(null)}>
        {days.map((d, di) => (
          <div key={d.day} role="group" aria-label={`${d.day}, ${d.events.length} events`}>
            <div className={cn("px-3 pb-1.5", di === 0 ? "pt-0" : "pt-4")}>
              <span className="text-[10.5px] text-foreground/45">{d.day}</span>
            </div>
            {d.events.map((e, ei) => {
              const id = `${di}-${ei}`
              const i = order++
              const up = e.delta >= 0
              return (
                /* the outer wrapper owns the dim so it never fights the entrance inside */
                /* the hairline sits on the wrapper so the row's fill can round inside it; the first
                   row of a day takes none, the day head's gap separates it */
                <div key={id} className={cn("transition-opacity duration-200 motion-reduce:transition-none", ei > 0 && "border-t border-foreground/[0.04]")} style={{ opacity: hot !== null && hot !== id ? 0.45 : 1 }}>
                  <motion.button
                    type="button"
                    aria-pressed={pin === id}
                    aria-label={`${e.symbol}, ${e.time}, ${e.headline} $${e.price.toFixed(2)}, ${signed(e.delta)}%`}
                    onPointerEnter={() => setHover(id)}
                    onFocus={() => setHover(id)}
                    onBlur={() => setHover(null)}
                    onClick={() => setPin((p) => (p === id ? null : id))}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-[12px] px-3 py-3 text-left outline-none transition-colors duration-150 hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.06] motion-reduce:transition-none",
                      pin === id && cn(SURFACE, "hover:bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))]"),
                    )}
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: i * 0.035 }}
                  >
                    <Mark symbol={e.symbol} size={24} renderIcon={renderIcon} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-[11.5px] font-medium text-foreground/90">{e.symbol}</span>
                        <span className="text-[10px] text-foreground/45">{e.time}</span>
                      </span>
                      <span className="mt-1 block text-[12px] leading-[1.5] text-foreground/70">{e.headline}</span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2.5 pt-px">
                      <span className="w-[52px] text-right text-[11.5px] text-foreground/90">${e.price.toFixed(2)}</span>
                      {/* the pointed row reads its move in dollars here; it swaps once on point and
                          once on let go (an intent change), never on its own */}
                      <span className="w-[50px] text-right text-[11px] font-medium" style={{ color: up ? GREEN : RED }}>
                        <LiveFigure intent={hot === id ? id : null}>
                          {hot === id ? `${signed(e.price - before(e)).replace(/^([+−])/, "$1$")}` : `${signed(e.delta)}%`}
                        </LiveFigure>
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
