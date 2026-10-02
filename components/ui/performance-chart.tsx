"use client"

import { useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Performance Chart, written new through ssych-component (2026-09-29).
   What it is for: your return against a benchmark over the same window. Both start at
   zero on the first day and share one axis, so every crossing is real.
   Read first: the solid line. It is green where you lead the benchmark and red where
   you trail it; the dotted line is the benchmark.
   The pointer: scrubbing reads your return, the benchmark's and the gap between them on
   that day, and everything to the right of the pointer dims. The pills change the
   benchmark and the window. The arrow keys step a session at a time on the chart.
   Sketch used: src/components/lab/PerformanceChart.tsx. Kept: both series rebased to the
   window's first day, the lead and lag split with its colour changing exactly on the
   crossing, the dim to the right of the pointer, the two invented benchmarks, the average
   daily move.
   Changed: it was 652px in a card; it is 500px on the page. The benchmark line is ink (it
   was yellow), its logo is gone, the floating readout became a line of text in place, and
   the right side is dimmed by drawing it at lower strength, not by laying a veil over it.
   Numbers fixed: the longest window was labelled 5Y over 260 sessions, which is one
   trading year; it is 1Y now. 6M is 126 sessions (it was 130).
   Formulas, over the sessions in the window:
   · return(i)   walk(i) − walk(first day of the window), in percent
   · gap         your return − the benchmark's, in percentage points
   · average     (your last return − your first) ÷ (sessions − 1), a day
   · crossing    where the gap changes sign, placed between the two sessions by
                 a ÷ (a − c) for the gaps a and c on either side (since 2026-10-01 drawn by
                 a clip whose edge is the gap × STEEP, which meets the plot at that point)
   2026-09-30: the benchmark is the second thing on the surface to tell apart, so it takes
   var(--chart-1) (the first telling-apart colour; green and red already mean lead and
   trail here) in its line, its legend dots, its figure and its scrub dot. The lines wipe
   in once from the left on mount (400ms); a new benchmark or window cross-fades them and
   swaps the readout in place; scrubbing and the arrow keys move at once.
   2026-10-01: the visible title is gone (it names the chart for screen readers) and the key
   row under the chart moved into the readout, each mark by its series' name and figure.
   Motion (2026-10-01): the lines sweep in from the left once the chart is a third in view
   (one clip, 900ms); a new benchmark or window tweens both lines, the lead and trail split
   and the zero line to the new state (400ms) where they cross-faded before, and the tick
   figures fade to their new values; reduced motion shows each state at once. */

const EASE = [0.16, 1, 0.3, 1] as const
const TAB_EASE = [0.22, 1, 0.36, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const BENCH = "var(--chart-1)"
const SESSIONS = 260
/** how far the lead and trail clip is pushed per point of gap, in plot units */
const STEEP = 20000

export interface PerformanceWalk {
  seed: number
  /** mean daily move, in percent */
  drift: number
  /** size of the daily noise, in percent */
  vol: number
}

export interface PerformanceBenchmark extends PerformanceWalk {
  key: string
  label: string
}

export interface PerformanceTimeframe {
  key: string
  /** trading sessions in the window */
  days: number
}

export interface PerformanceChartProps {
  /** names the chart for screen readers */
  title?: string
  you?: PerformanceWalk
  /** invented indices: real index names are licensed marks */
  benchmarks?: PerformanceBenchmark[]
  timeframes?: PerformanceTimeframe[]
  defaultBenchmark?: number
  defaultTimeframe?: number
  className?: string
}

const DEFAULT_YOU: PerformanceWalk = { seed: 3, drift: 0.055, vol: 0.9 }

const DEFAULT_BENCHMARKS: PerformanceBenchmark[] = [
  { key: "mrd", label: "Meridian 500", seed: 7, drift: 0.045, vol: 0.75 },
  { key: "vec", label: "Vector 100", seed: 21, drift: 0.06, vol: 1.05 },
]

const DEFAULT_TIMEFRAMES: PerformanceTimeframe[] = [
  { key: "1M", days: 22 },
  { key: "3M", days: 66 },
  { key: "6M", days: 126 },
  { key: "YTD", days: 138 },
  { key: "1Y", days: 260 },
]

/** The same walk on every render. */
function walk({ seed, drift, vol }: PerformanceWalk, n = SESSIONS): number[] {
  let s = seed >>> 0
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32 - 0.5
  }
  const out = [0]
  for (let i = 1; i < n; i++) out.push(out[i - 1] + drift + rnd() * vol + Math.sin(i / 9) * 0.12)
  return out
}

const W = 500
const H = 200
const PAD = { t: 10, r: 38, b: 8, l: 2 }

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`

/** a window's line through every session, always written with `m` vertices (a short window
 *  repeats its sessions), so a new window tweens the path instead of redrawing it */
function trace(vals: number[], m: number, px: (i: number) => number, py: (v: number) => number) {
  const n = vals.length
  let d = ""
  for (let k = 0; k < m; k++) {
    const i = m > 1 && n > 1 ? Math.round((k * (n - 1)) / (m - 1)) : 0
    d += `${k ? " L" : "M"}${px(i).toFixed(1)} ${py(vals[i]).toFixed(1)}`
  }
  return d
}
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

/**
 * Your return as a solid line over a dotted benchmark, both from zero at the start of the
 * window. The line is green while you lead and red while you trail.
 */
export function PerformanceChart({
  title = "Performance",
  you: yours = DEFAULT_YOU,
  benchmarks = DEFAULT_BENCHMARKS,
  timeframes = DEFAULT_TIMEFRAMES,
  defaultBenchmark = 0,
  defaultTimeframe = 2,
  className,
}: PerformanceChartProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const boxRef = useRef<HTMLDivElement>(null)
  /* the sweep waits until the plot is a third in view, then plays once */
  const play = useInView(boxRef, { once: true, amount: 0.3 }) || !!reduced
  const tween = reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }
  const [bench, setBench] = useState(defaultBenchmark)
  const [tf, setTf] = useState(defaultTimeframe)
  const [hi, setHi] = useState<number | null>(null)

  const b = benchmarks[bench] ?? benchmarks[0]
  const frame = timeframes[tf] ?? timeframes[0]
  const days = Math.max(2, Math.min(SESSIONS, frame.days))

  const { series, you } = useMemo(() => {
    const cut = (full: number[]) => {
      const win = full.slice(full.length - days)
      return win.map((v) => v - win[0])
    }
    return { series: cut(walk(b)), you: cut(walk(yours)) }
  }, [b, yours, days])

  const last = days - 1
  const min = Math.min(...series, ...you)
  const max = Math.max(...series, ...you)
  const x = (i: number) => PAD.l + (i / last) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b)
  const benchD = trace(series, SESSIONS, x, y)
  const youD = trace(you, SESSIONS, x, y)
  /* the lead and trail split: your line is drawn twice, green clipped to the days you lead
     and red to the days you trail. Each clip is the gap pushed STEEP units per point off the
     middle of the plot, so its edge crosses the plot within a hair of the crossing and the
     colour turns where the lines meet; written with the same vertices as the lines, it tweens
     with them. */
  const gaps = you.map((v, i) => v - series[i])
  /* day one is always level, so it takes its side from the first day that separates */
  gaps[0] = (gaps.find((g) => g !== 0) ?? 0) >= 0 ? 0.01 : -0.01
  const gy = (g: number) => H / 2 - g * STEEP
  const edge = trace(gaps, SESSIONS, x, gy).slice(1)
  const lim = (H + STEEP * Math.max(...gaps.map(Math.abs)) + 10).toFixed(0)
  const ga = gy(gaps[0]).toFixed(1)
  const gz = gy(gaps[last]).toFixed(1)
  const leadD = `M-10 ${ga} L${edge} L${W + 10} ${gz} L${W + 10} ${lim} L-10 ${lim} Z`
  const trailD = `M-10 ${ga} L${edge} L${W + 10} ${gz} L${W + 10} -${lim} L-10 -${lim} Z`

  const at = hi ?? last
  const gap = you[at] - series[at]
  const tone = gap >= 0 ? GREEN : RED
  const average = (you[last] - you[0]) / last
  const split = hi === null ? W : x(hi)
  const ticks = [0, 0.5, 1].map((f) => min + (max - min) * f)

  const onMove = (e: React.PointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    setHi(Math.max(0, Math.min(last, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * last))))
  }

  const pills = (name: string, labels: string[], value: number, set: (i: number) => void) => (
    <div role="radiogroup" aria-label={name} className="flex items-center">
      {labels.map((label, i) => {
        const on = i === value
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              set(i)
              setHi(null)
            }}
            className={cn(
              "relative h-7 rounded-full px-3 text-[11px] font-medium outline-none transition-[color,scale] duration-200 active:scale-[0.97] motion-reduce:active:scale-100",
              on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90",
            )}
          >
            {on &&
              (reduced ? (
                <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
              ) : (
                <motion.span aria-hidden layoutId={`${uid}-${name}`} className="absolute inset-0 rounded-full bg-foreground/[0.08]" transition={{ duration: 0.25, ease: TAB_EASE }} />
              ))}
            <span className="relative">{label}</span>
          </button>
        )
      })}
    </div>
  )

  const lines = (
    <>
      <motion.path initial={false} animate={{ d: benchD }} transition={tween} stroke={BENCH} strokeOpacity={0.85} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="0.1 5" />
      <g clipPath={`url(#${uid}-lead)`}>
        <motion.path initial={false} animate={{ d: youD }} transition={tween} stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g clipPath={`url(#${uid}-trail)`}>
        <motion.path initial={false} animate={{ d: youD }} transition={tween} stroke={RED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  )

  return (
    <div className={cn("w-[500px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}>
      <div className="flex justify-end">
        {pills(
          "Benchmark",
          benchmarks.map((m) => m.label),
          bench,
          setBench,
        )}
      </div>

      <motion.div
        role="status"
        /* a new benchmark or window swaps the readout in place (4px, 2px blur, 150ms); the scrub moves it at once */
        key={`${b.key}-${frame.key}`}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.15, ease: EASE }}
        className="mt-1.5 flex items-baseline gap-3 text-[11px] text-foreground/45"
      >
        {/* the key lives in the values: each series' mark by its name and figure */}
        <span className="flex items-baseline gap-1.5">
          {/* your line is green while it leads and red while it trails, so its mark carries both */}
          <span aria-hidden className="h-[2px] w-3.5 self-center rounded-full" style={{ background: `linear-gradient(90deg, ${GREEN} 50%, ${RED} 50%)` }} />
          <span>
            You <span className="font-semibold text-foreground/90">{signed(you[at])}%</span>
          </span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span aria-hidden className="flex w-3.5 justify-between self-center">
            <span className="h-[2px] w-[2px] rounded-full" style={{ background: BENCH }} />
            <span className="h-[2px] w-[2px] rounded-full" style={{ background: BENCH }} />
            <span className="h-[2px] w-[2px] rounded-full" style={{ background: BENCH }} />
          </span>
          <span>
            {b.label} <span style={{ color: ink(BENCH) }}>{signed(series[at])}%</span>
          </span>
        </span>
        <span className="font-medium" style={{ color: ink(tone) }}>
          {signed(gap)} pts {gap >= 0 ? "ahead" : "behind"}
        </span>
        <span className="ml-auto text-[10px]">{hi === null ? `Average ${signed(average)}% a day` : last - at === 0 ? "Last session" : last - at === 1 ? "1 session ago" : `${last - at} sessions ago`}</span>
      </motion.div>

      <div
        ref={boxRef}
        className="mt-2 cursor-crosshair touch-none outline-none"
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setHi(null)}
        onBlur={() => setHi(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
          e.preventDefault()
          setHi(Math.max(0, Math.min(last, (hi ?? last) + (e.key === "ArrowLeft" ? -1 : 1))))
        }}
      >
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block max-w-full"
          fill="none"
          role="img"
          aria-label={`${title}: your return ${signed(you[last])}% against ${b.label} ${signed(series[last])}% over ${frame.key}, ${signed(you[last] - series[last])} points ${you[last] - series[last] >= 0 ? "ahead" : "behind"}`}
        >
          <defs>
            {/* the days you lead and the days you trail, tweened with the lines */}
            <clipPath id={`${uid}-lead`}>
              <motion.path initial={false} animate={{ d: leadD }} transition={tween} />
            </clipPath>
            <clipPath id={`${uid}-trail`}>
              <motion.path initial={false} animate={{ d: trailD }} transition={tween} />
            </clipPath>
            {/* the entrance: one clip that opens from the left edge, once */}
            <clipPath id={`${uid}-draw`}>
              <motion.rect
                x={0}
                y={0}
                height={H}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: play ? W : 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
              />
            </clipPath>
            <clipPath id={`${uid}-past`}>
              <rect x={0} y={0} width={split} height={H} />
            </clipPath>
            <clipPath id={`${uid}-ahead`}>
              <rect x={split} y={0} width={Math.max(0, W - split)} height={H} />
            </clipPath>
          </defs>

          {ticks.map((v, i) => {
            const t = `${signed(v).replace(/\.\d+$/, (m) => m.slice(0, 2))}%`
            return (
              <g key={i}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth="1" strokeDasharray="2 4" />
                {/* the ticks hold their places; a new figure fades in over the old one */}
                <AnimatePresence initial={false}>
                  <motion.text
                    key={t}
                    x={W - PAD.r + 6}
                    y={y(v) + 3}
                    fontSize={8.5}
                    fill="var(--foreground)"
                    initial={{ fillOpacity: 0 }}
                    animate={{ fillOpacity: 0.35 }}
                    exit={{ fillOpacity: 0 }}
                    transition={tween}
                  >
                    {t}
                  </motion.text>
                </AnimatePresence>
              </g>
            )
          })}
          {/* level with the start of the window: the only solid gridline; it rides to its new
              height with the lines (a CSS transform, so it is placed before any script runs) */}
          <AnimatePresence initial={false}>
            {min < 0 && max > 0 && (
              <motion.g key="zero" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween}>
                <line
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={0}
                  y2={0}
                  stroke="var(--foreground)"
                  strokeOpacity={0.1}
                  strokeWidth="1"
                  style={{ transform: `translateY(${y(0).toFixed(1)}px)`, transition: reduced ? "none" : "transform 400ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                />
              </motion.g>
            )}
          </AnimatePresence>

          <g clipPath={`url(#${uid}-draw)`}>
            <g clipPath={`url(#${uid}-past)`}>{lines}</g>
            <g clipPath={`url(#${uid}-ahead)`} opacity={0.35}>
              {lines}
            </g>
          </g>

          {hi !== null && (
            <g pointerEvents="none">
              <line x1={x(hi)} y1={PAD.t} x2={x(hi)} y2={H - PAD.b} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth="1" />
              <circle cx={x(hi)} cy={y(series[hi])} r="2.4" fill={BENCH} />
              <circle cx={x(hi)} cy={y(you[hi])} r="2.8" fill={tone} />
            </g>
          )}
        </svg>
      </div>

      <div className="mt-1">
        {pills(
          "Window",
          timeframes.map((t) => t.key),
          tf,
          setTf,
        )}
      </div>
    </div>
  )
}
