"use client"

import { useId, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { AxisTag } from "@/components/ui/chart-overlay"
import { LiveFigure } from "@/components/ui/live-figure"

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
   all three lines and glides the gridlines with their ticks
   2026-10-02: it had too many headers and numbers, some printed twice (the symbol and name
   with the legend on top, then the price, a bar count, the change and a second bar count
   under the plot). Now it has the library's one header in three tiers like Market Snapshot
   (spec 14.1): the company name at /45 with the symbol on the right, the price as the
   headline with its cents at /35, then the change over the last 30 days in its hue and that
   window at /45. Scrubbing reads the pointed day into the same header, its change counted
   30 days back from it. The legend sits under the header (spec 14.3): a 10 by 2 line in each
   average's hue, its name at /60 and its value at /90. Under the plot only one line is left,
   blank at rest, that says how long ago the pointed day was (spec 13.1).
   2026-10-02 audit: the averages were mislabelled (a "60 SMA" computed over 14 bars and a
   "200 SMA" over 45), so they are now the 20 and 50 day averages, computed and labelled so.
   Scrubbing changes the headline and the legend values in place; the headline swaps only
   when a scrub starts or ends (it blurred in again on every step). The plot spans the
   root at 440 (it stopped 20px short of the header), the axis prints three round dollar
   ticks at 9px /45, dates run along the foot, and the pointed price is the shared AxisTag.
   The line under the plot is gone: while scrubbing, the window slot reads "30 days to" the
   pointed date. A new `end` prop dates the last close.
   Formulas:
   · an n day SMA at a day = the mean of that day's close and the n − 1 closes before it
     (fewer near the start of the series)
   · change = the shown close − the close 30 days before it; percent = change ÷ that close × 100
   · a bar's date = end − (the bars after it) days */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`

const W = 440
const H = 200
const PAD = { r: 48, b: 20 }
/** how many dates along the foot */
const FOOT = 4
const DAY = 86_400_000
const axisUsd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`
const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
/** days (bars) the change in the header looks back over */
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
  { key: "fast", label: "20 SMA", win: 20, hue: "var(--chart-1)" },
  { key: "slow", label: "50 SMA", win: 50, hue: "var(--chart-5)" },
]

export interface SmaChartProps {
  /** ticker, on the right of the header's label row */
  symbol?: string
  /** company name, on the left of the header's label row */
  name?: string
  /** daily closes, oldest → latest (the two SMAs derive from it) */
  prices?: number[]
  /** the last close's date, ms since epoch (UTC); one bar is one day */
  end?: number
  className?: string
}

/**
 * Moving-average chart: one price line with its fast and slow averages as two quieter
 * inks and price ticks on the right edge. Scrubbing reads the bar under the pointer into
 * the header and the legend; pointing at an average in the legend picks it out.
 */
export function SmaChart({ symbol = "AMZN", name = "Amazon.com Inc.", prices = DEFAULT_PRICES, end = Date.UTC(2026, 8, 30), className }: SmaChartProps) {
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
    const y = (v: number) => 8 + (1 - (v - min) / (max - min || 1)) * (H - PAD.b - 16)
    const path = (d: number[]) => d.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    return { n, price, avg, min, max, x, y, path }
  }, [prices])

  const last = price[n - 1]
  const shown = hover ?? n - 1
  /* the change in the header: the shown day against LOOKBACK days before it (fewer near the start) */
  const from = Math.max(0, shown - LOOKBACK)
  const back = shown - from
  const base = price[from]
  const change = price[shown] - base
  const pct = (change / (base || 1)) * 100
  const up = change >= 0
  const hue = up ? GREEN : RED
  const sign = up ? "+" : "−"
  /* the aria-label keeps the rest reading: the last close against LOOKBACK days back */
  const restBase = price[Math.max(0, n - 1 - LOOKBACK)]
  const restPct = ((last - restBase) / (restBase || 1)) * 100
  const [priceWhole, priceCents] = price[shown].toFixed(2).split(".")

  const onMove = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / (W - PAD.r)) * (n - 1)))))
  }

  const fade = reduced ? "none" : "opacity 160ms, stroke 160ms"
  const date = (i: number) => end - (n - 1 - i) * DAY
  const foot = Array.from({ length: FOOT }, (_, k) => Math.round((k / (FOOT - 1)) * (n - 1)))
  const ticks = [0.15, 0.5, 0.85].map((f) => max - f * (max - min))
  const tagY = hover == null ? 0 : Math.max(16, Math.min(H - PAD.b - 8, y(price[hover])))

  return (
    <div ref={rootRef} className={cn("w-[440px] max-w-full tabular-nums", className)}>
      {/* the header, three tiers (spec 14.1): name and symbol, the price, then its change and window */}
      <div className="mb-3 flex items-baseline justify-between text-[12px]">
        <span className="truncate text-foreground/45">{name}</span>
        <span className="shrink-0 pl-3 font-medium text-foreground/90">{symbol}</span>
      </div>
      {/* the readout swaps only when a scrub starts or ends; while scrubbing it follows the pointer in place */}
      <div role="status">
        <LiveFigure intent={hover == null ? null : "scrub"}>
          <p className="m-0 text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
            ${Number(priceWhole).toLocaleString("en-US")}
            <span className="text-foreground/35">.{priceCents}</span>
          </p>
          <p className="mb-0 mt-2 flex items-baseline gap-[7px] text-[12px] font-medium" style={{ color: hue }}>
            <span>
              {sign}${Math.abs(change).toFixed(2)} · {sign}
              {Math.abs(pct).toFixed(1)}%
            </span>
            <span className="font-normal text-foreground/45">
              {back === 1 ? "1 day" : `${back} days`}
              {hover != null && ` to ${day(date(hover))}`}
            </span>
          </p>
        </LiveFigure>
      </div>

      {/* the legend (spec 14.3): a line in each average's hue, its name and its value at the shown day */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1" onPointerLeave={() => setHot(null)}>
        {AVERAGES.map((a) => (
          <button
            key={a.key}
            type="button"
            aria-label={`${a.label} ${avg[a.key][shown].toFixed(2)}`}
            onPointerEnter={() => setHot(a.key)}
            onFocus={() => setHot(a.key)}
            onBlur={() => setHot(null)}
            className={cn(
              "-mx-1 flex cursor-default items-center gap-1.5 rounded-full px-1 text-[11px] text-foreground/60 outline-none transition-opacity duration-200 focus-visible:bg-foreground/[0.06] motion-reduce:transition-none",
              hot !== null && hot !== a.key && "opacity-35",
            )}
          >
            <span aria-hidden className="h-[2px] w-2.5 shrink-0 rounded-full" style={{ background: a.hue }} />
            {a.label}
            <span className="inline-block font-medium text-foreground/90">{avg[a.key][shown].toFixed(2)}</span>
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block h-auto w-full cursor-crosshair touch-none"
        role="img"
        aria-label={`${name} (${symbol}) price with two moving averages, last $${last.toFixed(2)}, ${restPct >= 0 ? "+" : "−"}${Math.abs(restPct).toFixed(2)}% over ${LOOKBACK} days`}
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

        {/* right-edge price ticks; new data glides each line and its figure, which steps aside under the pointed tag */}
        {ticks.map((v, i) => (
          <g key={i} style={{ opacity: hover != null && Math.abs(y(v) - tagY) < 12 ? 0 : 1, transition: fade }}>
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
              fontSize={9}
              fill="var(--foreground)"
              fillOpacity={0.45}
              className="tabular-nums"
              initial={false}
              animate={{ attrY: y(v) + 3 }}
              transition={morph}
            >
              {axisUsd(v)}
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

        {/* dates along the foot */}
        {foot.map((i, k) => (
          <text
            key={`${i}-${k}`}
            x={k === 0 ? 0 : k === FOOT - 1 ? W - PAD.r : x(i)}
            y={H - 5}
            textAnchor={k === 0 ? "start" : k === FOOT - 1 ? "end" : "middle"}
            fontSize={9}
            fill="var(--foreground)"
            fillOpacity={0.45}
          >
            {day(date(i))}
          </text>
        ))}

        {/* guide, one dot per line and the pointed close tagged on the axis (chart-overlay.tsx) */}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} y1={8} x2={x(hover)} y2={H - PAD.b} stroke="var(--foreground)" strokeOpacity={0.16} strokeWidth={1} />
            {AVERAGES.map((a) => (
              <circle key={a.key} cx={x(hover)} cy={y(avg[a.key][hover])} r={2.2} fill={a.hue} />
            ))}
            <circle cx={x(hover)} cy={y(price[hover])} r={2.6} fill="var(--foreground)" />
            <AxisTag x={W - PAD.r + 2} y={tagY} width={PAD.r - 4}>
              {usd(price[hover])}
            </AxisTag>
          </g>
        )}
      </svg>
    </div>
  )
}
