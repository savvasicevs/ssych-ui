"use client"

import { useId, useState, type ReactNode } from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { usePointed } from "@/components/ui/use-pointed"

/* Ticker Tape, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card: the 12px corner, the outline, the inner highlight and the card ground are
     gone, the tape runs on the page
   · the ends fade through a mask, not through two strips painted in the card colour, so
     it sits on any ground
   · tabular numerals are set once on the root
   2026-10-02 audit: his call that anything streaming runs only while pointed at, so the
   tape stands still at rest and drifts while the pointer is on it (usePointed; in view on
   touch). A finger resting on a symbol (pressing it) or keyboard focus on it holds the tape,
   keeps that symbol full and dims the rest; each symbol is a real button now, so the
   keyboard can reach and hold it. Each symbol carries its mark through a renderIcon slot
   (the preview passes the real token and company marks). The preview stage is 160px.
   Formulas: none; every figure is the caller's (price, and the signed 24h move in percent). */

const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

/** one full loop of the tape, seconds */
const LOOP = 30
/** both ends fade out over 40px */
const FADE = "linear-gradient(90deg, transparent, black 40px, black calc(100% - 40px), transparent)"

export interface TickerRow {
  symbol: string
  price: number
  /** signed 24h move, percent */
  change: number
}

const DEFAULT_ROWS: TickerRow[] = [
  { symbol: "BTC", price: 97482.5, change: 1.84 },
  { symbol: "ETH", price: 3714.2, change: -0.62 },
  { symbol: "NVDA", price: 138.27, change: 2.41 },
  { symbol: "AAPL", price: 229.86, change: 0.34 },
  { symbol: "SPY", price: 601.12, change: -0.18 },
  { symbol: "TAO", price: 486.9, change: 4.07 },
  { symbol: "SOL", price: 214.63, change: -1.29 },
  { symbol: "AMZN", price: 227.48, change: 0.91 },
  { symbol: "MSFT", price: 452.3, change: -0.44 },
  { symbol: "VIX", price: 14.82, change: -3.15 },
]

const fmtPrice = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* one pass of the symbols, rendered twice so −50% lands exactly on the seam */
function Pass({
  rows,
  hot,
  onHot,
  hidden,
  renderIcon,
}: {
  rows: TickerRow[]
  hot: string | null
  onHot: (symbol: string | null) => void
  hidden?: boolean
  renderIcon?: (symbol: string, size: number) => ReactNode
}) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {rows.map((r) => {
        const up = r.change >= 0
        return (
          <button
            key={r.symbol}
            type="button"
            tabIndex={hidden ? -1 : 0}
            aria-label={`${r.symbol} ${fmtPrice(r.price)}, ${up ? "up" : "down"} ${Math.abs(r.change).toFixed(2)}%`}
            onPointerDown={() => onHot(r.symbol)}
            onPointerUp={() => onHot(null)}
            onPointerLeave={() => onHot(null)}
            onFocus={() => onHot(r.symbol)}
            onBlur={() => onHot(null)}
            className={cn(
              "flex items-center gap-2 rounded-full px-5 py-1 outline-none transition-opacity duration-200 focus-visible:bg-foreground/[0.06]",
              hot !== null && hot !== r.symbol && "opacity-45",
            )}
          >
            {renderIcon && <span className="grid shrink-0 place-items-center">{renderIcon(r.symbol, 14)}</span>}
            <span className="text-[12px] font-semibold text-foreground/90">{r.symbol}</span>
            <span className="text-[12px] text-foreground/70">{fmtPrice(r.price)}</span>
            <span className="text-[11px]" style={{ color: up ? GREEN : RED }}>
              {up ? "+" : "−"}
              {Math.abs(r.change).toFixed(2)}%
            </span>
          </button>
        )
      })}
    </div>
  )
}

export interface TickerTapeProps {
  rows?: TickerRow[]
  /** a symbol's mark (token or company logo) at `size` px; letters are never drawn for it */
  renderIcon?: (symbol: string, size: number) => ReactNode
  className?: string
}

/**
 * A finance tape, the kind that runs under a market header. At rest it stands still; while
 * it is pointed at, the symbols drift left on a seamless loop. Pressing a symbol, or focusing
 * it, holds the tape and steps the others back. Signed moves read green up, red down.
 * Reduced motion shows the tape standing still.
 */
export function TickerTape({ rows = DEFAULT_ROWS, renderIcon, className }: TickerTapeProps) {
  const reduced = useReducedMotion()
  const pointed = usePointed()
  const [hot, setHot] = useState<string | null>(null)
  const anim = `tape-${useId().replace(/:/g, "")}`
  const running = pointed.live && hot === null

  return (
    <div
      ref={pointed.ref}
      {...pointed.bind}
      className={cn("w-full max-w-[560px] overflow-hidden py-2 tabular-nums", className)}
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
      role="marquee"
      aria-label={`Market ticker tape, ${rows.length} symbols`}
      /* focus can scroll a clipped box to show a symbol; the tape keeps its own place */
      onScroll={(e) => {
        e.currentTarget.scrollLeft = 0
      }}
    >
      {reduced ? (
        <Pass rows={rows} hot={hot} onHot={setHot} renderIcon={renderIcon} />
      ) : (
        <>
          <style>{`@keyframes ${anim} { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
          <div className="flex w-max" style={{ animation: `${anim} ${LOOP}s linear infinite`, animationPlayState: running ? "running" : "paused" }}>
            <Pass rows={rows} hot={hot} onHot={setHot} renderIcon={renderIcon} />
            <Pass rows={rows} hot={hot} onHot={setHot} renderIcon={renderIcon} hidden />
          </div>
        </>
      )}
    </div>
  )
}
