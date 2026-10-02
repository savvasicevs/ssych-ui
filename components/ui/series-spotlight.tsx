"use client"

import { useEffect, useId, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent } from "react"
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Series Spotlight, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: a dozen series on one plot with one of them lit, so a single thread
   can be followed while the others stay as context.
   Read first: the return of the lit series, the one large figure.
   The pointer: the rail under the plot is twelve buttons. Pointing at one, or tabbing to
   it, previews its line in the accent; pressing it makes it the lit one. Scrubbing the
   plot reads the lit series only, with the date and the close. Left and right arrows
   walk the days, Home and End jump to the ends, Escape lets go.
   Sketch: lab/SeriesSpotlight. Kept: twelve tokens carried by one shared market path,
   the wash of unlit lines, preview on hover and commit on press, a scrub that answers
   for one series, the window pills, returns rebased to the first close of the window.
   Changed: the card, its outlines and the floating readout are gone, the reading is in
   the header; every line is ink, the wash at 14% and the lit one at 90%, and a preview
   takes the accent (the sketch gave each token its own hue); brand marks are gone;
   480 wide, not 900, so the plot is drawn at a fixed size and no longer measured.
   Fixed: the longest window was called 1Y over 180 days of data; it is 6M. One token of
   the twelve was swapped for NEAR. Dates are counted from a fixed day with no clock.
   Against fresh/CompareLines: that reads two to four series side by side; this is for
   many, and reads one.
   Formulas:
   · return at day i = (close at i − close at the window's first day) ÷ that first close
   · the figure = the return at the last day of the window, or at the day scrubbed
   · axis lines = the smallest step of 1, 2, 5, 10, 25, 50 or 100 points that gives five
     lines or fewer; 0% is the only solid one
   · the rail's figure = each token's return at the same day
   Motion (2026-10-01): the lines sweep in from the left once the plot is a third in view (one
   clip, 900ms); a new window tweens all twelve lines and the axis lines to the new scale
   (400ms) where the lit line used to draw again; a pick still draws the lit line on (400ms)
   and a preview is there at once; reduced motion shows each state at once. */

const EASE = [0.16, 1, 0.3, 1] as const
const CSS_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const ACCENT = "var(--chart-1)"

export interface SpotlightSeries {
  sym: string
  name: string
  /** daily closes, oldest first */
  closes: number[]
}

export interface SeriesSpotlightProps {
  series?: SpotlightSeries[]
  /** one label for each close */
  labels?: string[]
  /** the series lit on arrival */
  lit?: string
  title?: string
  className?: string
}

const N = 180

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
/* 180 days ending Aug 11 2026: day 43 of the year (Feb 13) to day 222 */
const DEFAULT_LABELS = Array.from({ length: N }, (_, i) => dayLabel(43 + i))

/** `base` is the first close, `beta` how hard the token takes the shared market move,
 *  `vol` its own noise, `drift` its trend across the 180 days */
const TOKENS = [
  { sym: "BTC", name: "Bitcoin", base: 68420, beta: 1, vol: 0.55, drift: 0.22 },
  { sym: "ETH", name: "Ethereum", base: 3248, beta: 1.15, vol: 0.7, drift: 0.14 },
  { sym: "SOL", name: "Solana", base: 172.4, beta: 1.45, vol: 1, drift: 0.34 },
  { sym: "BNB", name: "BNB", base: 604.2, beta: 0.85, vol: 0.5, drift: 0.09 },
  { sym: "XRP", name: "XRP", base: 2.14, beta: 1.05, vol: 0.9, drift: -0.06 },
  { sym: "DOGE", name: "Dogecoin", base: 0.1842, beta: 1.6, vol: 1.3, drift: -0.18 },
  { sym: "ADA", name: "Cardano", base: 0.7215, beta: 1.2, vol: 0.85, drift: -0.11 },
  { sym: "AVAX", name: "Avalanche", base: 31.62, beta: 1.3, vol: 0.95, drift: 0.05 },
  { sym: "LINK", name: "Chainlink", base: 17.44, beta: 1.1, vol: 0.75, drift: 0.17 },
  { sym: "NEAR", name: "NEAR Protocol", base: 5.42, beta: 1.5, vol: 1.15, drift: 0.41 },
  { sym: "SUI", name: "Sui", base: 3.284, beta: 1.4, vol: 1.05, drift: 0.28 },
  { sym: "ARB", name: "Arbitrum", base: 0.9124, beta: 1.25, vol: 0.9, drift: -0.14 },
]

/** Lehmer walk. One shared market path carries every token, so the plot reads as one
 *  market; beta scales how much of it each takes, vol is its own noise. */
const DEFAULT_SERIES: SpotlightSeries[] = (() => {
  let m = 20260811
  let mv = 0
  const market: number[] = []
  for (let i = 0; i < N; i++) {
    m = (m * 48271) % 2147483647
    mv += (m / 2147483647 - 0.487) * 0.018
    market.push(mv)
  }
  return TOKENS.map((t, k) => {
    let s = 1000 + k * 7919
    let v = 0
    const closes: number[] = []
    for (let i = 0; i < N; i++) {
      s = (s * 48271) % 2147483647
      v += (s / 2147483647 - 0.5) * t.vol * 0.021
      closes.push(t.base * Math.exp(market[i] * t.beta + v + (t.drift * i) / N))
    }
    return { sym: t.sym, name: t.name, closes }
  })
})()

const RANGES = [
  { key: "1W", days: 7 },
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "6M", days: 180 },
] as const
type RangeKey = (typeof RANGES)[number]["key"]

const W = 480
const H = 190
const PAD = { l: 0, r: 44, t: 10, b: 20 }
const PLOT_W = W - PAD.l - PAD.r
const PLOT_H = H - PAD.t - PAD.b

const usd = (v: number) => (v >= 1 ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${v.toFixed(4)}`)
const signed = (v: number, dp = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`

/** a window's line through every close, always written with `m` vertices (a short window
 *  repeats its closes), so a new window tweens the path instead of redrawing it */
function linePath(vals: number[], m: number, px: (j: number) => number, py: (v: number) => number) {
  const n = vals.length
  let d = ""
  for (let k = 0; k < m; k++) {
    const j = m > 1 && n > 1 ? Math.round((k * (n - 1)) / (m - 1)) : 0
    d += `${k ? " L" : "M"}${px(j).toFixed(1)} ${py(vals[j]).toFixed(1)}`
  }
  return d
}

/**
 * Many lines, one lit. The rail picks which; hovering it previews a line in the accent
 * without committing. The scrub and the figure answer for the lit series alone.
 */
export function SeriesSpotlight({
  series = DEFAULT_SERIES,
  labels = DEFAULT_LABELS,
  lit = "NEAR",
  title = "Relative performance",
  className,
}: SeriesSpotlightProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const svgRef = useRef<SVGSVGElement>(null)
  /* the sweep waits until the plot is a third in view, then plays once */
  const play = useInView(svgRef, { once: true, amount: 0.3 }) || !!reduced
  const tween = reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }
  const [picked, setPicked] = useState(lit)
  /** one more for every pick; the lit line draws on only on the render right after one */
  const [picks, setPicks] = useState(0)
  const seenPicks = useRef(0)
  useEffect(() => {
    seenPicks.current = picks
  }, [picks])
  const freshPick = picks !== seenPicks.current
  const [preview, setPreview] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>("3M")
  const [cursor, setCursor] = useState<number | null>(null)

  const used = series.filter((s) => s.closes.length > 1)
  const len = used.length ? Math.min(...used.map((s) => s.closes.length)) : 2
  const days = Math.max(2, Math.min(len, RANGES.find((r) => r.key === range)?.days ?? len))
  const start = len - days

  /* rebased to the window's first close, so 0% is where the window begins */
  const rets = used.map((s) => {
    const b = s.closes[start] || 1
    return s.closes.slice(start, start + days).map((v) => ((v - b) / b) * 100)
  })
  const all = rets.flat()
  const lo = all.length ? Math.min(...all, 0) : -1
  const hi = all.length ? Math.max(...all, 0) : 1
  const room = (hi - lo || 1) * 0.06
  const geo = { rets, min: lo - room, max: hi + room }

  const x = (i: number) => PAD.l + (i / (days - 1)) * PLOT_W
  const y = (v: number) => PAD.t + (1 - (v - geo.min) / (geo.max - geo.min || 1)) * PLOT_H
  const step = [1, 2, 5, 10, 25, 50, 100, 250].find((st) => (geo.max - geo.min) / st <= 5) ?? 500
  const grid: number[] = []
  for (let v = Math.ceil(geo.min / step) * step; v <= geo.max; v += step) grid.push(v)

  const shownSym = preview ?? picked
  const k = Math.max(0, used.findIndex((s) => s.sym === shownSym))
  const token = used[k]
  const at = Math.min(cursor ?? days - 1, days - 1)
  const ret = geo.rets[k]?.[at] ?? 0
  const close = token?.closes[start + at] ?? 0
  const label = (i: number) => labels[start + i] ?? `day ${start + i + 1}`
  const previewing = preview !== null && preview !== picked

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    setCursor(Math.max(0, Math.min(days - 1, Math.round(((px - PAD.l) / PLOT_W) * (days - 1)))))
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0
    if (d) {
      e.preventDefault()
      setCursor((c) => Math.max(0, Math.min(days - 1, (c ?? days - 1) + d)))
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault()
      setCursor(e.key === "Home" ? 0 : days - 1)
    } else if (e.key === "Escape") setCursor(null)
  }
  const active = RANGES.findIndex((r) => r.key === range)
  const dateTicks = [...new Set([0, Math.round((days - 1) / 2), days - 1])]

  return (
    <div className={cn("w-[480px] max-w-full tabular-nums", className)}>
      <div className="flex items-start justify-between gap-4">
        <div role="status" className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-medium text-foreground/90">{token?.name ?? title}</span>
            <span className="text-[11px] text-foreground/45">{token?.sym}</span>
          </div>
          {/* a new series or window pops the figure in (4px, 2px blur, 150ms); the scrub moves it at once */}
          <motion.div
            key={`${shownSym}-${range}-${cursor === null ? "rest" : "scrub"}`}
            className="mt-1.5 flex items-baseline gap-2"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            <span className="text-[22px] font-semibold leading-none tracking-[-0.02em]" style={{ color: ret >= 0 ? GREEN : RED }}>
              {signed(ret)}
            </span>
            <span className="text-[10.5px] text-foreground/45">
              {cursor === null ? `over ${range} · ${usd(close)}` : `${label(at)} · ${usd(close)}`}
            </span>
          </motion.div>
        </div>

        {/* one fill slides between the windows */}
        <div className="relative flex w-[176px] shrink-0 gap-1" role="group" aria-label="Window">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full bg-foreground/[0.08]"
            style={{
              width: `calc((100% - ${(RANGES.length - 1) * 4}px) / ${RANGES.length})`,
              transform: `translateX(calc(${active} * (100% + 4px)))`,
              transition: reduced ? "none" : "transform 250ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => {
                setRange(r.key)
                setCursor(null)
              }}
              className={cn(
                "relative z-[1] h-7 flex-1 rounded-full text-[11.5px] font-medium outline-none transition-[color,transform,translate,scale,rotate] duration-200 active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:bg-foreground/[0.06]",
                range === r.key ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90",
              )}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block w-full cursor-crosshair touch-none overflow-visible outline-none"
        role="img"
        tabIndex={0}
        aria-label={`${title}: ${token?.name ?? ""} ${signed(geo.rets[k]?.[days - 1] ?? 0)} over ${range}, against ${Math.max(0, used.length - 1)} other series`}
        onPointerMove={onMove}
        onPointerLeave={() => setCursor(null)}
        onBlur={() => setCursor(null)}
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
                <line
                  x1={PAD.l}
                  y1={0}
                  x2={PAD.l + PLOT_W}
                  y2={0}
                  stroke="var(--foreground)"
                  strokeOpacity={v === 0 ? 0.14 : 0.05}
                  strokeWidth={1}
                  strokeDasharray={v === 0 ? undefined : "2 4"}
                />
                <text x={W - PAD.r + 6} y={3} fontSize={9} fill="var(--foreground)" fillOpacity={0.35}>
                  {v === 0 ? "0%" : `${v > 0 ? "+" : "−"}${Math.abs(v)}%`}
                </text>
              </g>
            </motion.g>
          ))}
        </AnimatePresence>

        {dateTicks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 5}
            fontSize={9}
            fill="var(--foreground)"
            fillOpacity={0.35}
            textAnchor={i === 0 ? "start" : i === days - 1 ? "end" : "middle"}
          >
            {label(i)}
          </text>
        ))}

        <g clipPath={`url(#${uid}-draw)`}>
          {/* the wash: every series but the one shown; a new window tweens each path */}
          {geo.rets.map((r, i) =>
            i === k ? null : (
              <motion.path
                key={used[i].sym}
                initial={false}
                animate={{ d: linePath(r, len, x, y) }}
                transition={tween}
                fill="none"
                stroke="var(--foreground)"
                strokeOpacity={used[i].sym === picked ? 0.4 : 0.14}
                strokeWidth={1}
                strokeLinejoin="round"
              />
            ),
          )}

          {/* the one shown, drawn last. It draws on after a pick; a preview is there at once,
              and a new window tweens it with the wash */}
          {geo.rets[k] && (
            <motion.path
              key={`${shownSym}-${picks}`}
              fill="none"
              stroke={previewing ? ACCENT : "var(--foreground)"}
              strokeOpacity={previewing ? 1 : 0.9}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={freshPick && !reduced ? { pathLength: 0, d: linePath(geo.rets[k], len, x, y) } : false}
              animate={{ pathLength: 1, d: linePath(geo.rets[k], len, x, y) }}
              transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }}
            />
          )}
        </g>

        {cursor !== null && (
          <g pointerEvents="none">
            <line x1={x(at)} y1={PAD.t} x2={x(at)} y2={PAD.t + PLOT_H} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth={1} />
            <circle cx={x(at)} cy={y(ret)} r={3} fill={previewing ? ACCENT : "var(--foreground)"} stroke="var(--background)" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      <div className="-mx-1 mt-2 flex flex-wrap gap-x-0.5 gap-y-1" role="group" aria-label="Series" onPointerLeave={() => setPreview(null)}>
        {used.map((s, i) => {
          const on = shownSym === s.sym
          const held = picked === s.sym
          const move = geo.rets[i]?.[at] ?? 0
          return (
            <button
              key={s.sym}
              type="button"
              aria-pressed={held}
              aria-label={`${s.name}, ${signed(move)} at ${label(at)}${held ? ", lit" : ""}`}
              onClick={() => {
                if (s.sym === picked) return
                setPicked(s.sym)
                setPicks((p) => p + 1)
              }}
              onPointerEnter={() => setPreview(s.sym)}
              onFocus={() => setPreview(s.sym)}
              onBlur={() => setPreview(null)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full px-2 text-[10.5px] outline-none transition-[opacity,background-color,transform,translate,scale,rotate] duration-200 active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:bg-foreground/[0.08]",
                held ? "bg-foreground/[0.08]" : "hover:bg-foreground/[0.04]",
              )}
              style={{ opacity: on || held ? 1 : 0.5 }}
            >
              <span
                aria-hidden
                className="h-[2px] w-2 rounded-full"
                style={{
                  background: on && !held ? ACCENT : `color-mix(in srgb, var(--foreground) ${held ? 90 : 30}%, transparent)`,
                  transition: reduced ? "none" : "background-color 160ms",
                }}
              />
              <span className="font-semibold text-foreground/90">{s.sym}</span>
              <span className="font-medium" style={{ color: move >= 0 ? GREEN : RED }}>
                {signed(move, 1)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
