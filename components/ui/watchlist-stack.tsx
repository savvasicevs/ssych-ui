"use client"

import { useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Watchlist Stack, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: the shares being watched, one to a row: what it is, the session as a
   small line, the price and the day's move.
   Read first: the right column, price over its signed move.
   The pointer: pointing at a row steps the others back; scrubbing a row's line puts that
   moment's price and its time where the price and move are; pressing a row opens the
   share; "Add stock" takes a fill.
   Sketch used: src/components/lab/WatchlistStack.tsx. Kept: mark, ticker over company, a
   small centred line, price over a signed coloured move, the line seeded from the ticker
   so it ends on the price and starts where the move implies, the scrub, the narrow
   variant. Changed: no embossed card, grooved dividers, gradient outline or shadow; rows
   part by one hairline. Each session line takes the direction of its move again, green up
   and red down (colour pass, 2026-09-30); the dashed base under gainers stays gone. The scrub readout is the row's own
   price cell (it was a floating chip). Brand marks in brand colours became ink
   monograms; a custom mark can still be passed. The title and the stock count are gone
   (2026-10-01): the rows say what it is and how many; the title names it for screen readers.
   Sample data fixed: prices were not the shares' (Alphabet at 1,230, Amazon at 340) and
   the subtitle counted five stocks over four rows. Prices are now near the real ones and
   the count is the length of the list.
   Formulas:
   · move            given, or (last − first of the series) ÷ first × 100
   · series          from price ÷ (1 + move ÷ 100) to the price, with a seeded wobble
   · price at a point  series value × price ÷ last value of the series
   · time at a point   09:30 + place in the series × 390 minutes ÷ (points − 1)    Marks (2026-09-30): a token shows its real mark (TokenIcon), a company or a wallet its
   real logo (BrandIcon); two letters on an ink disc only where no mark exists.
   Library (2026-09-30): ships alone, so a mark is a disc in its --coin-<symbol> colour with
   its letters in white; `renderIcon` draws the real mark in its place. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

export interface WatchStock {
  ticker: string
  name: string
  price: number
  /** the day's move in percent; worked from the series when left out */
  changePct?: number
  /** the session, oldest to newest, on any positive scale */
  series: number[]
  /** a mark of your own, 28px round; the first two letters of the ticker when left out */
  tile?: ReactNode
}

export interface WatchlistStackProps {
  /** names the list for screen readers */
  title?: string
  stocks?: WatchStock[]
  onAdd?: () => void
  onSelect?: (ticker: string) => void
  /** narrower lines, so company names breathe in a tight column */
  compact?: boolean
  /** draws a token, company or wallet mark in place of the built-in disc; a row's own `tile` wins */
  renderIcon?: (symbol: string, size: number) => ReactNode
  className?: string
}

/* the brand colour of each mark, only ever the fallback of its --coin-<symbol> property;
   a glyph colour is given where white would not read on the disc */
const MARKS: Record<string, { disc: string; glyph?: string }> = {
  GOOGL: { disc: "var(--coin-googl, #4285f4)" },
  SPOT: { disc: "var(--coin-spot, #1db954)" },
  AMZN: { disc: "var(--coin-amzn, #ff9900)", glyph: "var(--coin-amzn-glyph, #000)" },
  SNAP: { disc: "var(--coin-snap, #fffc00)", glyph: "var(--coin-snap-glyph, #000)" },
  MSFT: { disc: "var(--coin-msft, #00a4ef)" },
  NVDA: { disc: "var(--coin-nvda, #76b900)" },
  TSLA: { disc: "var(--coin-tsla, #cc0000)" },
  META: { disc: "var(--coin-meta, #0467df)" },
  NFLX: { disc: "var(--coin-nflx, #e50914)" },
  BTC: { disc: "var(--coin-btc, #f7931a)" },
  ETH: { disc: "var(--coin-eth, #627eea)" },
  SOL: { disc: "var(--coin-sol, #9945ff)" },
}

/** A session that ends on the price and starts where the move implies, seeded off the ticker. */
export function traceFor(price: number, changePct: number, ticker: string, n = 14): number[] {
  const start = price / (1 + changePct / 100)
  let seed = [...ticker].reduce((a, c) => a + c.charCodeAt(0), 0)
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5
  const amp = Math.abs(price - start) * 0.55 + price * 0.0015
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return +(start + (price - start) * t + (i === 0 || i === n - 1 ? 0 : rnd() * amp)).toFixed(4)
  })
}

const stock = (ticker: string, name: string, price: number, changePct: number): WatchStock => ({
  ticker,
  name,
  price,
  changePct,
  series: traceFor(price, changePct, ticker),
})

const DEFAULT_STOCKS: WatchStock[] = [
  stock("GOOGL", "Alphabet", 182.4, 3.4),
  stock("SPOT", "Spotify", 642.89, 1.9),
  stock("AMZN", "Amazon", 201.3, -2.1),
  stock("SNAP", "Snap", 8.94, -4.8),
]

const H = 28
const OPEN_MINUTE = 9 * 60 + 30
const SESSION_MINUTES = 390

const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`
const clock = (i: number, n: number) => {
  const m = OPEN_MINUTE + Math.round((i / Math.max(1, n - 1)) * SESSION_MINUTES)
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

function Row({ stock: s, index, compact, dim, onHot, onSelect, renderIcon }: { stock: WatchStock; index: number; compact: boolean; dim: boolean; onHot: (on: boolean) => void; onSelect?: (ticker: string) => void; renderIcon?: (symbol: string, size: number) => ReactNode }) {
  const reduced = useReducedMotion()
  const mark = MARKS[s.ticker.toUpperCase()]
  const boxRef = useRef<HTMLSpanElement>(null)
  const [hi, setHi] = useState<number | null>(null)

  const data = s.series.length ? s.series : [s.price]
  const last = data.length - 1
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = Math.max(1e-9, max - min)
  const width = compact ? 72 : 90
  const x = (i: number) => 2 + (i / Math.max(1, last)) * (width - 4)
  const y = (v: number) => 3 + (1 - (v - min) / span) * (H - 6)
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ")
  const move = s.changePct ?? (data[0] ? ((data[last] - data[0]) / data[0]) * 100 : 0)
  const scale = data[last] ? s.price / data[last] : 1
  const hue = move >= 0 ? GREEN : RED

  const onMove = (e: React.PointerEvent) => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setHi(Math.max(0, Math.min(last, Math.round(((e.clientX - r.left - 2) / (r.width - 4)) * last))))
  }

  return (
    /* the outer row owns the dim so it never fights the entrance inside */
    <button
      type="button"
      aria-label={`${s.name}, ${usd(s.price)}, ${signedPct(move)} today`}
      onClick={() => onSelect?.(s.ticker)}
      onPointerEnter={() => onHot(true)}
      onPointerLeave={() => onHot(false)}
      onFocus={() => onHot(true)}
      onBlur={() => onHot(false)}
      className="block w-full border-t border-foreground/[0.05] text-left outline-none transition-[opacity,background-color,transform,translate,scale,rotate] duration-200 hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.06] active:scale-[0.98]"
      style={{ opacity: dim ? 0.45 : 1 }}
    >
      <motion.span
        className="grid items-center px-3 py-2.5"
        style={{ columnGap: compact ? 10 : 14, gridTemplateColumns: `28px minmax(0,1fr) ${width}px minmax(${compact ? 68 : 76}px,auto)` }}
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: Math.min(index, 7) * 0.035 }}
      >
        {s.tile == null && renderIcon ? (
          renderIcon(s.ticker, 28)
        ) : s.tile == null && mark ? (
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-semibold"
            style={{ background: mark.disc, color: mark.glyph ?? "var(--coin-glyph, #fff)" }}
          >
            {s.ticker.slice(0, 2)}
          </span>
        ) : (
          <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/[0.07] text-[9px] font-semibold text-foreground/70">
            {s.tile ?? s.ticker.slice(0, 2)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-semibold leading-tight text-foreground/90">{s.ticker}</span>
          <span className="mt-0.5 block truncate text-[10.5px] text-foreground/45">{s.name}</span>
        </span>
        <span ref={boxRef} className="block cursor-crosshair touch-none" onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
          <svg aria-hidden width={width} height={H} viewBox={`0 0 ${width} ${H}`} fill="none" className="block overflow-visible">
            <motion.path
              d={line}
              stroke={hue}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: Math.min(index, 7) * 0.035 }}
            />
            {hi !== null && (
              <g pointerEvents="none">
                <line x1={x(hi)} y1={0} x2={x(hi)} y2={H} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth="1" />
                <circle cx={x(hi)} cy={y(data[hi])} r="2.5" fill={hue} />
              </g>
            )}
          </svg>
        </span>
        {/* the price cell swaps in place under the scrub (text swap: 4px, 2px blur, 150ms) from a
            dimmed copy, so it never blinks out; reduced motion keeps the fade */}
        <motion.span
          key={hi ?? "rest"}
          role="status"
          className="block text-right"
          initial={reduced ? { opacity: 0.4 } : { opacity: 0.4, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          <span className="block text-[12px] font-medium leading-tight text-foreground/90">{usd(hi === null ? s.price : data[hi] * scale)}</span>
          {hi === null ? (
            <span className="mt-0.5 block text-[10.5px] font-medium" style={{ color: ink(move >= 0 ? GREEN : RED) }}>
              {signedPct(move)}
            </span>
          ) : (
            <span className="mt-0.5 block text-[10.5px] text-foreground/45">{clock(hi, data.length)}</span>
          )}
        </motion.span>
      </motion.span>
    </button>
  )
}

/**
 * A watchlist as rows on hairlines: mark, ticker over company, the session as a line,
 * price over the day's signed move. Scrubbing a line reads any moment in the price cell.
 */
export function WatchlistStack({ title = "Watchlist", stocks = DEFAULT_STOCKS, onAdd, onSelect, compact = false, renderIcon, className }: WatchlistStackProps) {
  const [hot, setHot] = useState<string | null>(null)
  const ups = stocks.filter((s) => (s.changePct ?? 0) >= 0).length

  return (
    <div className={cn("w-full max-w-[400px] tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)} role="group" aria-label={`${title}, ${stocks.length} stocks, ${ups} up`}>
      <div className="flex justify-end px-3 pb-2">
        <button
          type="button"
          onClick={onAdd}
          className="-mr-2 rounded-full px-2 py-1 text-[11px] font-medium text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 active:scale-[0.97] hover:bg-foreground/[0.08] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] focus-visible:text-foreground/90"
        >
          Add stock
        </button>
      </div>
      <div onPointerLeave={() => setHot(null)}>
        {stocks.map((s, i) => (
          <Row key={s.ticker} stock={s} index={i} compact={compact} dim={hot !== null && hot !== s.ticker} onHot={(on) => setHot(on ? s.ticker : null)} onSelect={onSelect} renderIcon={renderIcon} />
        ))}
      </div>
    </div>
  )
}
