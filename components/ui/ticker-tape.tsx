"use client"

import { useId, useState } from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

/** one full loop of the tape, seconds */
const LOOP = 30

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
function Pass({ rows, hidden }: { rows: TickerRow[]; hidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {rows.map((r) => {
        const up = r.change >= 0
        return (
          <div key={r.symbol} className="flex items-baseline gap-2 px-5">
            <span className="text-[12px] font-semibold text-foreground/85">{r.symbol}</span>
            <span className="text-[12px] tabular-nums text-foreground/70">{fmtPrice(r.price)}</span>
            <span className="text-[11px] tabular-nums" style={{ color: up ? GREEN : RED }}>
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
 * A finance tape gliding through a hairline rail, the kind that runs under a
 * market header. Symbols drift left on a seamless loop; hovering rests a
 * finger on the tape and it holds still. Signed moves read green up, red down.
 * Reduced motion shows the tape standing still.
 */
export function TickerTape({ rows = DEFAULT_ROWS, className }: { rows?: TickerRow[]; className?: string }) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState(false)
  const anim = `tape-${useId().replace(/:/g, "")}`

  return (
    <div
      className={cn("w-full max-w-[560px] overflow-hidden rounded-xl border border-foreground/[0.04]", className)}
      style={{ background: "var(--card)", boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)" }}
      role="marquee"
      aria-label="Market ticker tape"
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
    >
      <style>{`@keyframes ${anim} { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
      <div className="relative overflow-hidden py-2.5">
        {reduced ? (
          <Pass rows={rows} />
        ) : (
          <div className="flex w-max" style={{ animation: `${anim} ${LOOP}s linear infinite`, animationPlayState: hot ? "paused" : "running" }}>
            <Pass rows={rows} />
            <Pass rows={rows} hidden />
          </div>
        )}
        {/* edge fades from the card ground */}
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10" style={{ background: "linear-gradient(90deg, var(--card), transparent)" }} />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10" style={{ background: "linear-gradient(270deg, var(--card), transparent)" }} />
      </div>
    </div>
  )
}
