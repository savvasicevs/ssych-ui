"use client"

import { useId, useMemo, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const ACCENT: [number, number, number] = [72, 159, 250]
const CHART = { blue: 'var(--chart-1, #489ffa)', green: 'var(--chart-2, #4dbe95)' } as const
const HAIRLINE = 'color-mix(in srgb, var(--foreground) 5.5%, transparent)'
const SANS = 'inherit'
const SURFACE = 'var(--card)'
const TEXT = 'var(--foreground)'
const TEXT_MUTED = 'var(--muted-foreground)'
const accentRgba = (a: number, c: [number, number, number] = ACCENT) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

export interface WatchAsset {
  symbol: string
  name: string
  price: number
  change: number
  points: number[]
}

const DEFAULT_ASSETS: WatchAsset[] = [
  { symbol: 'NVDA', name: 'NVIDIA', price: 136.24, change: 3.82, points: [3, 5, 4, 8, 7, 12, 11, 15] },
  { symbol: 'AMZN', name: 'Amazon', price: 178.52, change: 1.46, points: [4, 4, 6, 5, 8, 7, 10, 12] },
  { symbol: 'SPY', name: 'S&P 500 ETF', price: 604.21, change: 0.48, points: [6, 7, 6, 8, 9, 8, 10, 11] },
  { symbol: 'AAPL', name: 'Apple', price: 212.33, change: -0.72, points: [12, 11, 13, 10, 9, 10, 8, 7] },
  { symbol: 'VIX', name: 'Volatility', price: 14.88, change: -2.14, points: [14, 13, 15, 12, 11, 9, 10, 7] },
]

const VB_W = 96
const VB_H = 24

/** Bare trend mark — one 1.5px line, a soft area fill, an end dot. */
function Sparkline({ data, color, width = 72, reduced }: { data: number[]; color: string; width?: number; reduced: boolean }) {
  const uid = useId().replace(/:/g, '')
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = Math.max(1e-6, max - min)
  const x = (i: number) => 2 + (i * (VB_W - 8)) / Math.max(1, data.length - 1)
  const y = (v: number) => 20 - ((v - min) / span) * 16
  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')
  const area = `${line} L ${x(data.length - 1)} ${VB_H} L ${x(0)} ${VB_H} Z`
  const end = { x: x(data.length - 1), y: y(data[data.length - 1]) }

  return (
    <svg width={width} height={(width / VB_W) * VB_H} viewBox={`0 0 ${VB_W} ${VB_H}`} fill="none" aria-hidden>
      <defs>
        <linearGradient id={`spk-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        d={area}
        fill={`url(#spk-${uid})`}
        initial={{ opacity: reduced ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: 0.6 }}
      />
      <motion.path
        d={line}
        stroke={color}
        strokeWidth="1.5"
        initial={{ pathLength: reduced ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
      />
      <motion.circle
        cx={end.x}
        cy={end.y}
        r="2"
        fill={color}
        initial={{ opacity: reduced ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: 0.85 }}
      />
    </svg>
  )
}

export interface MarketWatchlistProps {
  title?: string
  assets?: WatchAsset[]
  className?: string
}

/**
 * Sortable quote register: symbol + name, trend sparkline, price with signed
 * day change. Sorting flips per column, a soft highlight glides between rows
 * on hover, and the selected row carries the accent spine.
 */
export function MarketWatchlist({ title = "Market watchlist", assets = DEFAULT_ASSETS, className }: MarketWatchlistProps) {
  const reduced = useReducedMotion() ?? false
  const glideId = useId()
  const [sort, setSort] = useState<'symbol' | 'change'>('change')
  const [descending, setDescending] = useState(true)
  const [active, setActive] = useState(assets[0]?.symbol ?? '')
  const [hover, setHover] = useState<string | null>(null)

  const rows = useMemo(() => [...assets].sort((a, b) => {
    const result = sort === 'change' ? a.change - b.change : a.symbol.localeCompare(b.symbol)
    return descending ? -result : result
  }), [assets, sort, descending])

  const changeSort = (next: 'symbol' | 'change') => {
    if (sort === next) setDescending((value) => !value)
    else { setSort(next); setDescending(next === 'change') }
  }

  return (
    <div className={cn("w-full max-w-[540px] overflow-hidden rounded-lg border", className)} style={{ background: SURFACE, borderColor: HAIRLINE, fontFamily: SANS }} onMouseLeave={() => setHover(null)}>
      <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: HAIRLINE }}><h3 className="text-[13px] font-semibold" style={{ color: TEXT }}>{title}</h3><span className="text-[10px]" style={{ color: TEXT_MUTED }}>{assets.length} assets</span></div>
      <div className="grid grid-cols-[minmax(0,1fr)_80px_92px] items-center border-b px-5 py-2 text-[10px] font-normal tracking-[0.07em]" style={{ borderColor: HAIRLINE, color: TEXT_MUTED }}>
        <button type="button" onClick={() => changeSort('symbol')} className="flex items-center gap-1 text-left">Asset {sort === 'symbol' && (descending ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}</button>
        <span className="text-center">Trend</span>
        <button type="button" onClick={() => changeSort('change')} className="flex items-center justify-end gap-1">Change {sort === 'change' && (descending ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}</button>
      </div>
      {rows.map((asset, i) => {
        const selected = active === asset.symbol
        const positive = asset.change >= 0
        const hovered = hover === asset.symbol
        return (
          <motion.button
            key={asset.symbol}
            type="button"
            layout={!reduced}
            onClick={() => setActive(asset.symbol)}
            onMouseEnter={() => setHover(asset.symbol)}
            onFocus={() => setHover(asset.symbol)}
            className="relative grid w-full grid-cols-[minmax(0,1fr)_80px_92px] items-center border-b px-5 py-3 text-left transition-colors last:border-b-0"
            style={{ borderColor: HAIRLINE, background: selected ? accentRgba(0.045) : undefined }}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: i * 0.05 }}
          >
            {/* hover affordance — one soft highlight that glides between rows */}
            {hovered && (reduced ? (
              <span aria-hidden className="pointer-events-none absolute inset-0 bg-foreground/[0.05]" />
            ) : (
              <motion.span aria-hidden layoutId={glideId} className="pointer-events-none absolute inset-0 bg-foreground/[0.05]" transition={{ duration: 0.2, ease: EASE }} />
            ))}
            <span className="relative z-10 flex min-w-0 items-center gap-3"><span className="h-4 w-[2px] shrink-0 rounded-full" style={{ background: selected ? CHART.blue : 'color-mix(in srgb, var(--foreground) 12%, transparent)' }} /><span className="min-w-0"><span className="block text-[12px] font-semibold" style={{ color: TEXT }}>{asset.symbol}</span><span className="block truncate text-[10px]" style={{ color: TEXT_MUTED }}>{asset.name}</span></span></span>
            <span className="relative z-10 flex justify-center"><Sparkline data={asset.points} color={positive ? CHART.green : 'var(--chart-down, #e06a6a)'} width={72} reduced={reduced} /></span>
            <span className="relative z-10 text-right tabular-nums"><span className="block text-[12px] font-semibold" style={{ color: TEXT }}>${asset.price.toFixed(2)}</span><span className="text-[10px] font-semibold" style={{ color: positive ? CHART.green : 'var(--chart-down, #e06a6a)' }}>{positive ? '+' : ''}{asset.change.toFixed(2)}%</span></span>
          </motion.button>
        )
      })}
    </div>
  )
}
