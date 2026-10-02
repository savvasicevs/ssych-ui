"use client"

import { useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Total Balance, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: the whole account as one line over a chosen window, with the three
   figures a holder asks of it: how far it fell at worst, how steady it was, what it
   returned.
   Read first: the balance, the one large figure.
   The pointer: scrubbing the chart puts that point's balance and its time where the
   headline is, so nothing floats over the line; the pills slide a fill to the chosen
   window and the line tweens to it.
   Sketch used: src/components/lab/TotalBalanceCard.tsx. Kept: the seeded multiplicative
   walk per window, the readout as plain text that never covers the plot, the right-edge
   price ticks, the three figures worked from the series. Changed: no card, no hatched
   ground and no amber wash, a fall is red (it was amber), the readout takes the headline's
   place (it was a chip riding a band above the plot), the window switcher is a row of
   pills, the two icon buttons that did nothing are gone, the formulas moved from under
   each figure to this comment, and it is 480 wide where the sketch was 820.
   Sample data fixed: the sketch read every window with a 24-hour clock, so a point a week
   back showed a time of day; each window now reads in its own unit.
   Formulas:
   · change         last − first of the window
   · total return   (last − first) ÷ first × 100
   · max drawdown   the lowest of (value − highest value so far) ÷ highest value so far × 100
   · steadiness     50 + mean step ÷ deviation of the steps × 40, held between 0 and 100
   Motion (2026-10-01): the line and its area sweep in from the left once the chart is a third
   in view (one clip, 900ms); a new window tweens the line and the area to the new walk
   (400ms) where they drew again, and the price ticks fade to their new figures; reduced
   motion shows each state at once. */

const EASE = [0.16, 1, 0.3, 1] as const
const TAB_EASE = [0.22, 1, 0.36, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

export type BalanceRange = "24h" | "1w" | "1m" | "all"

export interface BalanceWindow {
  key: BalanceRange
  label: string
  /** oldest to newest */
  series: number[]
  /** how long the window is, in the unit below */
  length: number
  unit: "clock" | "d" | "w"
}

export interface TotalBalanceProps {
  title?: string
  windows?: BalanceWindow[]
  defaultRange?: BalanceRange
  className?: string
}

const N = 150
/** every sample window opens on this one number */
const OPEN = 12_480

/** a seeded walk whose steps are a share of the balance, so a window moves a few percent */
function walk(seed: number, drift: number) {
  let s = seed
  let v = OPEN
  const out: number[] = []
  for (let i = 0; i < N; i++) {
    s = (s * 48271) % 2147483647
    v *= 1 + (s / 2147483647 - 0.5) * 0.0065 + drift
    out.push(v)
  }
  return out
}

const DEFAULT_WINDOWS: BalanceWindow[] = [
  { key: "24h", label: "24h", series: walk(9, -0.00012), length: 24, unit: "clock" },
  { key: "1w", label: "1w", series: walk(37, -0.00028), length: 7, unit: "d" },
  { key: "1m", label: "1m", series: walk(71, 0.00019), length: 30, unit: "d" },
  { key: "all", label: "All", series: walk(113, 0.00042), length: 52, unit: "w" },
]

const W = 480
const H = 150
/** r is the gutter the price ticks live in; l keeps the first round cap inside the box */
const PAD = { t: 10, b: 10, l: 4, r: 52 }
const PLOT = W - PAD.l - PAD.r

const usd = (v: number, dp = 2) => `$${v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
const signedPct = (v: number) => `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(2)}%`

/** the walk through every point, always written with `m` vertices (a shorter window repeats
 *  its points), so a new window tweens the path instead of redrawing it */
function linePath(vals: number[], m: number, px: (i: number) => number, py: (v: number) => number) {
  const n = vals.length
  let d = ""
  for (let k = 0; k < m; k++) {
    const i = m > 1 && n > 1 ? Math.round((k * (n - 1)) / (m - 1)) : 0
    d += `${k ? " L" : "M"}${px(i).toFixed(1)},${py(vals[i]).toFixed(1)}`
  }
  return d
}

/** where a point sits in time, in the window's own unit */
function when(w: BalanceWindow, i: number) {
  const t = w.series.length > 1 ? i / (w.series.length - 1) : 1
  if (w.unit === "clock") {
    const m = Math.round(t * (w.length * 60 - 1))
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
  }
  const ago = Math.round((1 - t) * w.length)
  return ago === 0 ? "now" : `${ago}${w.unit} ago`
}

/**
 * The account as one scrubbable line: balance, change and return on top, the window
 * pills under the plot, and drawdown, steadiness and return worked from the same series.
 */
export function TotalBalance({ title = "Total balance", windows = DEFAULT_WINDOWS, defaultRange = "24h", className }: TotalBalanceProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const boxRef = useRef<HTMLDivElement>(null)
  /* the sweep waits until the chart is a third in view, then plays once */
  const play = useInView(boxRef, { once: true, amount: 0.3 }) || !!reduced
  const tween = reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }
  const [range, setRange] = useState<BalanceRange>(defaultRange)
  const [hi, setHi] = useState<number | null>(null)

  const win = windows.find((w) => w.key === range) ?? windows[0] ?? DEFAULT_WINDOWS[0]
  const data = win.series.length ? win.series : [0]
  const n = data.length
  /** one vertex count for every window */
  const m = Math.max(1, ...windows.map((w) => w.series.length))

  const geo = useMemo(() => {
    const lo = Math.min(...data)
    const top = Math.max(...data)
    const span = top - lo || 1
    const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * PLOT
    const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b)
    const d = linePath(data, m, x, y)
    return { x, y, lo, top, span, d, area: `${d} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z` }
  }, [data, n, m])

  const stats = useMemo(() => {
    const first = data[0]
    const last = data[n - 1]
    let peak = first
    let drawdown = 0
    for (const v of data) {
      if (v > peak) peak = v
      drawdown = Math.min(drawdown, peak ? ((v - peak) / peak) * 100 : 0)
    }
    const steps = data.slice(1).map((v, i) => v - data[i])
    const mean = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0
    const sd = Math.sqrt(steps.length ? steps.reduce((a, b) => a + (b - mean) ** 2, 0) / steps.length : 0) || 1e-9
    return {
      last,
      change: last - first,
      totalReturn: first ? ((last - first) / first) * 100 : 0,
      drawdown,
      steadiness: Math.max(0, Math.min(100, 50 + (mean / sd) * 40)),
    }
  }, [data, n])

  const onMove = (e: React.PointerEvent) => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    setHi(Math.max(0, Math.min(n - 1, Math.round(((x - PAD.l) / PLOT) * (n - 1)))))
  }

  const at = hi ?? n - 1
  const hueOf = (v: number) => ink(v >= 0 ? GREEN : RED)
  const figures: { label: string; value: string; hue?: string }[] = [
    { label: "Max drawdown", value: `${stats.drawdown < 0 ? "−" : ""}${Math.abs(stats.drawdown).toFixed(2)}%`, hue: stats.drawdown < 0 ? ink(RED) : undefined },
    { label: "Steadiness", value: stats.steadiness.toFixed(1) },
    { label: "Total return", value: signedPct(stats.totalReturn), hue: hueOf(stats.totalReturn) },
  ]

  return (
    <div className={cn("w-[480px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}>
      <div className="text-[11.5px] font-medium text-foreground/45">{title}</div>
      <motion.div
        role="status"
        /* a new window, or starting and ending a scrub, swaps the headline in place (4px, 2px
           blur, 150ms); the scrub itself moves the figure at once */
        key={`${range}-${hi === null ? "rest" : "scrub"}`}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.15, ease: EASE }}
        className="mt-1.5 flex items-baseline gap-2.5"
      >
        <span className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">{usd(data[at])}</span>
        {hi === null ? (
          <>
            <span className="text-[11.5px] font-medium" style={{ color: hueOf(stats.change) }}>
              {stats.change < 0 ? "−" : "+"}
              {usd(Math.abs(stats.change))}
            </span>
            <span className="text-[11.5px] font-medium" style={{ color: hueOf(stats.totalReturn) }}>
              {signedPct(stats.totalReturn)}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-foreground/45">{when(win, at)}</span>
        )}
      </motion.div>

      <div ref={boxRef} className="relative mt-4 cursor-crosshair touch-none" onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full overflow-visible"
          fill="none"
          role="img"
          aria-label={`${title} over ${win.label}, now ${usd(stats.last)}, ${signedPct(stats.totalReturn)}, between ${usd(geo.lo)} and ${usd(geo.top)}`}
        >
          <defs>
            <linearGradient id={`tb-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
            </linearGradient>
            {/* the entrance: one clip that opens from the left edge, once */}
            <clipPath id={`tbc-${uid}`}>
              <motion.rect
                x={-4}
                y={-4}
                height={H + 8}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: play ? PAD.l + PLOT + 4 : 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
              />
            </clipPath>
          </defs>
          {[0, 0.5, 1].map((f) => {
            const gy = PAD.t + f * (H - PAD.t - PAD.b)
            return (
              <g key={f}>
                <line x1={PAD.l} x2={PAD.l + PLOT} y1={gy} y2={gy} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} />
                {/* the ticks hold their places; a new figure fades in over the old one */}
                <AnimatePresence initial={false}>
                  <motion.text
                    key={Math.round(geo.top - f * geo.span)}
                    x={PAD.l + PLOT + 8}
                    y={gy + 3}
                    fontSize={9}
                    fill="var(--foreground)"
                    initial={{ fillOpacity: 0 }}
                    animate={{ fillOpacity: 0.35 }}
                    exit={{ fillOpacity: 0 }}
                    transition={tween}
                  >
                    ${Math.round(geo.top - f * geo.span).toLocaleString("en-US")}
                  </motion.text>
                </AnimatePresence>
              </g>
            )
          })}
          <g clipPath={`url(#tbc-${uid})`}>
            <motion.path initial={false} animate={{ d: geo.area }} transition={tween} fill={`url(#tb-${uid})`} />
            <motion.path
              initial={false}
              animate={{ d: geo.d }}
              transition={tween}
              stroke="var(--foreground)"
              strokeOpacity={0.9}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
          {hi !== null && (
            <g pointerEvents="none">
              <line x1={geo.x(at)} x2={geo.x(at)} y1={0} y2={H} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth={1} />
              <circle cx={geo.x(at)} cy={geo.y(data[at])} r={2.5} fill="var(--foreground)" />
            </g>
          )}
        </svg>
      </div>

      <div role="radiogroup" aria-label="Window" className="-ml-2.5 mt-3 flex">
        {windows.map((w) => {
          const on = w.key === win.key
          return (
            <button
              key={w.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setRange(w.key)
                setHi(null)
              }}
              className={cn(
                "relative h-7 rounded-full px-3 text-[11.5px] font-medium outline-none transition-[color,scale] duration-200 active:scale-[0.97] motion-reduce:active:scale-100",
                on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90",
              )}
            >
              {on &&
                (reduced ? (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
                ) : (
                  <motion.span aria-hidden layoutId={`${uid}-range`} className="absolute inset-0 rounded-full bg-foreground/[0.08]" transition={{ duration: 0.25, ease: TAB_EASE }} />
                ))}
              <span className="relative">{w.label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 border-t border-foreground/[0.05] pt-3">
        {figures.map((f, i) => (
          <div key={f.label} className="flex flex-col gap-1">
            <span className="text-[10.5px] text-foreground/45">{f.label}</span>
            {/* a new window pops each figure in, 35ms apart */}
            <motion.span
              key={range}
              className="text-[13px] font-semibold text-foreground/90"
              style={f.hue ? { color: f.hue } : undefined}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.15, ease: EASE, delay: reduced ? 0 : i * 0.035 }}
            >
              {f.value}
            </motion.span>
          </div>
        ))}
      </div>
    </div>
  )
}
