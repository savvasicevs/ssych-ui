"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { ICON_BUTTON } from "@/components/ui/control-classes"
import { RowAction, rowExit, useRowExit } from "@/components/ui/row-action"
import { WatchlistPicker } from "@/components/ui/watchlist-stack-picker"

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
   its letters in white; `renderIcon` draws the real mark in its place.
   2026-10-02 audit: "Add stock" was a bare text button that did nothing in the preview; it
   is now a round + (ICON_BUTTON) with a tip that opens a small search menu of the tickers
   not on the list yet (the `candidates` prop), and picking one adds its row (`onAddStock`
   hears it; `onAdd` still fires when the menu opens). Each row has a Remove in its own
   narrow end column, up on hover or focus (RowAction), that holds the row 420ms then folds
   it away (useRowExit); `onRemove` hears it. The row is no longer one big button, so the
   Remove is not nested in it: the main part stays a button for `onSelect`. The company
   name reads 11px /60, hairlines are 4%. */

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
  /** fires when the + opens the add menu */
  onAdd?: () => void
  /** fires with the stock picked from the add menu, once its row is on the list */
  onAddStock?: (stock: WatchStock) => void
  /** fires when a row's Remove is pressed; the row leaves the list */
  onRemove?: (ticker: string) => void
  /** what the add menu offers; the ones already listed are left out */
  candidates?: WatchStock[]
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

const DEFAULT_CANDIDATES: WatchStock[] = [
  stock("AAPL", "Apple", 228.02, 0.8),
  stock("MSFT", "Microsoft", 415.6, 1.2),
  stock("NVDA", "NVIDIA", 122.85, 2.6),
  stock("META", "Meta Platforms", 514.29, -0.7),
  stock("TSLA", "Tesla", 248.5, -1.9),
  stock("NFLX", "Netflix", 689.75, 0.4),
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

function Row({
  stock: s,
  index,
  compact,
  dim,
  onHot,
  onSelect,
  renderIcon,
  removing,
  busy,
  onRemove,
}: {
  stock: WatchStock
  index: number
  compact: boolean
  dim: boolean
  onHot: (on: boolean) => void
  onSelect?: (ticker: string) => void
  renderIcon?: (symbol: string, size: number) => ReactNode
  /** this row's Remove went through: it holds, then leaves */
  removing: boolean
  /** another row is leaving */
  busy: boolean
  onRemove: () => void
}) {
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
    /* the outer row owns the dim and the hover; the main part is the button that opens the
       share, the Remove sits beside it in its own column */
    <div
      className="group flex w-full items-center border-t border-foreground/[0.04] pr-3 transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.03] focus-within:bg-foreground/[0.03]"
      style={{ opacity: dim ? 0.45 : 1, background: removing ? "color-mix(in srgb, var(--foreground) 6%, transparent)" : undefined }}
      onPointerEnter={() => onHot(true)}
      onPointerLeave={() => onHot(false)}
      onFocus={() => onHot(true)}
      onBlur={() => onHot(false)}
    >
    <button
      type="button"
      aria-label={`${s.name}, ${usd(s.price)}, ${signedPct(move)} today`}
      onClick={() => onSelect?.(s.ticker)}
      className="block min-w-0 flex-1 text-left outline-none transition-[background-color,transform,translate,scale,rotate] duration-200 focus-visible:bg-foreground/[0.06] active:scale-[0.98] motion-reduce:active:scale-100"
    >
      <motion.span
        className="grid items-center py-2.5 pl-3"
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
          <span className="mt-0.5 block truncate text-[11px] text-foreground/60">{s.name}</span>
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
      {/* the row's own narrow end column: Remove comes up on hover or focus (row-action.tsx) */}
      <span className="flex w-[68px] shrink-0 justify-end">
        <RowAction
          done={removing}
          disabled={busy}
          onClick={onRemove}
          label="Remove"
          doneLabel="Removed"
          aria-label={removing ? `${s.ticker} removed` : `Remove ${s.ticker} from the watchlist`}
        />
      </span>
    </div>
  )
}

/**
 * A watchlist as rows on hairlines: mark, ticker over company, the session as a line,
 * price over the day's signed move. Scrubbing a line reads any moment in the price cell;
 * the + adds a ticker from a small search menu and each row can be removed in place.
 */
export function WatchlistStack({
  title = "Watchlist",
  stocks = DEFAULT_STOCKS,
  onAdd,
  onAddStock,
  onRemove,
  candidates = DEFAULT_CANDIDATES,
  onSelect,
  compact = false,
  renderIcon,
  className,
}: WatchlistStackProps) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<string | null>(null)
  const [list, setList] = useState(stocks)
  useEffect(() => setList(stocks), [stocks])
  const [picking, setPicking] = useState(false)
  const { leaving, start } = useRowExit()
  const ups = list.filter((s) => (s.changePct ?? 0) >= 0).length
  const listed = new Set(list.map((s) => s.ticker))
  const offer = candidates.filter((c) => !listed.has(c.ticker))
  const closePicker = useCallback(() => setPicking(false), [])

  const add = (ticker: string) => {
    const s = candidates.find((c) => c.ticker === ticker)
    setPicking(false)
    if (!s) return
    setList((l) => [...l, s])
    onAddStock?.(s)
  }
  const remove = (ticker: string) => {
    if (leaving) return
    onRemove?.(ticker)
    start(ticker, () => {
      setList((l) => l.filter((s) => s.ticker !== ticker))
      setHot(null)
    })
  }

  return (
    <div className={cn("w-full max-w-[400px] tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)} role="group" aria-label={`${title}, ${list.length} stocks, ${ups} up`}>
      <div className="relative flex justify-end px-3 pb-2">
        {/* the round + with its tip; it opens the add menu under it */}
        <span className="group/tip relative -mr-1.5 inline-flex">
          <button
            type="button"
            data-watchlist-add
            aria-label="Add stock"
            aria-haspopup="listbox"
            aria-expanded={picking}
            onClick={() => {
              setPicking((p) => !p)
              if (!picking) onAdd?.()
            }}
            className={cn(ICON_BUTTON, "h-7 w-7 active:scale-[0.97] motion-reduce:active:scale-100", picking && "bg-foreground/[0.06] text-foreground/90")}
          >
            <Plus size={14} strokeWidth={1.8} aria-hidden />
          </button>
          {!picking && (
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full right-0 mb-1.5 whitespace-nowrap rounded-[8px] border border-foreground/[0.08] px-2 py-1 text-[10.5px] text-foreground/90 opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 group-hover/tip:delay-300 group-has-[:focus-visible]/tip:opacity-100"
              style={{ background: "var(--tip-fill, color-mix(in srgb, var(--foreground) 6%, var(--background)))" }}
            >
              Add stock
            </span>
          )}
        </span>
        <WatchlistPicker open={picking} items={offer} onPick={add} onClose={closePicker} renderIcon={renderIcon} />
      </div>
      <div onPointerLeave={() => setHot(null)}>
        <AnimatePresence initial={false}>
          {list.map((s, i) => (
            <motion.div key={s.ticker} className="overflow-hidden" layout={reduced ? false : "position"} exit={rowExit(reduced)} initial={false}>
              <Row
                stock={s}
                index={i}
                compact={compact}
                dim={(leaving ?? hot) !== null && (leaving ?? hot) !== s.ticker}
                onHot={(on) => setHot(on ? s.ticker : null)}
                onSelect={onSelect}
                renderIcon={renderIcon}
                removing={leaving === s.ticker}
                busy={leaving !== null}
                onRemove={() => remove(s.ticker)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
