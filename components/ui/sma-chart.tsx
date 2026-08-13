"use client"

import { useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const ACCENT: [number, number, number] = [72, 159, 250]
const AMBER = "var(--chart-amber)"
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const SANS = "inherit"
const SURFACE = "var(--card)"
const accentRgba = (a: number, c: [number, number, number] = ACCENT) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

const W = 400
const H = 190
const PAD = { r: 48 }

/** deterministic default series — a drifting daily close */
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

export interface SmaChartProps {
  /** ticker shown top-left */
  symbol?: string
  /** company name beside the ticker */
  name?: string
  /** price series, oldest → latest (the two SMAs derive from it) */
  prices?: number[]
  className?: string
}

/**
 * Moving-average chart: one price line with its fast and slow SMA overlays,
 * right-edge price ticks, crosshair scrubbing with a three-series tooltip,
 * and a summary row — last price left, signed 30-bar change chip right.
 */
export function SmaChart({ symbol = "AMZN", name = "Amazon.com Inc.", prices = DEFAULT_PRICES, className }: SmaChartProps) {
  const reduced = useReducedMotion()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const { n, price, fast, slow, min, max, x, y, path } = useMemo(() => {
    const price = prices
    const n = price.length
    const fast = smaOf(price, 14)
    const slow = smaOf(price, 45)
    const all = [...price, ...fast, ...slow]
    const min = Math.min(...all)
    const max = Math.max(...all)
    const x = (i: number) => (i / (n - 1)) * (W - PAD.r)
    const y = (v: number) => 8 + (1 - (v - min) / (max - min || 1)) * (H - 16)
    const path = (d: number[]) => d.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    return { n, price, fast, slow, min, max, x, y, path }
  }, [prices])

  const last = price[n - 1]
  const base = price[Math.max(0, n - 30)]
  const change = last - base
  const pct = (change / base) * 100
  const up = change >= 0
  const hue = up ? GREEN : RED

  const onMove = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / (W - PAD.r)) * (n - 1)))))
  }

  return (
    <div className={cn("w-[420px]", className)}>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: SANS }}>
          <span className="text-[12.5px] font-semibold text-foreground/90">{symbol}</span>
          <span className="ml-2 text-[11px] text-foreground/40">{name}</span>
        </span>
        <span className="flex items-center gap-3 text-[10px] text-foreground/45" style={{ fontFamily: SANS }}>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: accentRgba(1) }} /> 60 SMA
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: AMBER }} /> 200 SMA
          </span>
        </span>
      </div>

      <div className="relative">
      <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mt-2 block cursor-crosshair touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {/* right-edge price ticks */}
        {[max, max - (max - min) * 0.25, max - (max - min) * 0.5, max - (max - min) * 0.75, min].map((v, i) => (
          <g key={i}>
            <line x1={0} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke="color-mix(in srgb, var(--foreground) 4%, transparent)" />
            <text x={W - PAD.r + 8} y={y(v) + 3} fontSize={8.5} fill="color-mix(in srgb, var(--foreground) 30%, transparent)" style={{ fontFamily: SANS }}>
              {v.toFixed(2)}
            </text>
          </g>
        ))}

        {/* overlays first, price on top */}
        <motion.path
          d={path(slow)}
          fill="none"
          stroke={AMBER}
          strokeOpacity={0.75}
          strokeWidth={1.1}
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 1, ease: EASE, delay: 0.25 }}
        />
        <motion.path
          d={path(fast)}
          fill="none"
          stroke={accentRgba(0.8)}
          strokeWidth={1.1}
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 1, ease: EASE, delay: 0.15 }}
        />
        <motion.path
          d={path(price)}
          fill="none"
          stroke="color-mix(in srgb, var(--foreground) 80%, transparent)"
          strokeWidth={1.2}
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 1, ease: EASE }}
        />
        {/* crosshair + series dots */}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} y1={8} x2={x(hover)} y2={H - 8} stroke="color-mix(in srgb, var(--foreground) 16%, transparent)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(price[hover])} r={2.8} fill="var(--foreground)" stroke={SURFACE} strokeWidth={1.4} />
            <circle cx={x(hover)} cy={y(fast[hover])} r={2.4} fill={accentRgba(1)} stroke={SURFACE} strokeWidth={1.2} />
            <circle cx={x(hover)} cy={y(slow[hover])} r={2.4} fill={AMBER} stroke={SURFACE} strokeWidth={1.2} />
          </g>
        )}
      </svg>

      {/* tooltip — price + both averages at the hovered bar */}
      {hover != null && (
        <div
          className="pointer-events-none absolute top-3 z-10 min-w-[132px] rounded-lg border border-foreground/[0.05] px-2.5 py-1.5"
          style={{
            left: `${Math.max(14, Math.min(78, (x(hover) / W) * 100))}%`,
            transform: "translateX(-50%)",
            background: SURFACE,
            boxShadow: "0 8px 24px var(--card-shadow, rgba(0,0,0,0.35))",
            fontFamily: SANS,
          }}
          role="status"
        >
          <div className="text-[9px] tabular-nums text-foreground/35">bar {hover + 1} / {n}</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded-full bg-foreground/70" /><span className="text-[10px] text-foreground/55">Price</span></span>
            <span className="tabular-nums text-[10px] text-foreground/85">${price[hover].toFixed(2)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded-full" style={{ background: accentRgba(1) }} /><span className="text-[10px] text-foreground/55">60 SMA</span></span>
            <span className="tabular-nums text-[10px] text-foreground/85">${fast[hover].toFixed(2)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded-full" style={{ background: AMBER }} /><span className="text-[10px] text-foreground/55">200 SMA</span></span>
            <span className="tabular-nums text-[10px] text-foreground/85">${slow[hover].toFixed(2)}</span>
          </div>
        </div>
      )}
      </div>

      {/* summary row */}
      <div className="mt-2 flex items-center justify-between border-t border-foreground/[0.04] pt-2.5">
        <span className="text-[13px] font-semibold tabular-nums text-foreground/90" style={{ fontFamily: SANS }}>
          ${last.toFixed(2)}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums" style={{ fontFamily: SANS, color: hue }}>
            {up ? "+" : "−"}${Math.abs(change).toFixed(2)}
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
