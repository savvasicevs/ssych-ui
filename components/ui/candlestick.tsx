"use client"

import { useMemo, useRef, useState } from "react"
import { useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { useWidth } from "@/components/ui/use-width"
import { AxisTag, ChartCard } from "@/components/ui/chart-overlay"

/* Candlestick, in the trading terminal's chart language (user call, 2026-10-02: "fix the
   candlestick chart to be similar to the one on the trading terminal"). The version before
   this one is in git history. What it took from the terminal's price pane:
   · many thin candles, the wick a 1px line, the body ~62% of a slot; direction is the only hue
   · solid faint gridlines with dollar figures on the right
   · a dashed guide at the last close, across the whole plot
   · the crosshair: a rule on the candle, a dashed rule on its close, a dot where they meet,
     the close as an outlined tag on the axis, and a card beside the cursor reading the bar's
     time, open, high, low, close and change
   · a volume pane under its own hairline, the same hue at 0.6
   · dates along the foot
   The header reads the last close and the move across the whole run.
   2026-10-02: the header looked weird (symbol, price, move and a "15d" all on one small
   line), so it now has the library's three tiers like Market Snapshot (spec 14.1): the
   company name at /45 with the symbol on the right, the last close as the headline with its
   cents at /35, then the run's move in its hue and the window at /45. A new `name` prop
   carries the company name.
   2026-10-02 audit: the sample company is now Alphabet (GOOGL), because NVIDIA and NVDA
   read the same at both ends of the label row (his call). The last close guide is named on
   the axis as plain 9px text (the close at /90, "Last" at /45) and steps aside under the
   pointed tag, the price ticks are 9px like the dates, and the card gains a Volume row so
   the volume pane is readable; a new `volumeUnit` prop says how many shares one unit of
   `v` stands for.
   Formulas:
   · change on a bar    = (close − open) ÷ open × 100
   · move across the run = last close − first open, and ÷ first open × 100
   · volume bar height  = volume ÷ the run's largest volume × the pane's height
   · volume in the card = v × volumeUnit shares
   Motion (2026-10-01, kept): once the chart first comes into view every candle rises out of
   its own middle and every volume bar grows off the floor, left to right under one 380ms
   stagger. CSS transitions on transform. Reduced motion draws the end state. */

const EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)"
const UP = "var(--chart-up)"
const DOWN = "var(--chart-candle-down, var(--chart-down))"

export interface Candle {
  o: number
  h: number
  l: number
  c: number
  /** relative volume, 0..1.5 */
  v: number
}

/** Deterministic walk so every render agrees (LCG, one seed): a slow climb with pullbacks. */
const DEFAULT_CANDLES: Candle[] = (() => {
  let s = 20260729
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const out: Candle[] = []
  let close = 168
  for (let i = 0; i < 90; i++) {
    const o = close
    const move = (rnd() - 0.44) * 1.9
    const c = o + move
    const h = Math.max(o, c) + rnd() * 0.9
    const l = Math.min(o, c) - rnd() * 0.9
    const v = 0.35 + rnd() * 0.8 + Math.abs(move) * 0.18
    out.push({ o, h, l, c, v })
    close = c
  }
  return out
})()

/** the price axis on the right, the date row under the volume pane */
const AXIS_W = 52
const DATE_H = 20
const GAP = 10
const PRICE_TOP = 8
/** how many dates along the foot */
const DATES = 5

/** shares, compact: 18.4M */
const shares = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${Math.round(v)}`
const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const axisUsd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`
const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
const stamp = (t: number) =>
  `${new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} ${new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`

/**
 * Candles over a volume pane that share one x. The crosshair snaps to the candle under the
 * pointer, keeps it full and dims the rest, tags its close on the axis and reads the bar in a
 * card beside the cursor. Green up, red down.
 */
export function Candlestick({
  name = "Alphabet",
  symbol = "GOOGL",
  candles = DEFAULT_CANDLES,
  start = Date.UTC(2026, 4, 12),
  interval = 4 * 3600_000,
  volumeUnit = 20_000_000,
  markers = [],
  height = 300,
  className,
}: {
  /** the chart's height in px (2026-10-06); the volume pane keeps its share */
  height?: number
  /** signals on the bars (2026-10-06): a buy sits under its bar's low, a sell over its high */
  markers?: { at: number; side: "buy" | "sell" }[]
  /** the company or market's name, read in the header's label row */
  name?: string
  symbol?: string
  /** open, high, low, close and a relative volume per bar */
  candles?: Candle[]
  /** the first bar's open time, ms since epoch (UTC) */
  start?: number
  /** one bar's length, ms */
  interval?: number
  /** shares one unit of a candle's `v` stands for; the card reads v × volumeUnit */
  volumeUnit?: number
  className?: string
}) {
  // laid out at the width it is given (2026-10-06), so the text keeps its size
  const [boxRef, W] = useWidth<HTMLDivElement>(560) // the default width, as before
  const PLOT_W = W - AXIS_W
  const H = height
  const VOL_H = Math.round(H * 0.18)
  const PRICE_BOT = H - DATE_H - VOL_H - GAP
  const VOL_BOT = H - DATE_H
  const reduced = useReducedMotion() ?? false
  const svgRef = useRef<SVGSVGElement>(null)
  const seen = useInView(svgRef, { once: true, amount: 0.3 })
  const shown = seen || reduced
  const [hi, setHi] = useState<number | null>(null)
  const n = candles.length

  const { pMin, pMax, vMax, ticks } = useMemo(() => {
    let lo = Number.POSITIVE_INFINITY
    let top = Number.NEGATIVE_INFINITY
    let vm = 0
    for (const d of candles) {
      lo = Math.min(lo, d.l)
      top = Math.max(top, d.h)
      vm = Math.max(vm, d.v)
    }
    const pad = (top - lo) * 0.06 || 1
    const a = lo - pad
    const b = top + pad
    return { pMin: a, pMax: b, vMax: vm || 1, ticks: [0.1, 0.37, 0.63, 0.9].map((f) => b - f * (b - a)) }
  }, [candles])

  const step = PLOT_W / Math.max(1, n)
  const bodyW = Math.max(1, Math.min(9, step * 0.62))
  const cx = (i: number) => (i + 0.5) * step
  const yP = (v: number) => PRICE_TOP + (1 - (v - pMin) / (pMax - pMin || 1)) * (PRICE_BOT - PRICE_TOP)
  const yV = (v: number) => VOL_BOT - (v / vMax) * (VOL_H - 4)
  const time = (i: number) => start + i * interval

  const onMove = (e: React.PointerEvent) => {
    const el = svgRef.current
    if (!el || n === 0) return
    const r = el.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHi(px > PLOT_W ? n - 1 : Math.max(0, Math.min(n - 1, Math.floor(px / step))))
  }

  const first = candles[0] ?? { o: 0, h: 0, l: 0, c: 0, v: 0 }
  const last = candles[n - 1] ?? first
  const runMove = last.c - first.o
  const runPct = first.o ? (runMove / first.o) * 100 : 0
  const runUp = runMove >= 0
  const active = hi !== null ? candles[hi] : null
  const up = active ? active.c >= active.o : runUp
  const hue = up ? UP : DOWN
  const barPct = active && active.o ? ((active.c - active.o) / active.o) * 100 : 0
  const sign = (v: number) => (v >= 0 ? "+" : "−")
  const tagY = active ? Math.max(PRICE_TOP + 8, Math.min(PRICE_BOT - 8, yP(active.c))) : 0
  const fade = reduced ? "none" : "opacity 160ms"
  /* the entrance: every candle rises from its own middle, the whole run under 380ms */
  const stagger = Math.min(0.02, 0.38 / Math.max(1, n))
  const grow = (i: number) => (reduced ? "none" : `transform 0.45s ${EASE_CSS} ${(i * stagger).toFixed(3)}s, opacity 0.45s ${EASE_CSS} ${(i * stagger).toFixed(3)}s`)
  const dates = Array.from({ length: DATES }, (_, k) => Math.round((k / (DATES - 1)) * (n - 1)))
  /* the card sits right of the cursor, and flips left past 60% of the plot */
  const flip = hi !== null && cx(hi) > PLOT_W * 0.6
  const [closeWhole, closeCents] = usd(last.c).split(".")
  const windowDays = Math.round((n * interval) / 86_400_000)
  /* the last close, named on the axis; it and any tick under it step aside for the pointed tag */
  const lastY = yP(last.c)
  const lastHidden = active !== null && Math.abs(lastY - tagY) < 13

  return (
    <div ref={boxRef} className={cn("w-[560px] max-w-full tabular-nums", className)}>
      {/* the header, three tiers (spec 14.1): name and symbol, the last close, then the run's move and its window */}
      <div className="mb-3 flex items-baseline justify-between text-[12px]">
        <span className="truncate text-foreground/45">{name}</span>
        <span className="shrink-0 pl-3 font-medium text-foreground/90">{symbol}</span>
      </div>
      <p className="m-0 text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
        {closeWhole}
        <span className="text-foreground/35">.{closeCents}</span>
      </p>
      <p className="mb-4 mt-2 flex items-baseline gap-[7px] text-[12px] font-medium" style={{ color: runUp ? UP : DOWN }}>
        <span>
          {sign(runMove)}
          {usd(Math.abs(runMove))} · {sign(runPct)}
          {Math.abs(runPct).toFixed(1)}%
        </span>
        <span className="font-normal text-foreground/45">{windowDays === 1 ? "1 day" : `${windowDays} days`}</span>
      </p>

      <div className="relative">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full cursor-crosshair touch-none"
          role="img"
          aria-label={`${name} (${symbol}) candlestick chart, ${n} bars. Last close ${usd(last.c)}, ${sign(runPct)}${Math.abs(runPct).toFixed(2)}% across the run`}
          onPointerMove={onMove}
          onPointerLeave={() => setHi(null)}
        >
          {/* price gridlines and the right-hand scale; a figure steps aside while the tag sits on it */}
          {ticks.map((t) => {
            const gy = yP(t)
            const under = (active !== null && Math.abs(gy - tagY) < 12) || Math.abs(gy - lastY) < 11
            return (
              <g key={t}>
                <line x1={0} x2={PLOT_W} y1={gy} y2={gy} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} />
                <text x={W - 4} y={gy + 3} textAnchor="end" fontSize={9} fill="var(--foreground)" fillOpacity={0.45} style={{ opacity: under ? 0 : 1, transition: fade }}>
                  {axisUsd(t)}
                </text>
              </g>
            )
          })}
          {/* the volume pane's own floor rule */}
          <line x1={0} x2={W} y1={VOL_BOT + 0.5} y2={VOL_BOT + 0.5} stroke="var(--foreground)" strokeOpacity={0.06} strokeWidth={1} />

          {/* last-close guide, named on the axis as plain text (spec 14.7): the close at /90, its name at /45 */}
          <line x1={0} x2={PLOT_W} y1={lastY} y2={lastY} stroke={runUp ? UP : DOWN} strokeOpacity={0.4} strokeDasharray="2 4" strokeWidth={1} />
          <text
            x={W - 4}
            y={lastY + 3}
            textAnchor="end"
            fontSize={9}
            fill="var(--foreground)"
            pointerEvents="none"
            style={{ opacity: lastHidden ? 0 : 1, transition: fade }}
          >
            <tspan fontWeight={500} fillOpacity={0.9}>
              {axisUsd(last.c)}
            </tspan>
            <tspan fillOpacity={0.45}> Last</tspan>
          </text>

          {candles.map((d, i) => {
            const barHue = d.c >= d.o ? UP : DOWN
            const dim = hi !== null && hi !== i
            const top = yP(Math.max(d.o, d.c))
            const bodyH = Math.max(1, Math.abs(yP(d.o) - yP(d.c)))
            return (
              <g key={i} style={{ opacity: dim ? 0.45 : 1, transition: fade }}>
                {/* volume: the same hue at 0.6, growing off the pane's floor */}
                <rect
                  x={cx(i) - bodyW / 2}
                  y={yV(d.v)}
                  width={bodyW}
                  height={VOL_BOT - yV(d.v)}
                  fill={barHue}
                  fillOpacity={0.6}
                  style={{ transformOrigin: `0px ${VOL_BOT}px`, transform: shown ? "none" : "scaleY(0)", transition: grow(i) }}
                />
                {/* the candle rises out of its own middle, between its high and its low */}
                <g
                  style={{
                    transformOrigin: `0px ${((yP(d.h) + yP(d.l)) / 2).toFixed(1)}px`,
                    transform: shown ? "none" : "scaleY(0.6)",
                    opacity: shown ? 1 : 0,
                    transition: grow(i),
                  }}
                >
                  <line x1={cx(i)} y1={yP(d.h)} x2={cx(i)} y2={yP(d.l)} stroke={barHue} strokeWidth={1} />
                  <rect x={cx(i) - bodyW / 2} y={top} width={bodyW} height={bodyH} fill={barHue} />
                </g>
              </g>
            )
          })}

          {/* dates along the foot */}
          {dates.map((i, k) => (
            <text
              key={`${i}-${k}`}
              x={k === 0 ? 2 : k === DATES - 1 ? PLOT_W - 2 : cx(i)}
              y={H - 5}
              textAnchor={k === 0 ? "start" : k === DATES - 1 ? "end" : "middle"}
              fontSize={9}
              fill="var(--foreground)"
              fillOpacity={0.45}
            >
              {day(time(i))}
            </text>
          ))}

          {/* signal markers (2026-10-06): a small triangle pointing at the bar, in the side's hue */}
          {markers.filter((m) => m.at >= 0 && m.at < n).map((m) => {
            const d = candles[m.at]
            const x = cx(m.at)
            const y = m.side === "buy" ? yP(d.l) + 9 : yP(d.h) - 9
            const tip = m.side === "buy" ? -1 : 1
            return (
              <path
                key={`${m.side}${m.at}`}
                d={`M ${x} ${y + tip * 4} L ${x - 4.5} ${y - tip * 3.5} L ${x + 4.5} ${y - tip * 3.5} Z`}
                fill={m.side === "buy" ? UP : DOWN}
                style={{ opacity: shown ? 1 : 0, transition: fade }}
              />
            )
          })}

          {/* the crosshair: a rule on the candle, a dashed rule on its close, a dot, and the close tagged on the axis */}
          {active && hi !== null && (
            <g pointerEvents="none">
              <line x1={cx(hi)} y1={PRICE_TOP - 8} x2={cx(hi)} y2={VOL_BOT} stroke="var(--foreground)" strokeOpacity={0.18} strokeWidth={1} />
              <line x1={0} y1={yP(active.c)} x2={PLOT_W} y2={yP(active.c)} stroke="var(--foreground)" strokeOpacity={0.14} strokeDasharray="3 3" strokeWidth={1} />
              <circle cx={cx(hi)} cy={yP(active.c)} r={3} fill={hue} stroke="var(--background)" strokeWidth={1.5} />
              <AxisTag x={PLOT_W + 2} y={tagY} width={AXIS_W - 4} color={hue}>
                {axisUsd(active.c)}
              </AxisTag>
            </g>
          )}
        </svg>

        {/* the bar under the cursor, read out beside it (chart-overlay.tsx) */}
        <ChartCard
          open={active !== null && hi !== null}
          x={hi !== null ? `${(cx(hi) / W) * 100}%` : 0}
          flip={flip}
          heading={hi !== null ? stamp(time(hi)) : ""}
          rows={
            active
              ? [
                  { label: "Open", value: usd(active.o) },
                  { label: "High", value: usd(active.h) },
                  { label: "Low", value: usd(active.l) },
                  { label: "Close", value: usd(active.c) },
                  { label: "Volume", value: shares(active.v * volumeUnit) },
                  { label: "Change", value: `${sign(barPct)}${Math.abs(barPct).toFixed(2)}%`, color: hue },
                ]
              : []
          }
        />
      </div>
    </div>
  )
}
