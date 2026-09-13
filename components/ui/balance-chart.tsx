"use client"

import { useId, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

const usd = (n: number, dp = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`

const TIMEFRAMES = ["1H", "24H", "1W", "1M", "1Y", "All"] as const
export type BalanceTimeframe = (typeof TIMEFRAMES)[number]

const X_LABELS: Record<BalanceTimeframe, string[]> = {
  "1H": ["60m", "45m", "30m", "15m", "now"],
  "24H": ["24h", "18h", "12h", "6h", "now"],
  "1W": ["7d", "5d", "3d", "1d", "now"],
  "1M": ["30d", "20d", "10d", "now"],
  "1Y": ["12mo", "9mo", "6mo", "3mo", "now"],
  All: ["4y", "3y", "2y", "1y", "now"],
}

/** how far back a scrub point sits, in the timeframe's own unit */
const AGO: Record<BalanceTimeframe, [number, string]> = {
  "1H": [60, "m"],
  "24H": [24, "h"],
  "1W": [7, "d"],
  "1M": [30, "d"],
  "1Y": [12, "mo"],
  All: [4, "y"],
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const W = 640
const H = 240
const N = 90

/**
 * The wallet-value area chart. Trend picks the line colour, the fill fades to
 * nothing, and the high and low float at their true points instead of a y axis.
 * Hovering drops a plain rule and a value card beside the marker (when, the
 * balance, and the move from then to now under a hairline), and greys
 * everything ahead of the cursor, so the part of the window you have not
 * scrubbed to reads as not yet answered. The timeframe pills reseed the walk;
 * the last point is always the base.
 */
export function BalanceChart({
  base = 48213,
  height = H,
  className,
}: {
  /** the current balance; every walk ends exactly here */
  base?: number
  /** rendered plot height in px; the walk stretches, the stroke keeps its weight */
  height?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const svgRef = useRef<SVGSVGElement>(null)
  const [tf, setTf] = useState<BalanceTimeframe>("24H")
  const [hover, setHover] = useState<number | null>(null)

  const { pts, path, area, min, max, iMin, iMax, up } = useMemo(() => {
    const rand = mulberry32(11 + TIMEFRAMES.indexOf(tf) * 97)
    const drift = tf === "1W" ? -0.12 : 0.35
    const vals: number[] = []
    let v = base * 0.94
    for (let i = 0; i < N; i++) {
      v += (rand() - 0.42) * base * 0.006 + drift * base * 0.0008
      vals.push(v)
    }
    /* pinned: the last point is the base, so the headline and the plot agree */
    const k = vals[N - 1] ? base / vals[N - 1] : 1
    for (let i = 0; i < N; i++) vals[i] *= k
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const nx = (i: number) => (i / (N - 1)) * W
    const ny = (val: number) => H - 14 - ((val - lo) / (hi - lo || 1)) * (H - 44)
    const d = vals.map((p, i) => `${i === 0 ? "M" : "L"}${nx(i).toFixed(1)},${ny(p).toFixed(1)}`).join(" ")
    return {
      pts: vals.map((val, i) => ({ x: nx(i), y: ny(val), val })),
      path: d,
      area: `${d} L${W},${H} L0,${H} Z`,
      min: lo,
      max: hi,
      iMin: vals.indexOf(lo),
      iMax: vals.indexOf(hi),
      up: vals[N - 1] >= vals[0],
    }
  }, [base, tf])

  const hue = up ? GREEN : RED
  const hovered = hover != null ? pts[hover] : null
  const [unit, suffix] = AGO[tf]
  const ago = hover != null ? `${((1 - hover / (N - 1)) * unit).toFixed(unit >= 24 ? 0 : 1)}${suffix} ago` : ""
  /* the card sits on whichever side of the rule keeps it in view */
  const cardRight = hovered ? hovered.x / W < 0.5 : false
  /* vs now: (balance now − balance then) ÷ balance then */
  const vsNow = hovered ? ((base - hovered.val) / hovered.val) * 100 : 0
  const edge = (x: number) => ((x / W) * 100 <= 12 ? { left: 0 } : (x / W) * 100 >= 88 ? { right: 0 } : { left: `${(x / W) * 100}%`, transform: "translateX(-50%)" })

  return (
    <div className={cn("w-full max-w-[640px]", className)}>
      {/* pb-4 on the outside: the floating low label gets its own gutter instead of
          landing on the first axis label, while the label percentages still measure the plot */}
      <div className="pb-4">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ height }}
          className="w-full cursor-crosshair touch-none"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Balance over ${tf}, ${usd(base, 0)} now`}
          onPointerMove={(e) => {
            const el = svgRef.current
            if (!el) return
            const r = el.getBoundingClientRect()
            setHover(Math.max(0, Math.min(N - 1, Math.round(((e.clientX - r.left) / r.width) * (N - 1)))))
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hue} stopOpacity="0.16" />
              <stop offset="100%" stopColor={hue} stopOpacity="0" />
            </linearGradient>
            {/* everything right of the cursor is clipped out of the coloured series */}
            <clipPath id={`${uid}-past`}>
              <rect x={0} y={0} width={hovered ? hovered.x : W} height={H} />
            </clipPath>
          </defs>
          {/* the greyed whole, under the coloured part you have scrubbed past */}
          <path d={area} fill="var(--foreground)" fillOpacity={hovered ? 0.04 : 0} />
          <path d={path} fill="none" stroke="var(--foreground)" strokeOpacity={hovered ? 0.3 : 0} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <g clipPath={`url(#${uid}-past)`}>
            <motion.path key={`a-${tf}`} d={area} fill={`url(#${uid}-fill)`} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: 0.3 }} />
            <motion.path key={`l-${tf}`} d={path} fill="none" stroke={hue} strokeWidth={2} initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }} />
          </g>
          {hovered && (
            <g pointerEvents="none">
              <line x1={hovered.x} y1={0} x2={hovered.x} y2={H} stroke="var(--foreground)" strokeOpacity={0.16} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <circle cx={hovered.x} cy={hovered.y} r={3.5} fill={hue} stroke="var(--card)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </g>
          )}
        </svg>

        {/* floating extremes: the y axis this chart does not draw */}
        <span className="pointer-events-none absolute text-[11px] font-medium tabular-nums text-foreground/45" style={{ ...edge(pts[iMax].x), top: `${(pts[iMax].y / H) * 100}%`, marginTop: -18 }}>
          {usd(max, 0)}
        </span>
        <span className="pointer-events-none absolute text-[11px] font-medium tabular-nums text-foreground/45" style={{ ...edge(pts[iMin].x), top: `${(pts[iMin].y / H) * 100}%`, marginTop: 8 }}>
          {usd(min, 0)}
        </span>

        {/* the value card: when, the balance, and the move to now under a hairline */}
        {hovered && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 w-[132px] rounded-lg border border-foreground/[0.05] px-2.5 py-2 text-[10px] tabular-nums"
            style={{
              left: `${(hovered.x / W) * 100}%`,
              top: `clamp(2px, calc(${(hovered.y / H) * 100}% - 18px), calc(100% - 78px))`,
              transform: cardRight ? "translateX(14px)" : "translateX(calc(-100% - 14px))",
              background: "var(--card)",
              boxShadow: "0 8px 24px var(--card-shadow, rgba(0,0,0,0.35))",
              transition: reduced ? undefined : "top 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div className="text-[9px] text-foreground/45">{ago}</div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-foreground/55">Balance</span>
              <span className="font-semibold text-foreground/85">{usd(hovered.val, 0)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-foreground/[0.04] pt-1.5">
              <span className="text-foreground/55">vs now</span>
              <span className="font-semibold" style={{ color: vsNow >= 0 ? GREEN : RED }}>
                {vsNow >= 0 ? "+" : "−"}
                {Math.abs(vsNow).toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* labels only, no ticks, no axis line */}
      <div className="mt-1 flex justify-between px-1 text-[10px] tabular-nums text-foreground/35">
        {X_LABELS[tf].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>

      <div className="mt-3 flex justify-center gap-1">
        {TIMEFRAMES.map((t) => {
          const on = tf === t
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => setTf(t)}
              className={cn(
                "h-8 rounded-full px-3.5 text-[12px] font-semibold tabular-nums transition-colors duration-150",
                on ? "bg-foreground/[0.08] text-foreground/90" : "text-foreground/45 hover:text-foreground/70",
              )}
            >
              {t}
            </button>
          )
        })}
      </div>
    </div>
  )
}
