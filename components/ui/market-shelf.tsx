"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Market Shelf, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: a named shelf of markets (trending, top movers, newly listed) as small
   pressable tiles: what each costs, how it moved today, and its week as a line.
   Read first: the four prices.
   The pointer: pointing at a tile steps the others back, brings its line to full strength
   and writes its week under the shelf; pressing a tile opens that market; "See all" takes a
   fill.
   Sketch used: src/components/lab/MarketShelfPro.tsx. Kept: the titled shelf with a way
   to see all, tiles of mark, name, price, the day's change and a 7 day line. Changed: no
   outlined tiles, the flame beside the title is gone, the change is signed coloured text
   with no chip, "See all" is ink (it was blue). Each week's line takes the direction of its
   week, green up and red down (colour pass, 2026-09-30). Coin marks keep
   their own colour: a disc in var(--coin-<symbol>) with white letters, or the real mark
   through `renderIcon`; a symbol with no colour on file is two letters on ink.
   Sample data fixed: the sketch priced BNB at $0.10 and XRP at $7.85 and listed Solana
   twice at two prices. The four are now BNB, SOL, XRP and DOGE at plausible prices, and
   each week's line ends on the price it is shown with.
   Formulas:
   · week's change   (last − first of the 7 day series) ÷ first × 100
   · week's range    lowest and highest of the 7 day series
   · up, down        count of tiles whose day's change is above or below zero */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

/** brand colours of the sample coins, each the fallback of its --coin-<symbol> property */
const COIN: Record<string, string> = {
  BNB: "var(--coin-bnb, #f3ba2f)",
  SOL: "var(--coin-sol, #9945ff)",
  XRP: "var(--coin-xrp, #23292f)",
  DOGE: "var(--coin-doge, #c2a633)",
}

/** a coin's mark: a disc in its own colour with its first letters in white; a symbol with no
 *  colour on file is two letters on ink. `renderIcon` draws the real mark instead. */
function Mark({ symbol, size, renderIcon }: { symbol: string; size: number; renderIcon?: (symbol: string, size: number) => ReactNode }) {
  if (renderIcon) return <>{renderIcon(symbol, size)}</>
  const disc = COIN[symbol.toUpperCase()]
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

export interface ShelfMarket {
  name: string
  symbol: string
  /** percent over 24 hours */
  change: number
  /** 7 days of prices, oldest to newest; the last one is the price shown */
  week: number[]
}

export interface MarketShelfProps {
  title?: string
  markets?: ShelfMarket[]
  onSelect?: (symbol: string) => void
  onSeeAll?: () => void
  /** draws a coin's mark in place of the coloured disc */
  renderIcon?: (symbol: string, size: number) => ReactNode
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

/** four points a day for seven days, from the price a week ago to the price now */
const week = (price: number, weekChange: number, seed: number) => bridge(price / (1 + weekChange / 100), price, seed, 28, price * 0.05)

const DEFAULT_MARKETS: ShelfMarket[] = [
  { name: "BNB", symbol: "BNB", change: 5.6, week: week(578, 4.1, 19) },
  { name: "Solana", symbol: "SOL", change: -2.2, week: week(148.2, -6.3, 11) },
  { name: "XRP", symbol: "XRP", change: -1.2, week: week(2.2, 2.4, 13) },
  { name: "Dogecoin", symbol: "DOGE", change: 3.1, week: week(0.162, -3.8, 17) },
]

const W = 56
const H = 22

const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: v < 10 ? 4 : 2, maximumFractionDigits: v < 10 ? 4 : 2 })}`
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`

/**
 * A shelf of markets as tiles: price, the day's signed change and the week as a line.
 * Pointing at a tile writes its week under the shelf; pressing it opens the market.
 */
export function MarketShelf({ title = "Trending", markets = DEFAULT_MARKETS, onSelect, onSeeAll, renderIcon, className }: MarketShelfProps) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<string | null>(null)

  const rows = markets.map((m) => {
    const data = m.week.length ? m.week : [0]
    const last = data.length - 1
    const min = Math.min(...data)
    const max = Math.max(...data)
    const span = Math.max(1e-9, max - min)
    const line = data.map((v, i) => `${i === 0 ? "M" : "L"} ${((i / Math.max(1, last)) * W).toFixed(2)} ${(2 + (1 - (v - min) / span) * (H - 4)).toFixed(2)}`).join(" ")
    return { ...m, price: data[last], min, max, line, weekChange: data[0] ? ((data[last] - data[0]) / data[0]) * 100 : 0 }
  })
  const shown = rows.find((r) => r.symbol === hot)
  const ups = rows.filter((r) => r.change > 0).length
  const downs = rows.filter((r) => r.change < 0).length

  return (
    <div className={cn("w-full max-w-[520px] tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)} role="group" aria-label={`${title}, ${rows.length} markets`}>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[13px] font-medium text-foreground/90">{title}</span>
        <button
          type="button"
          onClick={onSeeAll}
          className="-mr-2 h-7 rounded-full px-2.5 text-[11px] font-medium text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 active:scale-[0.97] hover:bg-foreground/[0.08] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] focus-visible:text-foreground/90"
        >
          See all
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-1" onPointerLeave={() => setHot(null)}>
        {rows.map((r, i) => {
          const on = hot === r.symbol
          return (
            <button
              key={r.symbol}
              type="button"
              aria-label={`${r.name}, ${usd(r.price)}, ${signedPct(r.change)} today, ${signedPct(r.weekChange)} over 7 days`}
              onClick={() => onSelect?.(r.symbol)}
              onPointerEnter={() => setHot(r.symbol)}
              onFocus={() => setHot(r.symbol)}
              onBlur={() => setHot(null)}
              /* 12 (the 24px coin mark) + 12 padding = 24 */
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-[24px] bg-foreground/[0.04] p-3 text-left outline-none transition-[opacity,background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.07] focus-visible:bg-foreground/[0.07] active:scale-[0.98]",
                hot !== null && !on && "opacity-50",
              )}
            >
              <span className="flex items-center gap-2">
                <Mark symbol={r.symbol} size={24} renderIcon={renderIcon} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[11.5px] font-medium leading-tight text-foreground/90">{r.name}</span>
                  {/* the ticker only when it says something the name does not (BNB, XRP are both) */}
                  {r.symbol !== r.name && <span className="text-[9.5px] text-foreground/45">{r.symbol}</span>}
                </span>
              </span>
              <span className="text-[13px] font-semibold text-foreground/90">{usd(r.price)}</span>
              <span className="flex items-end justify-between gap-2">
                <span className="text-[10.5px] font-medium" style={{ color: ink(r.change >= 0 ? GREEN : RED) }}>
                  {signedPct(r.change)}
                </span>
                <svg aria-hidden width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" className="shrink-0 overflow-visible">
                  <motion.path
                    d={r.line}
                    stroke={r.weekChange >= 0 ? GREEN : RED}
                    strokeOpacity={on ? 1 : 0.7}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transition: reduced ? "none" : "stroke-opacity 160ms" }}
                    initial={{ pathLength: reduced ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
                  />
                </svg>
              </span>
            </button>
          )
        })}
      </div>

      <div role="status" className="mt-2 truncate px-1 text-[10.5px] text-foreground/45">
        {/* the line swaps in place as the pointer moves (text swap: 4px, 2px blur, 150ms) from a
            dimmed copy, so it never blinks out; reduced motion keeps the fade */}
        <motion.span
          key={hot ?? "rest"}
          className="block truncate"
          initial={reduced ? { opacity: 0.4 } : { opacity: 0.4, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
        {shown ? (
          <>
            <span className="font-medium text-foreground/90">{shown.symbol}</span> · 7 days{" "}
            <span style={{ color: ink(shown.weekChange >= 0 ? GREEN : RED) }}>{signedPct(shown.weekChange)}</span> · between {usd(shown.min)} and {usd(shown.max)}
          </>
        ) : (
          `${rows.length} markets · ${ups} up, ${downs} down today`
        )}
        </motion.span>
      </div>
    </div>
  )
}
