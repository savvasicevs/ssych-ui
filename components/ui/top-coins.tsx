"use client"

import { useId, useMemo, useRef, useState, type ReactNode } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Top Coins, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: the largest coins side by side over one window: price, how far each
   moved, and the shape of the move.
   Read first: the three prices, one size, each the point of its own column.
   The pointer: scrubbing a column's line puts that week's price and how long ago it was
   where the price is, and steps the other columns back; the pills slide a fill to the
   chosen window and every line tweens to it; the two arrows page the rail.
   Sketch used: src/components/lab/TopCoinsShelf.tsx. Kept: a rail of coins with name,
   price, a faded area of the window and its change, the window switch, the scrub that
   reads a price and a time, paging past three. Changed: no cards, dotted ground, green
   wash or lifted hover, the area and line are ink and only the change carries colour,
   the scrub readout takes the price's place (it was a shadowed chip), the window button
   that cycled is a row of pills, columns are 160 wide so three fit in 520. Coin marks
   keep their own colour: a disc in var(--coin-<symbol>) with white letters, or the real
   mark through `renderIcon`; a symbol with no colour on file is two letters on ink.
   Sample data fixed: the sketch typed each change apart from its line, scaled a 0 to 1
   shape to the price, and cut a yearly series to 60% and 30% while calling the cuts 30
   and 7 days. Series are now weekly prices that end on the price, the windows are the
   last 52, 26 and 13 weeks, and the change is worked from the window.
   Formulas:
   · price     the last point of the series
   · change    (last − first of the window) ÷ first × 100
   · weeks ago the window's length − the point's place in it
   Motion (2026-10-01): once the rail is a third in view each column's line and area sweep in
   from the left (one clip, 900ms, columns 50ms apart); a new window tweens every line and
   area to the new cut (400ms) where they drew again; reduced motion shows each state at once. */

const EASE = [0.16, 1, 0.3, 1] as const
const TAB_EASE = [0.22, 1, 0.36, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

type RenderIcon = (symbol: string, size: number) => ReactNode

/** brand colours of the sample coins, each the fallback of its --coin-<symbol> property */
const COIN_HUE: Record<string, string> = {
  BTC: "var(--coin-btc, #f7931a)",
  ETH: "var(--coin-eth, #627eea)",
  SOL: "var(--coin-sol, #9945ff)",
  BNB: "var(--coin-bnb, #f3ba2f)",
  XRP: "var(--coin-xrp, #23292f)",
}

/** a coin's mark: a disc in its own colour with its first letters in white; a symbol with no
 *  colour on file is two letters on ink. `renderIcon` draws the real mark instead. */
function Mark({ symbol, size, renderIcon }: { symbol: string; size: number; renderIcon?: RenderIcon }) {
  if (renderIcon) return <>{renderIcon(symbol, size)}</>
  const disc = COIN_HUE[symbol.toUpperCase()]
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold leading-none"
      style={{
        width: size,
        height: size,
        background: disc ?? "color-mix(in srgb, var(--foreground) 7%, transparent)",
        color: disc ? "var(--coin-glyph, #fff)" : "color-mix(in srgb, var(--foreground) 70%, transparent)",
        fontSize: Math.max(8, Math.round(size * 0.36)),
      }}
    >
      {symbol.slice(0, 2)}
    </span>
  )
}

export interface Coin {
  name: string
  symbol: string
  /** weekly prices, oldest to newest; the last one is the price shown */
  series: number[]
}

export interface CoinRange {
  label: string
  /** how many weeks back the window reaches */
  weeks: number
}

export interface TopCoinsProps {
  /** the rail's screen-reader name; the coins name themselves on screen */
  title?: string
  coins?: Coin[]
  ranges?: CoinRange[]
  /** draws a coin's mark in place of the coloured disc */
  renderIcon?: RenderIcon
  className?: string
}

/** a seeded path from one price to another; the wobble is pinned to nothing at both ends */
function bridge(start: number, end: number, seed: number, n: number, wobble: number) {
  let s = seed
  let drift = 0
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647
    const t = i / (n - 1)
    drift = drift * 0.82 + (s / 2147483647 - 0.5) * wobble
    out.push(start + (end - start) * t + drift * Math.sin(Math.PI * t))
  }
  return out
}

const WEEKS = 53
const coin = (name: string, symbol: string, yearAgo: number, price: number, seed: number): Coin => ({
  name,
  symbol,
  series: bridge(yearAgo, price, seed, WEEKS, price * 0.22),
})

const DEFAULT_COINS: Coin[] = [
  coin("Bitcoin", "BTC", 46750, 64619, 7),
  coin("Ethereum", "ETH", 2448, 3050, 21),
  coin("Solana", "SOL", 161.9, 148.32, 33),
  coin("BNB", "BNB", 412, 578, 45),
  coin("XRP", "XRP", 1.74, 2.2, 57),
]

const DEFAULT_RANGES: CoinRange[] = [
  { label: "1Y", weeks: 52 },
  { label: "6M", weeks: 26 },
  { label: "3M", weeks: 13 },
]

const COL = 160
const GAP = 20
const SHOWN = 3
const W = COL
const H = 64
const TOP = 6
const BOT = 4

const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: v < 10 ? 4 : 2, maximumFractionDigits: v < 10 ? 4 : 2 })}`
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`

/** a window's line through every week, always written with `m` vertices (a short window
 *  repeats its weeks), so a new window tweens the path instead of redrawing it */
function linePath(vals: number[], m: number, px: (i: number) => number, py: (v: number) => number) {
  const n = vals.length
  let d = ""
  for (let k = 0; k < m; k++) {
    const i = m > 1 && n > 1 ? Math.round((k * (n - 1)) / (m - 1)) : 0
    d += `${k ? " L" : "M"} ${px(i).toFixed(2)} ${py(vals[i]).toFixed(2)}`
  }
  return d
}

function Column({
  coin: c,
  range,
  index,
  dim,
  play,
  onHot,
  renderIcon,
}: {
  coin: Coin
  range: CoinRange
  index: number
  dim: boolean
  /** the rail is in view: the sweep may start */
  play: boolean
  onHot: (on: boolean) => void
  renderIcon?: RenderIcon
}) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const boxRef = useRef<HTMLDivElement>(null)
  const [hi, setHi] = useState<number | null>(null)

  const data = useMemo(() => {
    const cut = c.series.slice(Math.max(0, c.series.length - (range.weeks + 1)))
    return cut.length ? cut : [0]
  }, [c.series, range.weeks])
  const last = data.length - 1
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = Math.max(1e-9, max - min)
  const x = (i: number) => (i / Math.max(1, last)) * W
  const y = (v: number) => TOP + (1 - (v - min) / span) * (H - TOP - BOT)
  const line = linePath(data, Math.max(1, c.series.length), x, y)
  const tween = reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }
  const change = data[0] ? ((data[last] - data[0]) / data[0]) * 100 : 0

  const onMove = (e: React.PointerEvent) => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setHi(Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / r.width) * last))))
    onHot(true)
  }

  const shown = hi ?? last
  return (
    <div className="shrink-0 transition-opacity duration-150 ease-out" style={{ width: COL, opacity: dim ? 0.45 : 1 }}>
      <div className="flex items-center gap-2">
        <Mark symbol={c.symbol} size={24} renderIcon={renderIcon} />
        <span className="truncate text-[11.5px] font-medium text-foreground/45">{c.name}</span>
      </div>
      {/* the readout crosses over between the price and a scrubbed week, and when the window
          changes (4px, 2px blur, 150ms); while scrubbing it follows the pointer in place */}
      <motion.div
        key={`${range.label}-${hi === null ? "now" : "scrub"}`}
        role="status"
        className="mt-2"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.15, ease: EASE }}
      >
        <div className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">{usd(data[shown])}</div>
        <div className="mt-1.5 flex items-baseline gap-1.5 text-[10.5px]">
          {hi === null ? (
            <span className="font-medium" style={{ color: ink(change >= 0 ? GREEN : RED) }}>
              {signedPct(change)}
            </span>
          ) : (
            <span className="text-foreground/45">{last - hi === 0 ? "now" : `${last - hi}w ago`}</span>
          )}
        </div>
      </motion.div>

      <div
        ref={boxRef}
        className="relative mt-3 cursor-crosshair touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => {
          setHi(null)
          onHot(false)
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          fill="none"
          role="img"
          aria-label={`${c.name}, ${usd(data[last])} now, ${signedPct(change)} over ${range.label}`}
        >
          <defs>
            <linearGradient id={`tc-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
            </linearGradient>
            {/* the entrance: one clip that opens from the left edge, once */}
            <clipPath id={`tcc-${uid}`}>
              <motion.rect
                x={-4}
                y={-4}
                height={H + 8}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: play ? W + 8 : 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE, delay: Math.min(index, 3) * 0.05 }}
              />
            </clipPath>
          </defs>
          <g clipPath={`url(#tcc-${uid})`}>
            <motion.path initial={false} animate={{ d: `${line} L ${W} ${H} L 0 ${H} Z` }} transition={tween} fill={`url(#tc-${uid})`} />
            <motion.path
              initial={false}
              animate={{ d: line }}
              transition={tween}
              stroke="var(--foreground)"
              strokeOpacity={0.9}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {hi !== null && (
            <g pointerEvents="none">
              <line x1={x(hi)} y1={0} x2={x(hi)} y2={H} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth="1" />
              <circle cx={x(hi)} cy={y(data[hi])} r="2.5" fill="var(--foreground)" />
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}

/**
 * A rail of coins, three in view: each a price, its change over the window and the line
 * it came from. Scrubbing a line reads any week in place of the price.
 */
export function TopCoins({ title = "Top coins", coins = DEFAULT_COINS, ranges = DEFAULT_RANGES, renderIcon, className }: TopCoinsProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const [rangeAt, setRangeAt] = useState(0)
  const [page, setPage] = useState(0)
  const [hot, setHot] = useState<string | null>(null)
  const railRef = useRef<HTMLDivElement>(null)
  /* the lines wait until the rail is a third in view, then sweep in once */
  const play = useInView(railRef, { once: true, amount: 0.3 }) || !!reduced
  const range = ranges[rangeAt] ?? ranges[0] ?? DEFAULT_RANGES[0]
  const pages = Math.max(1, coins.length - SHOWN + 1)
  const at = Math.min(page, pages - 1)

  const arrow = (dir: -1 | 1) => {
    const off = dir === -1 ? at === 0 : at === pages - 1
    return (
      <button
        type="button"
        disabled={off}
        aria-label={dir === -1 ? "Earlier coins" : "More coins"}
        onClick={() => setPage(Math.max(0, Math.min(pages - 1, at + dir)))}
        className="grid h-7 w-7 place-items-center rounded-full text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 hover:bg-foreground/[0.08] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] focus-visible:text-foreground/90 disabled:pointer-events-none disabled:opacity-35"
      >
        <svg aria-hidden width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d={dir === -1 ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
        </svg>
      </button>
    )
  }

  return (
    <div className={cn("w-[520px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)} role="group" aria-label={`${title}, ${coins.length} coins over ${range.label}`}>
      {/* no title: the coins name themselves; the window and the paging keep the top corner */}
      <div className="mb-4 flex items-center justify-end">
        <span className="-mr-1 flex items-center">
          <span role="radiogroup" aria-label="Window" className="flex">
            {ranges.map((r, i) => {
              const on = i === rangeAt
              return (
                <button
                  key={r.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setRangeAt(i)}
                  className={cn(
                    "relative h-7 rounded-full px-3 text-[11px] font-medium outline-none transition-colors duration-200",
                    on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90",
                  )}
                >
                  {on &&
                    (reduced ? (
                      <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
                    ) : (
                      <motion.span aria-hidden layoutId={`${uid}-range`} className="absolute inset-0 rounded-full bg-foreground/[0.08]" transition={{ duration: 0.25, ease: TAB_EASE }} />
                    ))}
                  <span className="relative">{r.label}</span>
                </button>
              )
            })}
          </span>
          {pages > 1 && (
            <span className="ml-2 flex items-center">
              {arrow(-1)}
              {arrow(1)}
            </span>
          )}
        </span>
      </div>

      <div ref={railRef} className="overflow-hidden">
        <motion.div
          className="flex"
          style={{ gap: GAP }}
          initial={false}
          animate={{ x: -at * (COL + GAP) }}
          transition={reduced ? { duration: 0 } : { duration: 0.3, ease: TAB_EASE }}
        >
          {coins.map((c, i) => (
            <Column key={c.symbol} coin={c} range={range} index={i} dim={hot !== null && hot !== c.symbol} play={play} onHot={(on) => setHot(on ? c.symbol : null)} renderIcon={renderIcon} />
          ))}
        </motion.div>
      </div>
    </div>
  )
}
