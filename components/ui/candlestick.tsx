"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export interface Candle {
  o: number
  h: number
  l: number
  c: number
  /** relative volume, 0..1.5 */
  v: number
}

/** Deterministic walk so every render agrees (LCG, one seed). */
const DEFAULT_CANDLES: Candle[] = (() => {
  let s = 20260729
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const out: Candle[] = []
  let close = 174
  for (let i = 0; i < 46; i++) {
    const o = close
    const move = (rnd() - 0.47) * 3.4
    const c = o + move
    const h = Math.max(o, c) + rnd() * 1.5
    const l = Math.min(o, c) - rnd() * 1.5
    const v = 0.4 + rnd() * 0.7 + Math.abs(move) * 0.12
    out.push({ o, h, l, c, v })
    close = c
  }
  return out
})()

const W = 560
const H = 250
const PAD = { l: 8, r: 54, t: 14, b: 20 }
const PLOT_W = W - PAD.l - PAD.r
const VOL_H = 40
const PRICE_TOP = PAD.t
const PRICE_BOT = H - PAD.b - VOL_H - 10
const VOL_BOT = H - PAD.b

/**
 * The identity trading chart: candles over a volume histogram sharing the x.
 * A magnet crosshair snaps to the hovered candle, brightening it and dimming
 * the rest, with a price badge riding the right axis and a live O / H / L / C
 * legend up top. Green up, red down.
 */
export function Candlestick({
  symbol = "NVDA",
  candles = DEFAULT_CANDLES,
  className,
}: {
  symbol?: string
  /** open, high, low, close and a relative volume per bar */
  candles?: Candle[]
  className?: string
}) {
  const reduced = useReducedMotion()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hi, setHi] = useState<number | null>(null)
  /* the per-candle entry stagger is a first-mount flourish, not a re-render one */
  const [entered, setEntered] = useState(false)
  useEffect(() => setEntered(true), [])
  const n = candles.length

  const { pMin, pMax, vMax } = useMemo(() => {
    let lo = Number.POSITIVE_INFINITY
    let top = Number.NEGATIVE_INFINITY
    let vm = 0
    for (const d of candles) {
      lo = Math.min(lo, d.l)
      top = Math.max(top, d.h)
      vm = Math.max(vm, d.v)
    }
    const pad = (top - lo) * 0.06
    return { pMin: lo - pad, pMax: top + pad, vMax: vm || 1 }
  }, [candles])

  const step = PLOT_W / n
  const cw = Math.min(9, step * 0.6)
  const cx = (i: number) => PAD.l + (i + 0.5) * step
  const yP = (v: number) => PRICE_TOP + (1 - (v - pMin) / (pMax - pMin || 1)) * (PRICE_BOT - PRICE_TOP)
  const yV = (v: number) => VOL_BOT - (v / vMax) * VOL_H

  const onMove = (e: React.PointerEvent) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHi(Math.max(0, Math.min(n - 1, Math.floor((px - PAD.l) / step))))
  }

  const active = candles[hi ?? n - 1]
  const up = active.c >= active.o
  const chg = ((active.c - active.o) / active.o) * 100
  const hue = up ? GREEN : RED

  return (
    <div className={cn("w-[560px]", className)}>
      {/* OHLC legend */}
      <div className="mb-1 flex items-center gap-3 px-1 text-[11px] tabular-nums text-foreground/45">
        <span className="text-[12.5px] font-semibold text-foreground/90">{symbol}</span>
        {(["o", "h", "l", "c"] as const).map((k) => (
          <span key={k}>
            <span className="uppercase text-foreground/35">{k}</span>{" "}
            <span style={{ color: hue }}>{active[k].toFixed(2)}</span>
          </span>
        ))}
        <span style={{ color: hue }}>
          {up ? "+" : "−"}
          {Math.abs(chg).toFixed(2)}%
        </span>
      </div>

      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block cursor-crosshair touch-none"
        role="img"
        aria-label={`${symbol} candlestick chart`}
        onPointerMove={onMove}
        onPointerLeave={() => setHi(null)}
      >
        {/* price gridlines and the right axis */}
        {[0.25, 0.5, 0.75].map((f) => {
          const gy = PRICE_TOP + f * (PRICE_BOT - PRICE_TOP)
          return (
            <g key={f}>
              <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy} stroke="var(--foreground)" strokeOpacity={0.05} strokeDasharray="2 5" />
              <text x={W - PAD.r + 8} y={gy + 3} fontSize={8.5} fill="var(--foreground)" fillOpacity={0.3} className="tabular-nums">
                {(pMax - f * (pMax - pMin)).toFixed(0)}
              </text>
            </g>
          )
        })}

        {/* volume */}
        {candles.map((d, i) => {
          const barHue = d.c >= d.o ? GREEN : RED
          const dim = hi !== null && hi !== i
          return (
            <motion.rect
              key={`v${i}`}
              x={cx(i) - cw / 2}
              y={yV(d.v)}
              width={cw}
              height={VOL_BOT - yV(d.v)}
              rx={1}
              fill={barHue}
              initial={{ opacity: reduced || entered ? 0.45 : 0 }}
              animate={{ opacity: dim ? 0.15 : 0.45 }}
              transition={reduced || entered ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: i * 0.008 }}
            />
          )
        })}

        {/* price */}
        {candles.map((d, i) => {
            const barHue = d.c >= d.o ? GREEN : RED
            const dim = hi !== null && hi !== i
            const bodyTop = yP(Math.max(d.o, d.c))
            const bodyH = Math.max(1, Math.abs(yP(d.o) - yP(d.c)))
            return (
              <motion.g
                key={`c${i}`}
                initial={{ opacity: reduced || entered ? 1 : 0 }}
                animate={{ opacity: dim ? 0.32 : 1 }}
                transition={reduced || entered ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: i * 0.008 }}
              >
                <line x1={cx(i)} y1={yP(d.h)} x2={cx(i)} y2={yP(d.l)} stroke={barHue} strokeWidth={1} />
                <rect x={cx(i) - cw / 2} y={bodyTop} width={cw} height={bodyH} rx={1} fill={barHue} />
              </motion.g>
            )
          })}

        {/* magnet crosshair: rule plus a price badge on the hovered close */}
        {hi !== null && (
          <g pointerEvents="none">
            <line x1={cx(hi)} y1={PRICE_TOP} x2={cx(hi)} y2={VOL_BOT} stroke="var(--foreground)" strokeOpacity={0.18} strokeWidth={1} />
            <line x1={PAD.l} y1={yP(active.c)} x2={W - PAD.r} y2={yP(active.c)} stroke="var(--foreground)" strokeOpacity={0.16} strokeDasharray="3 3" />
            <g transform={`translate(${W - PAD.r + 2}, ${Math.max(PRICE_TOP + 8, Math.min(PRICE_BOT - 8, yP(active.c)))})`}>
              <rect x={0} y={-8} width={50} height={16} rx={4} fill="var(--card)" stroke={hue} strokeOpacity={0.7} />
              <text x={6} y={3.5} fontSize={9.5} fontWeight={600} fill={hue} className="tabular-nums">
                {active.c.toFixed(2)}
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  )
}
