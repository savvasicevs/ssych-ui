"use client"

import { useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { ChartCard } from "@/components/ui/chart-overlay"

/* Scatter Plot, written new through ssych-component (2026-09-29).
   What it is for: many things on two measures at once, to see which sit apart (risk
   against return, cost against quality, latency against load).
   Read first: the solid zero line. Above it gained, below it lost; how far right is how
   rough the ride was.
   The pointer: anywhere on the plot the nearest point is taken, so the reading never
   blinks out between points; it keeps full strength, drops hairlines to both axes, dims
   the rest and is read in a card beside it. Tabbing to a point does the same. A press
   holds the point until it is pressed again.
   Reference: none usable, written from nothing.
   Formulas:
   · position     = the two values as given, on linear axes
   · axis bounds  = the lowest and highest value, rounded out to the gridline step
   · gridline step = the smallest of 1, 2, 2.5, 5, 10 × a power of ten that covers the
                     range in five steps or fewer
   · colour       = the sign of the vertical value: green at zero or above, red below
   Motion (2026-10-01): once the plot is a third in view the points fade in and settle 4px,
   left to right by their horizontal value, 30ms apart over 450ms (under 900ms in all; CSS
   transitions, no script per frame); reduced motion shows them placed. No data changes here.
   2026-10-02 audit: the reading of a point was a 10.5px /45 sentence in the corner with dots
   between its parts, and the pointer fell into the gaps between the 20px buttons. Now a card
   beside the point (chart-overlay.tsx) reads it: the symbol at /90 and the name after it,
   then the two measures, the vertical one in its hue; and the whole plot snaps to the nearest
   point (the buttons stay for the keyboard and the press). The grid is horizontal only and
   solid at 5% with the zero line the strong one, the x ticks are text alone, every tick
   carries its unit (new `xUnit` and `yUnit` props, "%" by default), the lone "1 year"
   caption folded into the axis name ("Return, 1y"), axis text is at /45, and the width is
   460 like the other non price charts.
   · nearest point = the smallest straight distance from the pointer, in drawn pixels */

const EASE = [0.16, 1, 0.3, 1] as const
const CSS_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export interface ScatterPoint {
  /** short name drawn beside the point */
  name: string
  /** longer name for the readout */
  detail?: string
  x: number
  y: number
}

export interface ScatterPlotProps {
  points?: ScatterPoint[]
  /** the plot's screen-reader name; the axes name the two measures on screen */
  title?: string
  /** the period, written into the vertical axis's name ("Return, 1y") */
  caption?: string
  /** unit after each horizontal tick */
  xUnit?: string
  /** unit after each vertical tick */
  yUnit?: string
  /** what the rows are, plural */
  noun?: string
  xLabel?: string
  yLabel?: string
  formatX?: (v: number) => string
  formatY?: (v: number) => string
  /** colour points by the sign of y; off, every point is ink */
  direction?: boolean
  className?: string
}

/* volatility and total return over one year, in percent: 9 up, 5 down */
const DEFAULT_POINTS: ScatterPoint[] = [
  { name: "NVDA", detail: "NVIDIA", x: 48.2, y: 62.4 },
  { name: "AVGO", detail: "Broadcom", x: 41.3, y: 47.5 },
  { name: "META", detail: "Meta Platforms", x: 34.8, y: 38.9 },
  { name: "WMT", detail: "Walmart", x: 16.9, y: 28.4 },
  { name: "JPM", detail: "JPMorgan Chase", x: 19.8, y: 24.2 },
  { name: "AMZN", detail: "Amazon", x: 29.4, y: 21.7 },
  { name: "AAPL", detail: "Apple", x: 24.6, y: 18.3 },
  { name: "MSFT", detail: "Microsoft", x: 22.1, y: 14.8 },
  { name: "GOOGL", detail: "Alphabet", x: 28.3, y: 9.6 },
  { name: "XOM", detail: "Exxon Mobil", x: 21.4, y: -4.3 },
  { name: "AMD", detail: "Advanced Micro Devices", x: 46.5, y: -8.1 },
  { name: "TSLA", detail: "Tesla", x: 58.7, y: -12.4 },
  { name: "UNH", detail: "UnitedHealth", x: 27.2, y: -18.7 },
  { name: "INTC", detail: "Intel", x: 44.9, y: -31.6 },
]

const W = 460
const H = 290
const PAD = { l: 6, r: 40, t: 16, b: 22 }

const plain = (v: number) => `${v.toFixed(1)}%`
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`
/** tick text: no decimals unless the step needs them, a true minus */
const tick = (v: number) => `${v < 0 ? "−" : ""}${Number(Math.abs(v).toFixed(2))}`

/** bounds rounded out to the step, and the gridlines between them */
function axis(vals: number[], want = 5) {
  const lo = vals.length ? Math.min(...vals) : 0
  const hi = vals.length ? Math.max(...vals) : 1
  const span = hi - lo || 1
  const pow = Math.pow(10, Math.floor(Math.log10(span / want)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((st) => span / st <= want) ?? 10 * pow
  const min = Math.floor(lo / step) * step
  const max = Math.max(min + step, Math.ceil(hi / step) * step)
  const ticks: number[] = []
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  return { min, max, ticks }
}

/**
 * Points on two measures over a quiet grid, the zero line the only solid one. Points
 * come in once, a few milliseconds apart. Pointing at one names it, measures it against
 * both axes with a hairline each way, and lets the rest step back.
 */
export function ScatterPlot({
  points = DEFAULT_POINTS,
  title = "Risk and return",
  caption = "1y",
  xUnit = "%",
  yUnit = "%",
  noun = "stocks",
  xLabel = "Volatility",
  yLabel = "Return",
  formatX = plain,
  formatY = signedPct,
  direction = true,
  className,
}: ScatterPlotProps) {
  const reduced = useReducedMotion()
  const boxRef = useRef<HTMLDivElement>(null)
  /* the points wait until the plot is a third in view, then settle in once */
  const play = useInView(boxRef, { once: true, amount: 0.3 }) || !!reduced
  const [hover, setHover] = useState<number | null>(null)
  const [pin, setPin] = useState<number | null>(null)
  const hot = hover ?? pin

  const { ax, ay } = useMemo(() => ({ ax: axis(points.map((p) => p.x)), ay: axis(points.map((p) => p.y)) }), [points])
  const x = (v: number) => PAD.l + ((v - ax.min) / (ax.max - ax.min || 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - ay.min) / (ay.max - ay.min || 1)) * (H - PAD.t - PAD.b)
  const hueOf = (p: ScatterPoint) => (direction ? (p.y >= 0 ? GREEN : RED) : "var(--foreground)")
  /** each point's place left to right, the order they come in */
  const column = useMemo(() => {
    const byX = points.map((p, i) => ({ x: p.x, i })).sort((a, b) => a.x - b.x)
    const out: number[] = []
    byX.forEach((p, k) => (out[p.i] = k))
    return out
  }, [points])

  const shown = hot !== null ? points[hot] : null
  /* the card beside the pointed point, on its left past 60% of the plot, kept inside it */
  const flip = shown !== null && x(shown.x) / W > 0.6
  const cardY = shown ? Math.max(0, Math.min(H - 92, y(shown.y) - 24)) : 0

  /* anywhere on the plot the nearest point owns the pointer, so the reading never blinks out */
  const onMove = (e: React.PointerEvent) => {
    const el = boxRef.current
    if (!el || !points.length) return
    const r = el.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const py = ((e.clientY - r.top) / r.height) * H
    let best = 0
    let dist = Number.POSITIVE_INFINITY
    points.forEach((p, i) => {
      const d = Math.hypot(x(p.x) - px, y(p.y) - py)
      if (d < dist) {
        dist = d
        best = i
      }
    })
    setHover(best)
  }

  return (
    <div className={cn("w-[480px] max-w-full tabular-nums", className)}>
      <div ref={boxRef} className="relative cursor-crosshair" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full overflow-visible"
          role="img"
          aria-label={`${title}, ${caption}: ${yLabel.toLowerCase()} against ${xLabel.toLowerCase()}, ${points.length} ${noun}, ${points.filter((p) => p.y >= 0).length} at zero or above`}
        >
          {ay.ticks.map((v) => (
            <g key={`y${v}`}>
              <line
                x1={PAD.l}
                y1={y(v)}
                x2={W - PAD.r}
                y2={y(v)}
                stroke="var(--foreground)"
                strokeOpacity={v === 0 ? 0.14 : 0.05}
                strokeWidth={1}
              />
              <text x={W - PAD.r + 8} y={y(v) + 3} fontSize={9} fill="var(--foreground)" fillOpacity={0.45}>
                {tick(v)}
                {yUnit}
              </text>
            </g>
          ))}
          {/* the horizontal measure: its ticks as text only, no vertical rules */}
          {ax.ticks.map((v) => (
            <text key={`x${v}`} x={x(v)} y={H - 6} fontSize={9} textAnchor="middle" fill="var(--foreground)" fillOpacity={0.45}>
              {tick(v)}
              {xUnit}
            </text>
          ))}
          {/* the axes name themselves at their far ends, inside the plot */}
          <text x={PAD.l + 4} y={PAD.t - 6} fontSize={9} fill="var(--foreground)" fillOpacity={0.45}>
            {caption ? `${yLabel}, ${caption}` : yLabel}
          </text>
          <text x={W - PAD.r - 4} y={H - PAD.b - 6} fontSize={9} textAnchor="end" fill="var(--foreground)" fillOpacity={0.45}>
            {xLabel}
          </text>

          {shown && (
            <g pointerEvents="none">
              <line x1={x(shown.x)} y1={y(shown.y)} x2={x(shown.x)} y2={H - PAD.b} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth={1} />
              <line x1={x(shown.x)} y1={y(shown.y)} x2={W - PAD.r} y2={y(shown.y)} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth={1} />
            </g>
          )}

          {points.map((p, i) => {
            const on = hot === i
            return (
              /* the group owns the dim so it never fights the entrance inside */
              <g key={p.name} style={{ opacity: hot !== null && !on ? 0.35 : 1, transition: reduced ? "none" : "opacity 160ms" }}>
                <circle
                  cx={x(p.x)}
                  cy={y(p.y)}
                  fill={hueOf(p)}
                  fillOpacity={direction ? 1 : 0.9}
                  stroke="var(--background)"
                  strokeWidth={1}
                  r={3.4}
                  /* each point fades in and settles 4px, left to right, 30ms apart (the stagger
                     is capped at 390ms however many points there are) */
                  style={{
                    opacity: play ? 1 : 0,
                    transform: play ? "none" : "translateY(4px)",
                    transition: reduced
                      ? "none"
                      : `opacity 450ms ${CSS_EASE} ${Math.min(0.39, column[i] * 0.03)}s, transform 450ms ${CSS_EASE} ${Math.min(0.39, column[i] * 0.03)}s`,
                  }}
                />
                {on && (
                  <motion.circle
                    cx={x(p.x)}
                    cy={y(p.y)}
                    r={6.5}
                    fill="none"
                    stroke={hueOf(p)}
                    strokeWidth={1.5}
                    pointerEvents="none"
                    style={{ transformBox: "fill-box", transformOrigin: "center" }}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.15, ease: EASE }}
                  />
                )}
              </g>
            )
          })}
        </svg>

        {/* the pointed point, read in a card beside it (chart-overlay.tsx) */}
        <ChartCard
          open={shown !== null}
          x={shown ? `${((x(shown.x) + (flip ? -4 : 4)) / W) * 100}%` : 0}
          y={cardY}
          flip={flip}
          width={168}
          heading={
            shown ? (
              <span className="flex min-w-0 gap-1.5">
                <span className="shrink-0 font-medium text-foreground/90">{shown.name}</span>
                {shown.detail && <span className="truncate">{shown.detail}</span>}
              </span>
            ) : (
              ""
            )
          }
          rows={
            shown
              ? [
                  { label: xLabel, value: formatX(shown.x) },
                  { label: yLabel, value: formatY(shown.y), color: direction ? hueOf(shown) : undefined },
                ]
              : []
          }
        />

        {/* one real button over each point: the target is larger than the mark */}
        {points.map((p, i) => (
          <button
            key={p.name}
            type="button"
            aria-label={`${p.name}${p.detail ? `, ${p.detail}` : ""}: ${xLabel.toLowerCase()} ${formatX(p.x)}, ${yLabel.toLowerCase()} ${formatY(p.y)}`}
            aria-pressed={pin === i}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => setPin((k) => (k === i ? null : i))}
            className="absolute -ml-[10px] -mt-[10px] h-5 w-5 cursor-pointer rounded-full outline-none"
            style={{ left: `${(x(p.x) / W) * 100}%`, top: `${(y(p.y) / H) * 100}%`, zIndex: hot === i ? 2 : 1 }}
          />
        ))}
      </div>
    </div>
  )
}
