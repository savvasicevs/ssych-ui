"use client"

import { useId, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* SMA Chart, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the price is ink; the two averages each carry their own hue (--chart-1, --chart-5) so
     they are told apart, in the line, the legend dot and the scrub dot (given back
     2026-09-30). The change stays green or red. Pointing at an average dims the other lines
   · no floating box over the chart: scrubbing puts the price in the summary and both
     averages in the legend, as plain text, in place
   · the price line is 1.8px, the averages 1.2px; the scrub dots have no halo because
     there is no card colour under them
   · the summary has no rule above it and the change is signed text, not a tinted chip
   · the chart names itself to a screen reader, every figure is tabular
   Props are unchanged.
   Motion (2026-10-01): once the chart is in view the price and both averages sweep in left
   to right through one clip (0.9s; they drew on mount, off screen too); a new series morphs
   all three lines and glides the gridlines with their ticks */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`

const W = 400
const H = 190
const PAD = { r: 48 }
/** bars the change in the summary looks back over */
const LOOKBACK = 30

/** deterministic default series, a drifting daily close */
const DEFAULT_PRICES: number[] = (() => {
  let s = 61
  let v = 150
  const out: number[] = []
  for (let i = 0; i < 120; i++) {
    s = (s * 16807) % 2147483647
    v = Math.max(120, v + ((s / 2147483647) - 0.46) * 4.2)
    out.push(v)
  }
  return out
})()

const smaOf = (data: number[], win: number) => data.map((_, i) => {
  const from = Math.max(0, i - win + 1)
  const slice = data.slice(from, i + 1)
  return slice.reduce((a, b) => a + b, 0) / slice.length
})

type Key = "fast" | "slow"
/** the two overlays: label, trailing window in bars, its own hue (categorical order) */
const AVERAGES: { key: Key; label: string; win: number; hue: string }[] = [
  { key: "fast", label: "60 SMA", win: 14, hue: "var(--chart-1)" },
  { key: "slow", label: "200 SMA", win: 45, hue: "var(--chart-5)" },
]

export interface SmaChartProps {
  /** ticker shown top-left */
  symbol?: string
  /** company name beside the ticker */
  name?: string
  /** price series, oldest → latest (the two SMAs derive from it) */
  prices?: number[]
  className?: string
}

/**
 * Moving-average chart: one price line with its fast and slow averages as two quieter
 * inks and price ticks on the right edge. Scrubbing reads the bar under the pointer into
 * the summary and the legend; pointing at an average in the legend picks it out.
 */
export function SmaChart({ symbol = "AMZN", name = "Amazon.com Inc.", prices = DEFAULT_PRICES, className }: SmaChartProps) {
  const reduced = useReducedMotion()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [hot, setHot] = useState<Key | null>(null)
  const uid = useId().replace(/:/g, "")
  /* the entrance plays once, when a third of the chart is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const play = !!reduced || seen
  /** a change of data glides between the two states */
  const morph = reduced ? { duration: 0 } : { duration: 0.35, ease: EASE }

  const { n, price, avg, min, max, x, y, path } = useMemo(() => {
    const price = prices.length ? prices : [0]
    const n = price.length
    const avg: Record<Key, number[]> = { fast: smaOf(price, AVERAGES[0].win), slow: smaOf(price, AVERAGES[1].win) }
    const all = [...price, ...avg.fast, ...avg.slow]
    const min = Math.min(...all)
    const max = Math.max(...all)
    const x = (i: number) => (i / Math.max(1, n - 1)) * (W - PAD.r)
    const y = (v: number) => 8 + (1 - (v - min) / (max - min || 1)) * (H - 16)
    const path = (d: number[]) => d.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    return { n, price, avg, min, max, x, y, path }
  }, [prices])

  const last = price[n - 1]
  const base = price[Math.max(0, n - LOOKBACK)]
  const change = last - base
  const pct = (change / (base || 1)) * 100
  const up = change >= 0
  const hue = up ? GREEN : RED
  const sign = up ? "+" : "−"
  const shown = hover ?? n - 1

  const onMove = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / (W - PAD.r)) * (n - 1)))))
  }

  const fade = reduced ? "none" : "opacity 160ms, stroke 160ms"
  /* scrubbed figures swap in place (text swap: 4px, 2px blur, 150ms) from a dimmed copy so
     they never blink out mid-scrub; reduced motion keeps only the fade */
  const swap = {
    initial: reduced ? { opacity: 0.4 } : { opacity: 0.4, y: 4, filter: "blur(2px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.15, ease: EASE },
  }

  return (
    <div ref={rootRef} className={cn("w-[420px] tabular-nums", className)}>
      <div className="flex items-center justify-between">
        <span>
          <span className="text-[12.5px] font-semibold text-foreground/90">{symbol}</span>
          <span className="ml-2 text-[11px] text-foreground/45">{name}</span>
        </span>
        <span className="-mr-1.5 flex items-center gap-1" onPointerLeave={() => setHot(null)}>
          {AVERAGES.map((a) => (
            <button
              key={a.key}
              type="button"
              aria-label={`${a.label} ${avg[a.key][shown].toFixed(2)}`}
              onPointerEnter={() => setHot(a.key)}
              onFocus={() => setHot(a.key)}
              onBlur={() => setHot(null)}
              className={cn(
                "flex cursor-default items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] text-foreground/45 outline-none transition-opacity duration-200 focus-visible:bg-foreground/[0.06]",
                hot !== null && hot !== a.key && "opacity-35",
              )}
            >
              <span aria-hidden className="h-[2px] w-2 rounded-full" style={{ background: a.hue }} />
              {a.label}
              <motion.span key={shown} {...swap} className="inline-block text-foreground/90">
                {avg[a.key][shown].toFixed(2)}
              </motion.span>
            </button>
          ))}
        </span>
      </div>

      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 block cursor-crosshair touch-none"
        role="img"
        aria-label={`${symbol} price with two moving averages, last $${last.toFixed(2)}, ${sign}${Math.abs(pct).toFixed(2)}% over ${LOOKBACK} bars`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          {/* all three lines sweep in left to right, a few px wider than the plot for the round caps */}
          <clipPath id={`${uid}-reveal`}>
            <motion.rect
              x={-4}
              y={0}
              height={H}
              initial={reduced ? false : { width: 0 }}
              animate={{ width: play ? W - PAD.r + 8 : 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
            />
          </clipPath>
        </defs>

        {/* right-edge price ticks; new data glides each line and its figure */}
        {[max, max - (max - min) * 0.25, max - (max - min) * 0.5, max - (max - min) * 0.75, min].map((v, i) => (
          <g key={i}>
            <motion.line
              x1={0}
              x2={W - PAD.r}
              stroke="var(--foreground)"
              strokeOpacity={0.05}
              strokeWidth={1}
              initial={false}
              animate={{ y1: y(v), y2: y(v) }}
              transition={morph}
            />
            <motion.text
              x={W - PAD.r + 8}
              fontSize={8.5}
              fill="var(--foreground)"
              fillOpacity={0.35}
              className="tabular-nums"
              initial={false}
              animate={{ attrY: y(v) + 3 }}
              transition={morph}
            >
              {v.toFixed(2)}
            </motion.text>
          </g>
        ))}

        {/* averages first, price on top */}
        <g clipPath={`url(#${uid}-reveal)`}>
          {[...AVERAGES].reverse().map((a) => (
            <motion.path
              key={a.key}
              fill="none"
              stroke={a.hue}
              strokeWidth={1.2}
              strokeLinejoin="round"
              style={{ opacity: hot !== null && hot !== a.key ? 0.35 : 1, transition: fade }}
              initial={false}
              animate={{ d: path(avg[a.key]) }}
              transition={morph}
            />
          ))}
          <motion.path
            fill="none"
            stroke={ink(90)}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: hot !== null ? 0.35 : 1, transition: fade }}
            initial={false}
            animate={{ d: path(price) }}
            transition={morph}
          />
        </g>

        {/* guide and one dot per line */}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} y1={8} x2={x(hover)} y2={H - 8} stroke="var(--foreground)" strokeOpacity={0.16} strokeWidth={1} />
            {AVERAGES.map((a) => (
              <circle key={a.key} cx={x(hover)} cy={y(avg[a.key][hover])} r={2.2} fill={a.hue} />
            ))}
            <circle cx={x(hover)} cy={y(price[hover])} r={2.6} fill="var(--foreground)" />
          </g>
        )}
      </svg>

      {/* summary: the price under the pointer, or the last one; the change is always last against 30 bars back */}
      <div className="mt-2.5 flex items-baseline justify-between">
        <span role="status" className="flex items-baseline gap-2">
          <motion.span key={`p${shown}`} {...swap} className="inline-block text-[13px] font-semibold text-foreground/90">
            ${price[shown].toFixed(2)}
          </motion.span>
          <motion.span key={hover == null ? "all" : `b${hover}`} {...swap} className="inline-block text-[10px] text-foreground/35">
            {hover == null ? `${n} bars` : `bar ${hover + 1} of ${n}`}
          </motion.span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-[11px] font-medium" style={{ color: hue }}>
            {sign}${Math.abs(change).toFixed(2)} · {sign}
            {Math.abs(pct).toFixed(2)}%
          </span>
          <span className="text-[10px] text-foreground/35">{LOOKBACK} bars</span>
        </span>
      </div>
    </div>
  )
}
