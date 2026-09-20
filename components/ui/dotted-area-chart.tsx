"use client"

import { useId, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const ACCENT: [number, number, number] = [72, 159, 250]
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const SURFACE = "var(--card)"
const SANS = "inherit"
const accentRgba = (a: number, c: [number, number, number] = ACCENT) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

const W = 460
const H = 200
const PAD = { r: 44, t: 10, b: 12 }
/** pitch of the dot field under the line */
const DOT = 8

/** deterministic default series — a drifting session close */
const DEFAULT_PRICES: number[] = (() => {
  let s = 29
  let v = 168
  const out: number[] = []
  for (let i = 0; i < 96; i++) {
    s = (s * 16807) % 2147483647
    v = Math.max(120, v + (s / 2147483647 - 0.45) * 5.6)
    out.push(v)
  }
  return out
})()

export interface DottedAreaChartProps {
  /** pair shown top-left */
  symbol?: string
  /** series, oldest → latest; the headline and the change both derive from it */
  prices?: number[]
  className?: string
}

/**
 * A price line standing on a field of dots: the area under it is filled with a
 * dot pattern that fades toward the floor, so the fill reads as texture instead
 * of a slab. Scrubbing splits the chart at the cursor, the stretch already
 * passed stays lit while the rest falls back, and the read-out carries the price
 * at that bar with its move from the open.
 */
export function DottedAreaChart({ symbol = "BTC / USD", prices = DEFAULT_PRICES, className }: DottedAreaChartProps) {
  const reduced = useReducedMotion()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const uid = useId().replace(/:/g, "")

  const { n, min, max, x, y, line, area } = useMemo(() => {
    const n = prices.length
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const x = (i: number) => (i / Math.max(1, n - 1)) * (W - PAD.r)
    const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b)
    const line = prices.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    const area = `${line} L${x(n - 1).toFixed(1)},${H - PAD.b} L0,${H - PAD.b} Z`
    return { n, min, max, x, y, line, area }
  }, [prices])

  const open = prices[0]
  const last = prices[n - 1]
  const at = hover == null ? last : prices[hover]
  const change = at - open
  const pct = (change / open) * 100
  const up = change >= 0
  const hue = up ? GREEN : RED

  const onMove = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / (W - PAD.r)) * (n - 1)))))
  }

  const ticks = [max, max - (max - min) * 0.5, min]

  return (
    <div className={cn("w-[480px] max-w-full", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-semibold text-foreground/90" style={{ fontFamily: SANS }}>
          {symbol}
        </span>
        <span className="text-[10px] tabular-nums text-foreground/35" style={{ fontFamily: SANS }}>
          {hover == null ? `${n} bars` : `bar ${hover + 1} / ${n}`}
        </span>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="mt-2 block w-full cursor-crosshair touch-none"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`${symbol} price, ${n} bars, ${up ? "up" : "down"} ${Math.abs(pct).toFixed(2)} percent from the open`}
        >
          <defs>
            {/* the dot field — one accent dot per 8px cell, the component's own texture */}
            <pattern id={`dots-${uid}`} x="0" y="0" width={DOT} height={DOT} patternUnits="userSpaceOnUse">
              <circle cx={DOT / 2} cy={DOT / 2} r={1.15} fill={accentRgba(0.9)} />
            </pattern>
            {/* dots thin out toward the floor so the fill never reads as a block */}
            <linearGradient id={`fade-${uid}`} x1="0" y1="0" x2="0" y2="1">
              {/* oxlint-disable shadcn/no-raw-colors -- mask stops: a mask reads luminance, so these stay white in both themes */}
              <stop offset="0%" stopColor="#fff" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              {/* oxlint-enable shadcn/no-raw-colors */}
            </linearGradient>
            <mask id={`mask-${uid}`}>
              <rect x="0" y="0" width={W} height={H} fill={`url(#fade-${uid})`} />
            </mask>
            {/* everything left of the cursor stays lit; the rest falls back */}
            <clipPath id={`past-${uid}`}>
              <rect x="0" y="0" width={hover == null ? W : x(hover)} height={H} />
            </clipPath>
          </defs>

          {/* gridlines + right-edge price ticks */}
          {ticks.map((v, i) => (
            <g key={i}>
              <line
                x1={0}
                y1={y(v)}
                x2={W - PAD.r}
                y2={y(v)}
                stroke="var(--foreground)"
                strokeOpacity={0.05}
                strokeDasharray="2 4"
              />
              <text
                x={W - PAD.r + 8}
                y={y(v) + 3}
                fontSize={8.5}
                fill="var(--foreground)"
                fillOpacity={0.3}
                className="tabular-nums"
                style={{ fontFamily: SANS }}
              >
                {v.toFixed(0)}
              </text>
            </g>
          ))}

          {/* resting state, and the bed the lit copy sits on while scrubbing */}
          <motion.path
            d={area}
            fill={`url(#dots-${uid})`}
            mask={`url(#mask-${uid})`}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: hover == null ? 1 : 0.28 }}
            transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: 0.6 }}
          />
          <motion.path
            d={line}
            fill="none"
            stroke={accentRgba(hover == null ? 1 : 0.3)}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
          />

          {/* the lit stretch behind the cursor */}
          {hover != null && (
            <g clipPath={`url(#past-${uid})`} pointerEvents="none">
              <path d={area} fill={`url(#dots-${uid})`} mask={`url(#mask-${uid})`} />
              <path d={line} fill="none" stroke={accentRgba(1)} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )}

          {/* crosshair + the bar's own dot */}
          {hover != null && (
            <g pointerEvents="none">
              <line
                x1={x(hover)}
                y1={PAD.t}
                x2={x(hover)}
                y2={H - PAD.b}
                stroke="var(--color-foreground)" strokeOpacity={0.16}
                strokeWidth={1}
              />
              <circle cx={x(hover)} cy={y(at)} r={3.2} fill={accentRgba(1)} stroke={SURFACE} strokeWidth={1.5} />
            </g>
          )}
        </svg>

        {/* read-out — the hovered price and what it means against the open */}
        {hover != null && (
          <div
            className="pointer-events-none absolute top-3 z-10 min-w-[124px] rounded-lg border border-foreground/[0.05] px-2.5 py-1.5"
            style={{
              left: `${Math.max(14, Math.min(78, (x(hover) / W) * 100))}%`,
              transform: "translateX(-50%)",
              background: SURFACE,
              boxShadow: "0 8px 24px var(--card-shadow, rgba(0,0,0,0.35))",
              fontFamily: SANS,
            }}
            role="status"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-foreground/55">Price</span>
              <span className="text-[10px] tabular-nums text-foreground/85">${at.toFixed(2)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-foreground/[0.04] pt-1.5">
              <span className="text-[10px] text-foreground/55">From open</span>
              <span className="text-[10px] tabular-nums" style={{ color: hue }}>
                {up ? "+" : "−"}${Math.abs(change).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* summary — open is the reference every number above is measured against */}
      <div className="mt-2 flex items-center justify-between border-t border-foreground/[0.04] pt-2.5">
        <span className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground/90" style={{ fontFamily: SANS }}>
          ${at.toFixed(2)}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-foreground/35" style={{ fontFamily: SANS }}>
            open ${open.toFixed(2)}
          </span>
          <span
            className="rounded-md px-2 py-0.5 text-[10.5px] tabular-nums"
            style={{ fontFamily: SANS, color: hue, background: `color-mix(in srgb, ${hue} 12%, transparent)` }}
          >
            {up ? "+" : "−"}
            {Math.abs(pct).toFixed(2)}%
          </span>
        </span>
      </div>
    </div>
  )
}
