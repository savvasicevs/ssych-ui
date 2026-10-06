"use client"

import { useId, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent, ReactNode } from "react"
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react"
import { Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { useWidth } from "@/components/ui/use-width"
import { BUTTON, ICON_BUTTON } from "@/components/ui/control-classes"
import { ChartCard } from "@/components/ui/chart-overlay"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { ChartMenu } from "@/components/ui/performance-chart-menu"

/* Graph Comparison, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: building a comparison. Up to four series are on the plot; the rest wait
   in a row under them, one press from being added.
   Read first: the row of series on the plot, each with its move over the window.
   The pointer: a series on the plot is a button. Pointing at it keeps its line full and
   dims the rest; pressing it takes it off the plot. A waiting series is a button that
   adds it. Scrubbing the plot reads every series at that close. Left and right arrows
   walk the closes, Escape lets go.
   Sketch: lab/GraphComparisonPanel. Kept: a set of series that can be added to and taken
   from, four at most, the suggestions, the window tabs, lines that draw in, a legend.
   Changed: the card, the side panel and every outline are gone and the parts stack in
   one column 480 wide (the sketch was 920 with a 238px side panel); each series on the
   plot has its own colour, in the house order blue, lilac, copper, amber, yellow (teal is
   skipped: green means up in the moves beside them), and a series keeps its colour while
   it is on the plot; pointing at one keeps it full and dims the rest; the list of series and
   the legend were two copies of one thing and are one row now; the funnel button that
   hid the suggestions is gone; the heading tag is gone, and since 2026-10-01 the title, the
   "n of 4 on the plot" count and the "Add" caption are gone too (the title is the group's
   aria-label, the caption the add row's); since 2026-10-01 the "Dec 26 · indexed to Jan 3"
   line is for screen readers only, the series sit in one row of tighter chips that
   scrolls sideways rather than wrapping, and each colour key is a dot, not a dash; at four
   series adding is closed (the sketch dropped the oldest without saying so).
   Fixed in the sample numbers: the sketch drew a different random walk for each window,
   so 1M was not the tail of 1Y. There is one series of 52 weekly closes for each symbol
   and a window is a cut of it. "TYT" is not a listing; it is MSFT here.
   Against fresh/CompareLines: that compares a fixed set; here the set is the point.
   2026-10-02 audit: one row at the top. The series on the plot are h-7 chips at 11.5px in the
   control material with the 6px series dot (it turns into a cross under the pointer, since
   a press takes the series off) and an optional company mark through a new `renderIcon`
   slot; the second row of waiting series became one "Add" button at the row's end that
   opens a menu of them (the dashboards' dropdown look, performance-chart-menu.tsx), and the
   window switch is the shared SegmentedControl on the row's right, not a hand made one
   centred under the plot. The chips no longer carry figures: scrubbing reads every series'
   move in the shared ChartCard beside the cursor, highest first, and the lines past the
   pointer dim to 0.45. Gridlines are solid at 5% with the 0% line the stronger one, axis
   figures at /45. 500 wide, the Comparison family's width; three series open on the plot
   so the row has room for a fourth.
   Formulas:
   · index at close i = close at i ÷ close at the window's first close × 100
   · move = index − 100, in percent
   · order = by index at the last close of the window, highest first
   · colour = the first free slot of the palette when the series is put on the plot
   · axis lines = the smallest step of 2, 5, 10, 25 or 50 points that gives five lines or
     fewer; 100, written 0%, is the only solid one
   Motion (2026-10-01): the lines sweep in from the left once the chart is a third in view
   (one clip, 900ms); a new window or a series added or taken off tweens every line and the
   axis lines to the new scale (400ms), an added series fades in and a removed one fades
   out; reduced motion shows each state at once. */

const EASE = [0.16, 1, 0.3, 1] as const
const CSS_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"
/** one colour per series, in the house order; teal (--chart-2) is left out because green
 *  already means up on this surface. Past the palette a series is the one "Other" ink. */
const PALETTE = ["var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-amber)", "var(--chart-4)"]
const OTHER = "color-mix(in srgb, var(--foreground) 22%, transparent)"
/** the lift spring, for presses */
const PRESS = { type: "spring", stiffness: 500, damping: 30 } as const
/** the lowest palette slot the other series on the plot do not hold */
const freeSlot = (taken: Record<string, number>, on: string[]) => {
  const used = new Set(on.map((sym) => taken[sym]))
  let k = 0
  while (used.has(k)) k++
  return k
}

export interface ComparisonSeries {
  symbol: string
  /** what the closes measure, such as "Share price" */
  label: string
  /** weekly closes, oldest first */
  closes: number[]
}

export interface GraphComparisonProps {
  series?: ComparisonSeries[]
  /** one label for each close */
  labels?: string[]
  /** the symbols on the plot on arrival */
  selected?: string[]
  /** how many series the plot holds */
  max?: number
  title?: string
  /** draws a series' mark (a company or token logo) in its chip and in the add menu */
  renderIcon?: (symbol: string, size: number) => ReactNode
  /** the plot's height in px (2026-10-06); 180 left out */
  height?: number
  /** the windows and their close counts; weekly left out, daily is 31 / 92 / 183 / 365 */
  periods?: readonly ComparisonPeriod[]
  className?: string
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
/** a day of a 365-day year as "Mar 25"; 0 is Jan 1 */
const dayLabel = (d: number) => {
  let m = 0
  let r = d
  while (m < 11 && r >= DAYS_IN[m]) {
    r -= DAYS_IN[m]
    m++
  }
  return `${MONTHS[m]} ${r + 1}`
}

const CLOSES = 52
/* 52 Fridays of 2025, Jan 3 to Dec 26 */
const DEFAULT_LABELS = Array.from({ length: CLOSES }, (_, i) => dayLabel(2 + i * 7))

/** weekly closes from a seeded walk; the first close is the given price */
const walk = (seed: number, start: number, drift: number, vol: number) => {
  let s = seed
  let v = start
  const out = [start]
  for (let i = 1; i < CLOSES; i++) {
    s = (s * 16807) % 2147483647
    v = Math.max(start * 0.4, v * (1 + drift + (s / 2147483647 - 0.5) * vol))
    out.push(Number(v.toFixed(2)))
  }
  return out
}

const DEFAULT_SERIES: ComparisonSeries[] = [
  { symbol: "NVDA", label: "Share price", closes: walk(7, 138.3, 0.007, 0.09) },
  { symbol: "AMZN", label: "Share price", closes: walk(17, 224.2, 0.004, 0.06) },
  { symbol: "SPY", label: "Share price", closes: walk(31, 591.9, 0.003, 0.035) },
  { symbol: "MSFT", label: "Share price", closes: walk(47, 423.4, 0.003, 0.05) },
  { symbol: "VIX", label: "Index", closes: walk(67, 16.1, 0, 0.16) },
  { symbol: "AAPL", label: "Share price", closes: walk(83, 243.4, 0.002, 0.055) },
]

const DEFAULT_SELECTED = ["NVDA", "AMZN", "SPY"]

/** how many weekly closes each window holds (the default; pass `periods` for daily data) */
const PERIODS = [
  { key: "1M", closes: 5 },
  { key: "3M", closes: 14 },
  { key: "6M", closes: 27 },
  { key: "1Y", closes: 52 },
] as const
type PeriodKey = (typeof PERIODS)[number]["key"]
/** a window and how many closes it holds; daily data is 31 / 92 / 183 / 365 (2026-10-06) */
export type ComparisonPeriod = { key: PeriodKey; closes: number }

const PAD = { r: 40, t: 10, b: 20 }

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`

/** a window's line through every close, always written with `m` vertices (a short window
 *  repeats its closes), so a new window tweens the path instead of redrawing it */
function linePath(vals: number[], m: number, px: (j: number) => number, py: (v: number) => number) {
  const n = vals.length
  let d = ""
  for (let k = 0; k < m; k++) {
    const j = m > 1 && n > 1 ? Math.round((k * (n - 1)) / (m - 1)) : 0
    d += `${k ? " L" : "M"}${px(j).toFixed(1)},${py(vals[j]).toFixed(1)}`
  }
  return d
}

/**
 * A comparison that is put together by hand: series on the plot can be taken off, waiting
 * ones added from a menu, four at most. Lines are indexed to the start of the window.
 */
export function GraphComparison({
  series = DEFAULT_SERIES,
  labels = DEFAULT_LABELS,
  selected = DEFAULT_SELECTED,
  max = 4,
  title = "Graph comparison",
  renderIcon,
  height = 180,
  periods = PERIODS,
  className,
}: GraphComparisonProps) {
  // laid out at the width it is given (2026-10-06), so the text keeps its size when stretched
  const [boxRef, W] = useWidth<HTMLDivElement>(500)
  const H = height
  const PLOT = W - PAD.r
  const PLOT_H = H - PAD.t - PAD.b
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const svgRef = useRef<SVGSVGElement>(null)
  /* the sweep waits until the plot is a third in view, then plays once */
  const play = useInView(svgRef, { once: true, amount: 0.3 }) || !!reduced
  const tween = reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }
  const room = Math.max(1, max)
  const [shown, setShown] = useState<string[]>(() => selected.slice(0, room))
  /** which palette slot each series holds; a series keeps it while it is on the plot */
  const [slots, setSlots] = useState<Record<string, number>>(() => Object.fromEntries(selected.slice(0, room).map((sym, k) => [sym, k])))
  const [period, setPeriod] = useState<PeriodKey>("1Y")
  const [hot, setHot] = useState<string | null>(null)
  const [at, setAt] = useState<number | null>(null)

  const usable = series.filter((s) => s.closes.length > 1)
  const on = usable.filter((s) => shown.includes(s.symbol))
  const waiting = usable.filter((s) => !shown.includes(s.symbol))
  const full = on.length >= room

  const len = usable.length ? Math.min(...usable.map((s) => s.closes.length)) : 2
  const n = Math.max(2, Math.min(len, periods.find((p) => p.key === period)?.closes ?? len))
  const start = len - n
  const cut = on.map((s) => {
    const base = s.closes[start] || 1
    const prices = s.closes.slice(start, start + n)
    return { ...s, prices, idx: prices.map((v) => (v / base) * 100) }
  })
  const order = [...cut.keys()].sort((a, b) => cut[b].idx[n - 1] - cut[a].idx[n - 1])
  const inkOf = (i: number) => PALETTE[slots[cut[i].symbol] ?? PALETTE.length] ?? OTHER

  const all = cut.flatMap((s) => s.idx)
  const lo = all.length ? Math.min(...all, 100) : 90
  const hi = all.length ? Math.max(...all, 100) : 110
  const pad = (hi - lo || 1) * 0.06
  const min = lo - pad
  const top = hi + pad
  const x = (i: number) => (i / (n - 1)) * PLOT
  const y = (v: number) => PAD.t + (1 - (v - min) / (top - min || 1)) * PLOT_H
  const step = [2, 5, 10, 25, 50, 100].find((st) => (top - min) / st <= 5) ?? 200
  const grid: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= top; v += step) grid.push(v)

  const i = Math.min(at ?? n - 1, n - 1)
  const label = (k: number) => labels[start + k] ?? `close ${start + k + 1}`

  const remove = (symbol: string) => {
    setShown((list) => (list.length > 1 ? list.filter((x2) => x2 !== symbol) : list))
    setHot(null)
  }
  const add = (symbol: string) => {
    if (shown.length >= room || shown.includes(symbol)) return
    setSlots((t) => ({ ...t, [symbol]: freeSlot(t, shown) }))
    setShown([...shown, symbol])
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    setAt(Math.max(0, Math.min(n - 1, Math.round((px / PLOT) * (n - 1)))))
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0
    if (d) {
      e.preventDefault()
      setAt((c) => Math.max(0, Math.min(n - 1, (c ?? n - 1) + d)))
    } else if (e.key === "Escape") setAt(null)
  }
  const dateTicks = [...new Set([0, Math.round((n - 1) / 2), n - 1])]
  /* the lines left of the pointer stay full, the rest dims to 0.45 */
  const split = at === null ? W + 8 : x(i)
  const lineGroup = (key: string) => (
    <AnimatePresence initial={false}>
      {cut.map((s, k) => {
        const lit = hot === s.symbol
        return (
          /* the group owns the dim and the fade of a series coming or going; the line
             inside tweens its path */
          <motion.g
            key={`${key}-${s.symbol}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: hot !== null && !lit ? 0.35 : 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.16, ease: EASE }}
          >
            <motion.path
              initial={false}
              animate={{ d: linePath(s.idx, len, x, y) }}
              transition={tween}
              fill="none"
              stroke={inkOf(k)}
              strokeWidth={lit ? 2.1 : 1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.g>
        )
      })}
    </AnimatePresence>
  )

  return (
    <div ref={boxRef} role="group" aria-label={title} className={cn("w-[500px] max-w-full tabular-nums", className)}>
      {/* the title is the group's label only: the series row says what is compared.
          the close being read stays for screen readers only (2026-10-01): the axis shows the dates */}
      <span role="status" className="sr-only">
        {label(i)}, indexed to {label(0)}
      </span>

      {/* one row at the top: the series on the plot and the add menu */}
      <div className="flex items-center gap-1.5">
        <div
          className="-my-1 flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="On the plot"
          onPointerLeave={() => setHot(null)}
        >
          {order.map((k) => {
            const s = cut[k]
            const last = on.length <= 1
            return (
              <motion.button
                key={s.symbol}
                type="button"
                disabled={last}
                initial={reduced ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: hot !== null && hot !== s.symbol ? 0.4 : 1, scale: 1 }}
                whileTap={reduced ? undefined : { scale: 0.97 }}
                transition={{ duration: 0.2, ease: EASE, scale: reduced ? { duration: 0 } : PRESS }}
                aria-label={`${s.symbol}, ${s.label.toLowerCase()}${last ? "" : ". Press to take it off the plot"}`}
                onPointerEnter={() => setHot(s.symbol)}
                onFocus={() => setHot(s.symbol)}
                onBlur={() => setHot(null)}
                onClick={() => remove(s.symbol)}
                className={cn(BUTTON, "group h-7 shrink-0 gap-1 pl-2.5 pr-2.5 text-[11.5px] font-medium disabled:pointer-events-none disabled:opacity-100")}
              >
                {/* the series dot; under the pointer it turns into a cross, since a press takes it off */}
                <span aria-hidden className="relative grid size-2 shrink-0 place-items-center">
                  <span className={cn("size-1.5 rounded-full transition-opacity duration-150", !last && "group-hover:opacity-0 group-focus-visible:opacity-0")} style={{ background: inkOf(k) }} />
                  {!last && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="absolute inset-0 text-foreground/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                      <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
                {renderIcon?.(s.symbol, 14)}
                <span>{s.symbol}</span>
              </motion.button>
            )
          })}
        </div>
        {waiting.length > 0 && (
          <ChartMenu
            label={full ? `Add a series, take one off first (${room} at most)` : "Add a series"}
            options={waiting.map((s) => ({ value: s.symbol, label: s.symbol, hint: s.label, icon: renderIcon?.(s.symbol, 16) }))}
            onPick={add}
            disabled={full}
            className="shrink-0"
            triggerClassName={cn(ICON_BUTTON, "size-7 disabled:pointer-events-none disabled:opacity-40")}
            chevron={false}
          >
            <Plus aria-hidden className="size-3.5" strokeWidth={2} />
          </ChartMenu>
        )}
      </div>

      <div className="relative mt-4">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full cursor-crosshair touch-none overflow-visible outline-none"
          role="img"
          tabIndex={0}
          aria-label={`${title} over ${period}, indexed to 100 on ${label(0)}. ${order.map((k) => `${cut[k].symbol} ${signed(cut[k].idx[n - 1] - 100)}`).join(", ")}`}
          onPointerMove={onMove}
          onPointerLeave={() => setAt(null)}
          onBlur={() => setAt(null)}
          onKeyDown={onKey}
        >
          <defs>
            {/* the entrance: one clip that opens from the left edge, once */}
            <clipPath id={`${uid}-draw`}>
              <motion.rect
                x={-4}
                y={-4}
                height={H + 8}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: play ? W + 8 : 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
              />
            </clipPath>
            <clipPath id={`${uid}-past`}>
              <rect x={-4} y={-4} width={split + 4} height={H + 8} />
            </clipPath>
            <clipPath id={`${uid}-ahead`}>
              <rect x={split} y={-4} width={Math.max(0, W + 8 - split)} height={H + 8} />
            </clipPath>
          </defs>

          {/* an axis line rides to its new height when the scale changes (a CSS transform, so it
              is placed before any script runs); a new step fades in and an old one out */}
          <AnimatePresence initial={false}>
            {grid.map((v) => (
              <motion.g key={v} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween}>
                <g style={{ transform: `translateY(${y(v).toFixed(1)}px)`, transition: reduced ? "none" : `transform 400ms ${CSS_EASE}` }}>
                  <line x1={0} y1={0} x2={PLOT} y2={0} stroke="var(--foreground)" strokeOpacity={v === 100 ? 0.12 : 0.05} strokeWidth={1} />
                  <text x={PLOT + 6} y={3} fontSize={9} fill="var(--foreground)" fillOpacity={0.45}>
                    {v === 100 ? "0%" : `${v > 100 ? "+" : "−"}${Math.abs(v - 100)}%`}
                  </text>
                </g>
              </motion.g>
            ))}
          </AnimatePresence>

          {dateTicks.map((k) => (
            <text key={k} x={x(k)} y={H - 5} fontSize={9} fill="var(--foreground)" fillOpacity={0.45} textAnchor={k === 0 ? "start" : k === n - 1 ? "end" : "middle"}>
              {label(k)}
            </text>
          ))}

          <g clipPath={`url(#${uid}-draw)`}>
            <g clipPath={`url(#${uid}-past)`}>{lineGroup("past")}</g>
            <g clipPath={`url(#${uid}-ahead)`} opacity={0.45}>
              {lineGroup("ahead")}
            </g>
          </g>

          {at !== null && (
            <g pointerEvents="none">
              <line x1={x(i)} y1={PAD.t} x2={x(i)} y2={PAD.t + PLOT_H} stroke="var(--foreground)" strokeOpacity={0.18} strokeWidth={1} />
              {cut.map((s, k) => (
                <circle
                  key={s.symbol}
                  cx={x(i)}
                  cy={y(s.idx[i])}
                  r={hot === s.symbol ? 3.2 : 2.6}
                  fill={inkOf(k)}
                  fillOpacity={hot !== null && hot !== s.symbol ? 0.35 : 1}
                  stroke="var(--background)"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          )}
        </svg>

        {/* the pointed close, every series' move from the window's start, highest first */}
        <ChartCard
          open={at !== null}
          x={`${(x(i) / W) * 100}%`}
          flip={x(i) > PLOT * 0.6}
          heading={label(i)}
          rows={[...cut.keys()]
            .sort((a, b) => cut[b].idx[i] - cut[a].idx[i])
            .map((k) => ({ label: cut[k].symbol, value: signed(cut[k].idx[i] - 100) }))}
          width={140}
        />
      </div>

      {/* the window switch under the plot (2026-10-02): on the top row it took the room a fourth
          series needs, so the series row overflowed and scrolled when one was added */}
      <div className="mt-3 flex justify-center">
        <SegmentedControl
          options={periods.map((p) => p.key)}
          value={period}
          onChange={(k) => {
            setPeriod(k as PeriodKey)
            setAt(null)
          }}
          label="Window"
        />
      </div>
    </div>
  )
}
