"use client"

import { useId, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent } from "react"
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

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
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
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

const DEFAULT_SELECTED = ["NVDA", "AMZN", "SPY", "MSFT"]

/** how many weekly closes each window holds */
const PERIODS = [
  { key: "1M", closes: 5 },
  { key: "3M", closes: 14 },
  { key: "6M", closes: 27 },
  { key: "1Y", closes: 52 },
] as const
type PeriodKey = (typeof PERIODS)[number]["key"]

const W = 480
const H = 180
const PAD = { r: 40, t: 10, b: 20 }
const PLOT = W - PAD.r
const PLOT_H = H - PAD.t - PAD.b

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
 * ones added, four at most. Lines are indexed to the start of the window.
 */
export function GraphComparison({
  series = DEFAULT_SERIES,
  labels = DEFAULT_LABELS,
  selected = DEFAULT_SELECTED,
  max = 4,
  title = "Graph comparison",
  className,
}: GraphComparisonProps) {
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
  const n = Math.max(2, Math.min(len, PERIODS.find((p) => p.key === period)?.closes ?? len))
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
  const active = PERIODS.findIndex((p) => p.key === period)
  const dateTicks = [...new Set([0, Math.round((n - 1) / 2), n - 1])]

  return (
    <div role="group" aria-label={title} className={cn("w-[480px] max-w-full tabular-nums", className)}>
      {/* the title is the group's label only: the series row says what is compared.
          the close being read stays for screen readers only (2026-10-01): the axis shows the dates */}
      <span role="status" className="sr-only">
        {label(i)}, indexed to {label(0)}
      </span>

      {/* one row, no wrap: tighter chips fit four at 480; past that the row scrolls sideways */}
      <div
        className="-mx-2 flex flex-nowrap gap-1 overflow-x-auto px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="On the plot"
        onPointerLeave={() => setHot(null)}
      >
        {order.map((k) => {
          const s = cut[k]
          const lit = hot === s.symbol
          const move = s.idx[i] - 100
          const last = on.length <= 1
          return (
            <motion.button
              key={s.symbol}
              type="button"
              disabled={last}
              initial={reduced ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: hot !== null && !lit ? 0.4 : 1, scale: 1 }}
              whileTap={reduced ? undefined : { scale: 0.97 }}
              transition={{ duration: 0.2, ease: EASE, scale: reduced ? { duration: 0 } : PRESS }}
              aria-label={`${s.symbol}, ${s.label.toLowerCase()}, ${signed(move)} at ${label(i)}${last ? "" : ". Press to take it off the plot"}`}
              onPointerEnter={() => setHot(s.symbol)}
              onFocus={() => setHot(s.symbol)}
              onBlur={() => setHot(null)}
              onClick={() => remove(s.symbol)}
              className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-foreground/[0.05] pl-2 pr-1.5 text-[10.5px] outline-none transition-colors duration-200 hover:bg-foreground/[0.08] focus-visible:bg-foreground/[0.1] disabled:pointer-events-none"
            >
              <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: inkOf(k) }} />
              <span className="font-semibold text-foreground/90">{s.symbol}</span>
              <span className="font-medium" style={{ color: move >= 0 ? GREEN : RED }}>
                {signed(move)}
              </span>
              {!last && (
                <svg aria-hidden width="8" height="8" viewBox="0 0 8 8" fill="none" className="text-foreground/35">
                  <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              )}
            </motion.button>
          )
        })}
      </div>

      {waiting.length > 0 && (
        <div className="-mx-2 mt-1 flex flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={full ? "Add to the plot, take one off first" : "Add to the plot"}>
          {waiting.map((s) => (
            <button
              key={s.symbol}
              type="button"
              disabled={full}
              aria-label={`Add ${s.symbol}, ${s.label.toLowerCase()}`}
              onClick={() => add(s.symbol)}
              className="flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10.5px] text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-200 hover:bg-foreground/[0.05] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 motion-reduce:active:scale-100"
            >
              <svg aria-hidden width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M4 1v6M1 4h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span className="font-semibold">{s.symbol}</span>
              <span className="text-[10px]">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 block w-full cursor-crosshair touch-none overflow-visible outline-none"
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
        </defs>

        {/* an axis line rides to its new height when the scale changes (a CSS transform, so it
            is placed before any script runs); a new step fades in and an old one out */}
        <AnimatePresence initial={false}>
          {grid.map((v) => (
            <motion.g key={v} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween}>
              <g style={{ transform: `translateY(${y(v).toFixed(1)}px)`, transition: reduced ? "none" : `transform 400ms ${CSS_EASE}` }}>
                <line x1={0} y1={0} x2={PLOT} y2={0} stroke="var(--foreground)" strokeOpacity={v === 100 ? 0.12 : 0.05} strokeWidth={1} strokeDasharray={v === 100 ? undefined : "2 5"} />
                <text x={PLOT + 6} y={3} fontSize={9} fill="var(--foreground)" fillOpacity={0.35}>
                  {v === 100 ? "0%" : `${v > 100 ? "+" : "−"}${Math.abs(v - 100)}%`}
                </text>
              </g>
            </motion.g>
          ))}
        </AnimatePresence>

        {dateTicks.map((k) => (
          <text key={k} x={x(k)} y={H - 5} fontSize={9} fill="var(--foreground)" fillOpacity={0.35} textAnchor={k === 0 ? "start" : k === n - 1 ? "end" : "middle"}>
            {label(k)}
          </text>
        ))}

        <g clipPath={`url(#${uid}-draw)`}>
          <AnimatePresence initial={false}>
            {cut.map((s, k) => {
              const lit = hot === s.symbol
              return (
                /* the group owns the dim and the fade of a series coming or going; the line
                   inside tweens its path */
                <motion.g
                  key={s.symbol}
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
        </g>

        {at !== null && (
          <g pointerEvents="none">
            <line x1={x(i)} y1={PAD.t} x2={x(i)} y2={PAD.t + PLOT_H} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth={1} />
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

      {/* one fill slides between the windows */}
      <div className="relative mx-auto mt-3 flex w-[208px] gap-1" role="group" aria-label="Window">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full bg-foreground/[0.08]"
          style={{
            width: `calc((100% - ${(PERIODS.length - 1) * 4}px) / ${PERIODS.length})`,
            transform: `translateX(calc(${active} * (100% + 4px)))`,
            transition: reduced ? "none" : "transform 250ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={period === p.key}
            onClick={() => {
              setPeriod(p.key)
              setAt(null)
            }}
            className={cn(
              "relative z-[1] h-7 flex-1 rounded-full text-[11.5px] font-medium outline-none transition-[color,transform,translate,scale,rotate] duration-200 active:scale-[0.97] motion-reduce:active:scale-100",
              period === p.key ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90",
            )}
          >
            {p.key}
          </button>
        ))}
      </div>
    </div>
  )
}
