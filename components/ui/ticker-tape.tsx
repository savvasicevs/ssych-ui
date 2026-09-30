"use client"

import { useId, useState } from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Ticker Tape, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card: the 12px corner, the outline, the inner highlight and the card ground are
     gone, the tape runs on the page
   · the ends fade through a mask, not through two strips painted in the card colour, so
     it sits on any ground
   · pointing at a symbol holds the tape still, keeps that symbol full and dims the rest
   · tabular numerals are set once on the root */

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
}: {
  rows: TickerRow[]
  hot: string | null
  onHot: (symbol: string) => void
  hidden?: boolean
}) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {rows.map((r) => {
        const up = r.change >= 0
        return (
          <div
            key={r.symbol}
            onPointerEnter={() => onHot(r.symbol)}
            className={cn(
              "flex items-baseline gap-2 px-5 transition-opacity duration-200",
              hot !== null && hot !== r.symbol && "opacity-45",
            )}
          >
            <span className="text-[12px] font-semibold text-foreground/90">{r.symbol}</span>
            <span className="text-[12px] text-foreground/70">{fmtPrice(r.price)}</span>
            <span className="text-[11px]" style={{ color: up ? GREEN : RED }}>
              {up ? "+" : "−"}
              {Math.abs(r.change).toFixed(2)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * A finance tape, the kind that runs under a market header. Symbols drift left on a
 * seamless loop; pointing at one rests a finger on the tape, it holds still and the others
 * step back. Signed moves read green up, red down. Reduced motion shows the tape standing
 * still.
 */
export function TickerTape({ rows = DEFAULT_ROWS, className }: { rows?: TickerRow[]; className?: string }) {
  const reduced = useReducedMotion()
  const [held, setHeld] = useState(false)
  const [hot, setHot] = useState<string | null>(null)
  const anim = `tape-${useId().replace(/:/g, "")}`

  return (
    <div
      className={cn("w-full max-w-[560px] overflow-hidden py-2.5 tabular-nums", className)}
      style={{ maskImage: FADE, WebkitMaskImage: FADE }}
      role="marquee"
      aria-label={`Market ticker tape, ${rows.length} symbols`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => {
        setHeld(false)
        setHot(null)
      }}
    >
      {reduced ? (
        <Pass rows={rows} hot={hot} onHot={setHot} />
      ) : (
        <>
          <style>{`@keyframes ${anim} { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
          <div className="flex w-max" style={{ animation: `${anim} ${LOOP}s linear infinite`, animationPlayState: held ? "paused" : "running" }}>
            <Pass rows={rows} hot={hot} onHot={setHot} />
            <Pass rows={rows} hot={hot} onHot={setHot} hidden />
          </div>
        </>
      )}
    </div>
  )
}
