// provenance: original
"use client"

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"

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
   2026-11-09, for a live feed at 60 updates a second over 10,000 levels and more: one render
   per update (the feed and the flash no longer go through effects that set state), only the
   rows shown are grouped and summed (the best `rows` buckets are picked in one pass instead
   of sorting the whole book), figures use one cached number format per precision, rows and
   the price step only re-render when what they show changes, and the bars and flashes run
   as Web Animations on the compositor. The look at normal rates is the same: a bar eases to
   its new length (0.35s, expo-out, new rows grow from nothing) and a changed row washes once
   (0.6s). When updates arrive faster than about 10 a second the animations cannot be seen
   between them, so the bars take their length at once and rows stop flashing until the feed
   slows again; reduced motion keeps the flash and drops the easing, as before.
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
                 (the best bid and ask keep their price, so the mid holds)
   · fast feed   the gap between book updates, smoothed (0.7 × last + 0.3 × new), under 80ms */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const FEED_MS = 600
/** a smoothed gap between updates under this reads as a feed too fast to animate between */
const FAST_MS = 80
const BAR_MS = 350
const FLASH_MS = 600
const BEZIER = `cubic-bezier(${EASE.join(",")})`

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

/** one side grouped into `step`, best level first, with running totals; only the best `depth`
 *  buckets are kept, picked in one pass so a deep book is never sorted whole */
function ladder(levels: OrderBookLevel[], side: Side, step: number, tick: number, depth: number): Row[] {
  const g = Math.max(1, Math.round(step / tick))
  const bucket = side === "bid"
    ? (price: number) => Math.floor(Math.round(price / tick) / g) * g
    : (price: number) => Math.ceil(Math.round(price / tick) / g) * g
  /* a is nearer the touch than b */
  const nearer = side === "bid" ? (a: number, b: number) => a > b : (a: number, b: number) => a < b
  const cap = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : Infinity
  if (cap === 0) return []
  let keys: number[]
  if (cap > 64) {
    /* a deep view: group everything and sort, as before */
    const all = new Set<number>()
    for (const l of levels) all.add(bucket(l.price))
    keys = Array.from(all).sort((a, b) => (side === "bid" ? b - a : a - b)).slice(0, cap)
  } else {
    /* the best `cap` distinct buckets, nearest first; most levels fail the first test */
    keys = []
    for (const l of levels) {
      const b = bucket(l.price)
      if (keys.length === cap && !nearer(b, keys[cap - 1])) continue
      let j = keys.length
      while (j > 0 && nearer(b, keys[j - 1])) j--
      if (j > 0 && keys[j - 1] === b) continue
      keys.splice(j, 0, b)
      if (keys.length > cap) keys.pop()
    }
  }
  if (!keys.length) return []
  const sums = new Map<number, { size: number; money: number }>()
  for (const k of keys) sums.set(k, { size: 0, money: 0 })
  const worst = keys[keys.length - 1]
  for (const l of levels) {
    const b = bucket(l.price)
    if (nearer(worst, b)) continue
    const at = sums.get(b)
    if (!at) continue
    at.size += l.size
    at.money += l.size * l.price
  }
  let total = 0
  let money = 0
  return keys.map((t) => {
    const v = sums.get(t)!
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

/* one formatter per precision: toLocaleString builds a new one on every call, which a row
   that renders 60 times a second cannot afford */
const formats = new Map<number, Intl.NumberFormat>()
const num = (n: number, dp: number) => {
  let f = formats.get(dp)
  if (!f) formats.set(dp, (f = new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })))
  return f.format(n)
}
const compact = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `$${(n / 1e3).toFixed(1)}K` : `$${num(n, 0)}`

/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

/* layout effects run before paint, so a bar never shows its new length before it eases there;
   on a server there is nothing to animate */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect

type Hot = { side: Side; i: number } | null

/** One level. It re-renders only when its own figures or its lit state change. The bar's
 *  length is its final one; the book eases it there with a Web Animation, and plays the
 *  flash on the wash span, after each commit. */
const Level = memo(function Level({
  side,
  i,
  price,
  size,
  total,
  scale,
  lit,
  dim,
  unit,
  priceDp,
  sizeDp,
  onHot,
}: {
  side: Side
  i: number
  price: number
  size: number
  total: number
  scale: number
  lit: boolean
  dim: boolean
  unit: string
  priceDp: number
  sizeDp: number
  onHot: (h: Hot) => void
}) {
  const hue = side === "bid" ? GREEN : RED
  return (
    <button
      type="button"
      data-level={`${side}-${price}`}
      aria-label={`${side === "bid" ? "Bid" : "Ask"} ${num(price, priceDp)}, size ${num(size, sizeDp)}, ${num(total, sizeDp)} ${unit} resting up to it`}
      onPointerEnter={() => onHot({ side, i })}
      onFocus={() => onHot({ side, i })}
      onBlur={() => onHot(null)}
      className="relative grid w-full grid-cols-3 items-center px-2 py-[3px] text-left text-[11px] outline-none transition-opacity duration-150"
      style={{ opacity: dim ? 0.4 : 1 }}
    >
      <span
        aria-hidden
        className="absolute inset-y-px right-0 w-full origin-right rounded-[2px]"
        style={{
          transform: `scaleX(${scale})`,
          background: `color-mix(in srgb, ${hue} ${lit ? 30 : 15}%, transparent)`,
          transition: "background 150ms",
        }}
      />
      {/* the flash: one wash in the side's hue each time this level's size changes */}
      <span
        aria-hidden
        className="absolute inset-y-px inset-x-0 rounded-[2px]"
        style={{ opacity: 0, background: `color-mix(in srgb, ${hue} 22%, transparent)` }}
      />
      <span className="relative font-medium" style={{ color: ink(hue) }}>
        {num(price, priceDp)}
      </span>
      <span className="relative text-right text-foreground/90">{num(size, sizeDp)}</span>
      <span className="relative text-right text-foreground/45">{num(total, sizeDp)}</span>
    </button>
  )
})

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
  const [hot, setHot] = useState<Hot>(null)
  const [balanceOn, setBalanceOn] = useState(false)

  /* the book the ladder draws: the caller's levels, or, while pointed at, the demo feed's move
     of them. The move remembers which levels it started from, so new levels from the caller
     win in the same render (no effect copies them into state). */
  const latest = useRef({ bids, asks })
  latest.current = { bids, asks }
  const [fed, setFed] = useState<{ bids: OrderBookLevel[]; asks: OrderBookLevel[]; from: { bids: OrderBookLevel[]; asks: OrderBookLevel[] } } | null>(null)
  const book = fed && fed.from.bids === bids && fed.from.asks === asks ? fed : { bids, asks }
  const seed = useRef(4211)
  useEffect(() => {
    if (!feed || !live) return
    const rnd = () => {
      seed.current = (seed.current * 16807) % 2147483647
      return seed.current / 2147483647
    }
    const id = window.setInterval(() => {
      setFed((f) => {
        const from = latest.current
        const b = f && f.from.bids === from.bids && f.from.asks === from.asks ? f : from
        return { bids: stepSide(b.bids, "bid", tick, rnd), asks: stepSide(b.asks, "ask", tick, rnd), from }
      })
    }, FEED_MS)
    return () => window.clearInterval(id)
  }, [feed, live, tick])

  const bidRows = useMemo(() => ladder(book.bids, "bid", step, tick, rows), [book.bids, step, tick, rows])
  const askRows = useMemo(() => ladder(book.asks, "ask", step, tick, rows), [book.asks, step, tick, rows])

  /* the touch is read from the ungrouped book, so a wide step never moves the mid */
  let bestBid = book.bids.length ? -Infinity : 0
  for (const l of book.bids) if (l.price > bestBid) bestBid = l.price
  let bestAsk = book.asks.length ? Infinity : 0
  for (const l of book.asks) if (l.price < bestAsk) bestAsk = l.price
  const mid = (bestBid + bestAsk) / 2
  const spread = bestAsk - bestBid
  const bps = mid > 0 ? (spread / mid) * 10000 : 0
  /* an odd number of ticks between the two puts the mid half a tick off the grid */
  const midDp = Math.round(spread / tick) % 2 === 1 ? priceDp + 1 : priceDp

  const bidTotal = bidRows[bidRows.length - 1]?.total ?? 0
  const askTotal = askRows[askRows.length - 1]?.total ?? 0
  const largest = Math.max(bidTotal, askTotal, 1e-9)
  const bidShare = bidTotal + askTotal > 0 ? (bidTotal / (bidTotal + askTotal)) * 100 : 50

  /* After each commit that moved the ladder: ease every bar from where it shows to its new
     length, and wash the rows whose size changed on a tick (a new step is a change of view,
     not a tick). Both are Web Animations, so neither sets state or renders again. A feed
     faster than FAST_MS between updates skips both: the next update lands before either
     could be seen. */
  const ladderRef = useRef<HTMLDivElement>(null)
  const bars = useRef(new Map<string, { from: number; to: number; anim: Animation | null }>())
  const prev = useRef<{ step: number; sizes: Map<string, number> } | null>(null)
  const pace = useRef<{ book: unknown[]; at: number; gap: number | null }>({ book: [], at: 0, gap: null })
  useBeforePaint(() => {
    const box = ladderRef.current
    if (!box) return
    const now = performance.now()
    const p = pace.current
    if (p.book[0] !== book.bids || p.book[1] !== book.asks) {
      if (p.at) p.gap = p.gap === null ? now - p.at : p.gap * 0.7 + (now - p.at) * 0.3
      pace.current = { book: [book.bids, book.asks], at: now, gap: p.gap }
    }
    const fast = pace.current.gap !== null && pace.current.gap < FAST_MS
    const ease = !reduced && !fast

    const els = new Map<string, HTMLElement>()
    box.querySelectorAll<HTMLElement>("[data-level]").forEach((el) => els.set(el.dataset.level!, el))
    const sizes = new Map<string, number>()
    const seen = new Set<string>()
    const each = (list: Row[], side: Side) => {
      for (const r of list) {
        const k = `${side}-${r.price}`
        sizes.set(k, r.size)
        seen.add(k)
        const bar = els.get(k)?.firstElementChild as HTMLElement | null | undefined
        if (!bar) continue
        const to = r.total / largest
        const was = bars.current.get(k)
        if (was && was.to === to) continue
        /* where the bar shows now: part way along its running ease, or at rest */
        let from = 0
        if (was) {
          const t = was.anim?.playState === "running" ? was.anim.effect?.getComputedTiming().progress : null
          from = t == null ? was.to : was.from + (was.to - was.from) * t
          was.anim?.cancel()
        }
        const anim = ease && typeof bar.animate === "function"
          ? bar.animate([{ transform: `scaleX(${from})` }, { transform: `scaleX(${to})` }], { duration: BAR_MS, easing: BEZIER })
          : null
        bars.current.set(k, { from, to, anim })
      }
    }
    each(bidRows, "bid")
    each(askRows, "ask")
    for (const k of bars.current.keys()) if (!seen.has(k)) bars.current.delete(k)

    const before = prev.current
    prev.current = { step, sizes }
    if (!before || before.step !== step || fast) return
    sizes.forEach((s, k) => {
      if (before.sizes.get(k) === s) return
      const wash = els.get(k)?.children[1] as HTMLElement | undefined
      if (wash && typeof wash.animate === "function") wash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLASH_MS, easing: BEZIER })
    })
  }, [bidRows, askRows, largest, step, reduced])

  const shown = hot ? (hot.side === "bid" ? bidRows : askRows)[hot.i] : null

  const level = (r: Row, side: Side, i: number) => {
    const lit = hot !== null && hot.side === side && i <= hot.i
    return (
      <Level
        key={`${side}-${r.price}`}
        side={side}
        i={i}
        price={r.price}
        size={r.size}
        total={r.total}
        scale={r.total / largest}
        lit={lit}
        dim={hot !== null && !lit}
        unit={unit}
        priceDp={priceDp}
        sizeDp={sizeDp}
        onHot={setHot}
      />
    )
  }

  /* the price step re-renders only when it changes: its thumb is a shared layout, which
     measures itself on every render */
  const stepLabels = useMemo(() => groupings.map((g) => num(g, priceDp)), [groupings, priceDp])
  const stepControl = useMemo(
    () => (
      <SegmentedControl
        options={stepLabels}
        value={num(step, priceDp)}
        onChange={(v) => {
          const g = groupings[stepLabels.indexOf(v)]
          if (g !== undefined) setStep(g)
        }}
      />
    ),
    [stepLabels, step, priceDp, groupings],
  )

  /* the readout swaps only when what is pointed at changes; feed ticks change it in place,
     and an update that leaves its text alone does not render it */
  const intent = hot ? `${hot.side}-${hot.i}` : balanceOn ? "balance" : null
  const lines: [string, string?, string?] =
    shown && hot
      ? [`${num(shown.total, sizeDp)} ${unit}`, `${compact(shown.money)} ${hot.side === "ask" ? "up" : "down"} to ${num(shown.price, priceDp)}`, "pointed"]
      : balanceOn
        ? [`Bids ${bidShare.toFixed(1)}%`, `Asks ${(100 - bidShare).toFixed(1)}%`, "balance"]
        : [`Spread ${num(spread, priceDp)}, ${bps.toFixed(2)} bps`]
  const [l0, l1, kind] = lines
  const readout = useMemo(
    () => (
      <LiveFigure intent={intent} className="flex items-baseline gap-2 text-[10.5px] text-foreground/45">
        {kind === "pointed" ? (
          <>
            <span className="font-medium text-foreground/90">{l0}</span>
            <span>{l1}</span>
          </>
        ) : kind === "balance" ? (
          <>
            <span style={{ color: ink(GREEN) }}>{l0}</span>
            <span style={{ color: ink(RED) }}>{l1}</span>
          </>
        ) : (
          <span>{l0}</span>
        )}
      </LiveFigure>
    ),
    [intent, kind, l0, l1],
  )


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
        {stepControl}
      </div>

      <div className="grid grid-cols-3 px-2 pb-1 text-[10.5px] text-foreground/45">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      <div ref={ladderRef} onPointerLeave={() => setHot(null)}>
        {/* asks: the deepest at the top, the best ask against the middle row */}
        <div className="flex flex-col-reverse">{askRows.map((r, i) => level(r, "ask", i))}</div>

        <div role="status" className="flex items-baseline justify-between gap-3 px-2 py-2">
          {/* the mid follows the feed in place */}
          <span className="text-[15px] font-semibold text-foreground/90">{num(mid, midDp)}</span>
          {readout}
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
