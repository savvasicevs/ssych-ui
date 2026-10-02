"use client"

import { useId, useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Order Book, written new through ssych-component (2026-09-29).
   What it is for: reading how much size rests at each price on both sides of a market,
   and how much of it you would walk through to reach a given level.
   Read first: the mid price on the row between the two sides.
   The pointer: point at a level, or tab to it, and every level from the touch out to it
   stays lit while the rest dim; the middle row then reads the size and the money resting
   up to that price. The grouping pills merge levels into wider price steps.
   Sketch used: src/components/lab/OrderBookPro.tsx. Kept: the level shape (price, size),
   grouping into a price step, depth that accumulates from the touch outward, bars scaled
   to the largest total on screen, spread and mid taken from the ungrouped touch, and the
   hover total. Left out: the simulated feed (the caller passes new levels), the card and
   its hairlines, the capital column heads.
   Reference ("order book" on browsable, listings only, no code read): the idea of a
   bid against ask balance under the ladder.
   Formulas:
   · bucket      a bid falls to floor(price / step) × step, an ask rises to ceil(price / step) × step,
                 so a grouped book never crosses
   · total       Σ size from the best level out to this one, on its own side
   · bar width   total ÷ the largest total among the rows shown
   · mid         (best bid + best ask) ÷ 2, ungrouped
   · spread      best ask − best bid, and in bps: spread ÷ mid × 10,000
   · money       Σ price × size over the same levels as the total
   · balance     bid total shown ÷ (bid total shown + ask total shown) */

const EASE = [0.16, 1, 0.3, 1] as const
const TAB_EASE = [0.22, 1, 0.36, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export interface OrderBookLevel {
  price: number
  /** size resting at this price, in the base unit */
  size: number
}

export interface OrderBookProps {
  symbol?: string
  /** the unit sizes are counted in */
  unit?: string
  /** any order; the best bid is the highest price */
  bids?: OrderBookLevel[]
  /** any order; the best ask is the lowest price */
  asks?: OrderBookLevel[]
  /** the smallest price step of the market */
  tick?: number
  /** price steps the ladder can be grouped into; the first is the opening one */
  groupings?: number[]
  /** levels shown on each side */
  rows?: number
  priceDp?: number
  sizeDp?: number
  className?: string
}

const TICK = 0.5
/** 67,412.5 counted in half-dollar ticks */
const MID_TICKS = 134825

/** A seeded book: 48 levels a side, one tick off the mid, with gaps and a few walls. */
const DEFAULT_BOOK: { bids: OrderBookLevel[]; asks: OrderBookLevel[] } = (() => {
  let seed = 67412
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const side = (dir: 1 | -1) => {
    const out: OrderBookLevel[] = []
    let t = MID_TICKS + dir
    for (let i = 0; i < 48; i++) {
      const wall = rnd() < 0.1 ? 3.2 : 1
      out.push({ price: t * TICK, size: Math.round((0.06 + rnd() * 1.4 * (1 + i / 24)) * wall * 1000) / 1000 })
      t += dir * (1 + Math.floor(rnd() * 3))
    }
    return out
  }
  return { bids: side(-1), asks: side(1) }
})()

const DEFAULT_GROUPINGS = [0.5, 1, 5, 10]

type Side = "bid" | "ask"
type Row = { price: number; size: number; total: number; money: number }

/** one side grouped into `step`, best level first, with running totals */
function ladder(levels: OrderBookLevel[], side: Side, step: number, tick: number): Row[] {
  const g = Math.max(1, Math.round(step / tick))
  const sums = new Map<number, { size: number; money: number }>()
  for (const l of levels) {
    const t = Math.round(l.price / tick)
    const b = side === "bid" ? Math.floor(t / g) * g : Math.ceil(t / g) * g
    const at = sums.get(b) ?? { size: 0, money: 0 }
    at.size += l.size
    at.money += l.size * l.price
    sums.set(b, at)
  }
  const sorted = Array.from(sums.entries()).sort((a, b) => (side === "bid" ? b[0] - a[0] : a[0] - b[0]))
  let total = 0
  let money = 0
  return sorted.map(([t, v]) => {
    total += v.size
    money += v.money
    return { price: t * tick, size: v.size, total, money }
  })
}

const num = (n: number, dp: number) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
const compact = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `$${(n / 1e3).toFixed(1)}K` : `$${num(n, 0)}`

/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

/**
 * A two sided ladder: asks above, bids below, the mid and the spread on the row between
 * them. Each level carries a bar of everything resting from the touch out to it. Pointing
 * at a level lights the run up to it and reads its size and money in the middle row.
 */
export function OrderBook({
  symbol = "BTC-USD",
  unit = "BTC",
  bids = DEFAULT_BOOK.bids,
  asks = DEFAULT_BOOK.asks,
  tick = TICK,
  groupings = DEFAULT_GROUPINGS,
  rows = 8,
  priceDp = 1,
  sizeDp = 3,
  className,
}: OrderBookProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const [step, setStep] = useState(groupings[0] ?? tick)
  const [hot, setHot] = useState<{ side: Side; i: number } | null>(null)

  const bidRows = useMemo(() => ladder(bids, "bid", step, tick).slice(0, rows), [bids, step, tick, rows])
  const askRows = useMemo(() => ladder(asks, "ask", step, tick).slice(0, rows), [asks, step, tick, rows])

  /* the touch is read from the ungrouped book, so a wide step never moves the mid */
  const bestBid = bids.length ? Math.max(...bids.map((l) => l.price)) : 0
  const bestAsk = asks.length ? Math.min(...asks.map((l) => l.price)) : 0
  const mid = (bestBid + bestAsk) / 2
  const spread = bestAsk - bestBid
  const bps = mid > 0 ? (spread / mid) * 10000 : 0
  /* an odd number of ticks between the two puts the mid half a tick off the grid */
  const midDp = Math.round(spread / tick) % 2 === 1 ? priceDp + 1 : priceDp

  const bidTotal = bidRows[bidRows.length - 1]?.total ?? 0
  const askTotal = askRows[askRows.length - 1]?.total ?? 0
  const largest = Math.max(bidTotal, askTotal, 1e-9)
  const bidShare = bidTotal + askTotal > 0 ? (bidTotal / (bidTotal + askTotal)) * 100 : 50

  const shown = hot ? (hot.side === "bid" ? bidRows : askRows)[hot.i] : null

  const level = (r: Row, side: Side, i: number) => {
    const hue = side === "bid" ? GREEN : RED
    const lit = hot !== null && hot.side === side && i <= hot.i
    const dim = hot !== null && !lit
    return (
      <button
        key={`${side}-${r.price}`}
        type="button"
        aria-label={`${side === "bid" ? "Bid" : "Ask"} ${num(r.price, priceDp)}, size ${num(r.size, sizeDp)}, ${num(r.total, sizeDp)} ${unit} resting up to it`}
        onPointerEnter={() => setHot({ side, i })}
        onFocus={() => setHot({ side, i })}
        onBlur={() => setHot(null)}
        className="relative grid w-full grid-cols-3 items-center px-2 py-[3px] text-left text-[11px] outline-none transition-opacity duration-150"
        style={{ opacity: dim ? 0.4 : 1 }}
      >
        <motion.span
          aria-hidden
          className="absolute inset-y-px right-0 w-full rounded-[2px]"
          style={{
            originX: 1,
            background: `color-mix(in srgb, ${hue} ${lit ? 30 : 15}%, transparent)`,
            transition: "background 150ms",
          }}
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: r.total / largest }}
          transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: i * 0.012 }}
        />
        <span className="relative font-medium" style={{ color: ink(hue) }}>
          {num(r.price, priceDp)}
        </span>
        <span className="relative text-right text-foreground/90">{num(r.size, sizeDp)}</span>
        <span className="relative text-right text-foreground/45">{num(r.total, sizeDp)}</span>
      </button>
    )
  }

  return (
    <div
      className={cn("w-[320px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}
      role="group"
      aria-label={`${symbol} order book, mid ${num(mid, midDp)}, spread ${num(spread, priceDp)}`}
    >
      <div className="mb-2 flex items-center justify-between pl-2">
        <span className="text-[13px] font-medium text-foreground/90">{symbol}</span>
        <div role="radiogroup" aria-label="Price step" className="flex items-center">
          {groupings.map((g) => {
            const on = g === step
            return (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setStep(g)}
                className={cn(
                  "relative h-7 rounded-full px-2.5 text-[11px] outline-none transition-colors duration-200",
                  on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90",
                )}
              >
                {on &&
                  (reduced ? (
                    <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
                  ) : (
                    <motion.span
                      aria-hidden
                      layoutId={`${uid}-step`}
                      className="absolute inset-0 rounded-full bg-foreground/[0.08]"
                      transition={{ duration: 0.25, ease: TAB_EASE }}
                    />
                  ))}
                <span className="relative">{num(g, priceDp)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 px-2 pb-1 text-[10px] text-foreground/45">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      <div onPointerLeave={() => setHot(null)}>
        {/* asks: the deepest at the top, the best ask against the middle row */}
        <div className="flex flex-col-reverse">{askRows.map((r, i) => level(r, "ask", i))}</div>

        <div role="status" className="flex items-baseline justify-between px-2 py-2">
          <span className="text-[13px] font-semibold text-foreground/90">{num(mid, midDp)}</span>
          <motion.span
            key={hot ? `${hot.side}-${hot.i}` : "spread"}
            className="text-[10.5px] text-foreground/45"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            {shown && hot ? (
              <>
                <span className="font-medium text-foreground/90">
                  {num(shown.total, sizeDp)} {unit}
                </span>{" "}
                · {compact(shown.money)} {hot.side === "ask" ? "up" : "down"} to {num(shown.price, priceDp)}
              </>
            ) : (
              `Spread ${num(spread, priceDp)} · ${bps.toFixed(2)} bps`
            )}
          </motion.span>
        </div>

        {/* bids: the best bid at the top, falling away below */}
        <div className="flex flex-col">{bidRows.map((r, i) => level(r, "bid", i))}</div>
      </div>

      <div className="mt-3 px-2">
        {/* the balance: both sides span the rule and a clip cuts each to its share, so the split
            moves without animating a width */}
        <div aria-hidden className="relative h-[3px]">
          <span
            className="absolute inset-0 rounded-full transition-[clip-path] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            style={{ background: `color-mix(in srgb, ${GREEN} 70%, transparent)`, clipPath: `inset(0 ${(100 - bidShare).toFixed(2)}% 0 0 round 999px)` }}
          />
          <span
            className="absolute inset-0 rounded-full transition-[clip-path] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            style={{ background: `color-mix(in srgb, ${RED} 70%, transparent)`, clipPath: `inset(0 0 0 calc(${bidShare.toFixed(2)}% + 2px) round 999px)` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-foreground/45">
          <span>
            Bids {bidShare.toFixed(1)}% · {num(bidTotal, sizeDp)}
          </span>
          <span>
            {num(askTotal, sizeDp)} · Asks {(100 - bidShare).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}
