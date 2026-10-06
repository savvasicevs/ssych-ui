"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { LiveFigure } from "@/components/ui/live-figure"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { usePointed } from "@/components/ui/use-pointed"

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
   hover total. Left out: the card and its hairlines, the capital column heads.
   Reference ("order book" on browsable, listings only, no code read): the idea of a
   bid against ask balance under the ladder.
   2026-10-02 audit: his call was that the book should animate and do things on hover, so
   while the pointer is on it (usePointed) a seeded feed nudges sizes and adds or pulls
   levels every 600ms; sizes change in place, a changed row flashes once in its side's hue
   and the bars ease to their new length; the feed stops when the pointer leaves, and the
   book at rest is the still, complete seeded one. The footer captions that summed the book
   up at rest are gone: the balance rule stays, and pointing at it (or tabbing to it) reads
   the split in the middle row; the split is also in the aria-label. The price step uses the
   shared SegmentedControl, the heads are 10.5px, the mid is 15px so it wins over the 13px
   symbol, the readouts lost their middle dots, and the default shows 6 levels a side.
   Formulas:
   · bucket      a bid falls to floor(price / step) × step, an ask rises to ceil(price / step) × step,
                 so a grouped book never crosses
   · total       Σ size from the best level out to this one, on its own side
   · bar width   total ÷ the largest total among the rows shown
   · mid         (best bid + best ask) ÷ 2, ungrouped
   · spread      best ask − best bid, and in bps: spread ÷ mid × 10,000
   · money       Σ price × size over the same levels as the total
   · balance     bid total shown ÷ (bid total shown + ask total shown)
   · feed        each 600ms tick, 3 levels a side within the first 12 take size × (0.55 to 1.55);
                 one tick in four a level past the touch is pulled or a new one is added in a gap
                 (the best bid and ask keep their price, so the mid holds) */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const FEED_MS = 600

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
  /** run the seeded demo feed while the book is pointed at; turn it off when you pass live levels */
  feed?: boolean
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

/** one feed step on one side: nudge a few sizes, sometimes pull or add a level past the touch */
function stepSide(levels: OrderBookLevel[], side: Side, tick: number, rnd: () => number): OrderBookLevel[] {
  const sorted = [...levels].sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price))
  const reach = Math.min(12, sorted.length)
  for (let k = 0; k < 3 && reach > 0; k++) {
    const i = Math.floor(rnd() * reach)
    const l = sorted[i]
    sorted[i] = { price: l.price, size: Math.max(0.01, Math.round(l.size * (0.55 + rnd()) * 1000) / 1000) }
  }
  if (rnd() < 0.25 && reach > 3) {
    const i = 1 + Math.floor(rnd() * (reach - 1))
    if (rnd() < 0.5) sorted.splice(i, 1)
    else {
      /* a new level in the gap behind level i-1, when there is one */
      const dir = side === "bid" ? -1 : 1
      const p = sorted[i - 1].price + dir * tick
      if (Math.abs(p - sorted[i].price) > tick / 2) sorted.splice(i, 0, { price: p, size: Math.round((0.08 + rnd() * 0.9) * 1000) / 1000 })
    }
  }
  return sorted
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
 * While the book is pointed at, a demo feed moves it.
 */
export function OrderBook({
  symbol = "BTC-USD",
  unit = "BTC",
  bids = DEFAULT_BOOK.bids,
  asks = DEFAULT_BOOK.asks,
  tick = TICK,
  groupings = DEFAULT_GROUPINGS,
  rows = 6,
  priceDp = 1,
  sizeDp = 3,
  feed = true,
  className,
}: OrderBookProps) {
  const reduced = useReducedMotion()
  const { ref, live, bind } = usePointed()
  const [step, setStep] = useState(groupings[0] ?? tick)
  const [hot, setHot] = useState<{ side: Side; i: number } | null>(null)
  const [balanceOn, setBalanceOn] = useState(false)

  /* the book the ladder draws: the caller's levels, moved by the demo feed while pointed at */
  const [book, setBook] = useState({ bids, asks })
  useEffect(() => setBook({ bids, asks }), [bids, asks])
  const seed = useRef(4211)
  useEffect(() => {
    if (!feed || !live) return
    const rnd = () => {
      seed.current = (seed.current * 16807) % 2147483647
      return seed.current / 2147483647
    }
    const id = window.setInterval(() => {
      setBook((b) => ({ bids: stepSide(b.bids, "bid", tick, rnd), asks: stepSide(b.asks, "ask", tick, rnd) }))
    }, FEED_MS)
    return () => window.clearInterval(id)
  }, [feed, live, tick])

  const bidRows = useMemo(() => ladder(book.bids, "bid", step, tick).slice(0, rows), [book.bids, step, tick, rows])
  const askRows = useMemo(() => ladder(book.asks, "ask", step, tick).slice(0, rows), [book.asks, step, tick, rows])

  /* a row whose size changed on a feed tick flashes once; a new step is a change of view, not a tick */
  const prev = useRef<{ step: number; sizes: Map<string, number> } | null>(null)
  const [flashes, setFlashes] = useState<Record<string, number>>({})
  useEffect(() => {
    const sizes = new Map<string, number>()
    for (const r of bidRows) sizes.set(`bid-${r.price}`, r.size)
    for (const r of askRows) sizes.set(`ask-${r.price}`, r.size)
    const before = prev.current
    prev.current = { step, sizes }
    if (!before || before.step !== step) return
    const changed: string[] = []
    sizes.forEach((s, k) => {
      if (before.sizes.get(k) !== s) changed.push(k)
    })
    if (changed.length) setFlashes((f) => {
      const next = { ...f }
      for (const k of changed) next[k] = (next[k] ?? 0) + 1
      return next
    })
  }, [bidRows, askRows, step])

  /* the touch is read from the ungrouped book, so a wide step never moves the mid */
  const bestBid = book.bids.length ? Math.max(...book.bids.map((l) => l.price)) : 0
  const bestAsk = book.asks.length ? Math.min(...book.asks.map((l) => l.price)) : 0
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
    const k = `${side}-${r.price}`
    const pulse = flashes[k]
    return (
      <button
        key={k}
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
          transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE }}
        />
        {/* the flash: one wash in the side's hue each time this level's size changes */}
        {pulse ? (
          <motion.span
            key={pulse}
            aria-hidden
            className="absolute inset-y-px inset-x-0 rounded-[2px]"
            style={{ background: `color-mix(in srgb, ${hue} 22%, transparent)` }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          />
        ) : null}
        <span className="relative font-medium" style={{ color: ink(hue) }}>
          {num(r.price, priceDp)}
        </span>
        <span className="relative text-right text-foreground/90">{num(r.size, sizeDp)}</span>
        <span className="relative text-right text-foreground/45">{num(r.total, sizeDp)}</span>
      </button>
    )
  }

  const stepLabels = groupings.map((g) => num(g, priceDp))

  return (
    <div
      ref={ref}
      {...bind}
      className={cn("w-[320px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}
      role="group"
      aria-label={`${symbol} order book, mid ${num(mid, midDp)}, spread ${num(spread, priceDp)}, bids ${bidShare.toFixed(1)}% of the size shown, asks ${(100 - bidShare).toFixed(1)}%`}
    >
      <div className="mb-2 flex items-center justify-between pl-2">
        <span className="text-[13px] font-medium text-foreground/90">{symbol}</span>
        <SegmentedControl
          options={stepLabels}
          value={num(step, priceDp)}
          onChange={(v) => {
            const g = groupings[stepLabels.indexOf(v)]
            if (g !== undefined) setStep(g)
          }}
        />
      </div>

      <div className="grid grid-cols-3 px-2 pb-1 text-[10.5px] text-foreground/45">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      <div onPointerLeave={() => setHot(null)}>
        {/* asks: the deepest at the top, the best ask against the middle row */}
        <div className="flex flex-col-reverse">{askRows.map((r, i) => level(r, "ask", i))}</div>

        <div role="status" className="flex items-baseline justify-between gap-3 px-2 py-2">
          {/* the mid follows the feed in place */}
          <span className="text-[15px] font-semibold text-foreground/90">{num(mid, midDp)}</span>
          {/* the readout swaps only when what is pointed at changes; feed ticks change it in place */}
          <LiveFigure
            intent={hot ? `${hot.side}-${hot.i}` : balanceOn ? "balance" : null}
            className="flex items-baseline gap-2 text-[10.5px] text-foreground/45"
          >
            {shown && hot ? (
              <>
                <span className="font-medium text-foreground/90">
                  {num(shown.total, sizeDp)} {unit}
                </span>
                <span>
                  {compact(shown.money)} {hot.side === "ask" ? "up" : "down"} to {num(shown.price, priceDp)}
                </span>
              </>
            ) : balanceOn ? (
              <>
                <span style={{ color: ink(GREEN) }}>Bids {bidShare.toFixed(1)}%</span>
                <span style={{ color: ink(RED) }}>Asks {(100 - bidShare).toFixed(1)}%</span>
              </>
            ) : (
              <span>
                Spread {num(spread, priceDp)}, {bps.toFixed(2)} bps
              </span>
            )}
          </LiveFigure>
        </div>

        {/* bids: the best bid at the top, falling away below */}
        <div className="flex flex-col">{bidRows.map((r, i) => level(r, "bid", i))}</div>
      </div>

      {/* the balance: both sides span the rule and a clip cuts each to its share, so the split
          moves without animating a width. Pointing at it reads the split in the middle row. */}
      <div
        tabIndex={0}
        aria-label={`Bids ${bidShare.toFixed(1)}%, ${num(bidTotal, sizeDp)} ${unit}; asks ${(100 - bidShare).toFixed(1)}%, ${num(askTotal, sizeDp)} ${unit}`}
        onPointerEnter={() => setBalanceOn(true)}
        onPointerLeave={() => setBalanceOn(false)}
        onFocus={() => setBalanceOn(true)}
        onBlur={() => setBalanceOn(false)}
        className="mt-1 rounded-full px-2 py-2.5 outline-none focus-visible:bg-foreground/[0.04]"
      >
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
      </div>
    </div>
  )
}
