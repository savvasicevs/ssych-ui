"use client"

import { useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Candlestick, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the legend says Open, High, Low, Close as written words: no capitals set by style
   · the price on the right axis is plain text in the candle's colour, the outlined badge
     is gone; an axis figure steps aside while the price sits on it
   · the other candles dim to 0.35 over 160ms when one is pointed at
   · the legend is the readout (role status) and the chart's name carries the last close
   · tabular figures are set once on the root */

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

/** a readout figure that changes on hover re-enters 4px out of a 2px blur over 150ms;
    reduced motion keeps the fade and drops the travel */
function Swap({ k, reduced, children }: { k: string; reduced: boolean; children: React.ReactNode }) {
  return (
    <motion.span
      key={k}
      className="inline-block"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.15, ease: EASE }}
    >
      {children}
    </motion.span>
  )
}

const FIELDS = [
  { k: "o", name: "Open" },
  { k: "h", name: "High" },
  { k: "l", name: "Low" },
  { k: "c", name: "Close" },
] as const

/**
 * Candles over a volume histogram that share one x. A crosshair snaps to the candle under
 * the pointer, keeps it full and dims the rest, writes its close on the right axis and its
 * open, high, low and close in the legend. Green up, red down.
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
  const reduced = useReducedMotion() ?? false
  const svgRef = useRef<SVGSVGElement>(null)
  const [hi, setHi] = useState<number | null>(null)
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

  const step = PLOT_W / Math.max(1, n)
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

  const lastCandle = candles[n - 1] ?? { o: 0, h: 0, l: 0, c: 0, v: 0 }
  const active = candles[hi ?? n - 1] ?? lastCandle
  const up = active.c >= active.o
  /** (close − open) ÷ open */
  const change = (d: Candle) => (d.o ? ((d.c - d.o) / d.o) * 100 : 0)
  const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`
  const hue = up ? GREEN : RED
  const priceY = Math.max(PRICE_TOP + 8, Math.min(PRICE_BOT - 8, yP(active.c)))
  const fade = reduced ? "none" : "opacity 160ms"
  /* the entrance: every candle rises from its own middle, 8ms apart, the whole run under 300ms */
  const stagger = Math.min(0.008, 0.28 / Math.max(1, n))

  return (
    <div className={cn("w-[560px] tabular-nums", className)}>
      <div role="status" className="mb-1 flex items-baseline gap-3 px-1 text-[11px] text-foreground/45">
        <span className="text-[12.5px] font-semibold text-foreground/90">{symbol}</span>
        {FIELDS.map((f) => (
          <span key={f.k}>
            {f.name}{" "}
            <span className="font-medium" style={{ color: hue }}>
              <Swap k={`${hi ?? "last"}-${f.k}`} reduced={reduced}>
                {active[f.k].toFixed(2)}
              </Swap>
            </span>
          </span>
        ))}
        <span className="font-medium" style={{ color: hue }}>
          <Swap k={`${hi ?? "last"}-chg`} reduced={reduced}>
            {signedPct(change(active))}
          </Swap>
        </span>
      </div>

      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block cursor-crosshair touch-none"
        role="img"
        aria-label={`${symbol} candlestick chart, ${n} bars. Last close ${lastCandle.c.toFixed(2)}, ${signedPct(change(lastCandle))} on the bar`}
        onPointerMove={onMove}
        onPointerLeave={() => setHi(null)}
      >
        {/* price gridlines and the right axis */}
        {[0.25, 0.5, 0.75].map((f) => {
          const gy = PRICE_TOP + f * (PRICE_BOT - PRICE_TOP)
          const under = hi !== null && Math.abs(gy - priceY) < 11
          return (
            <g key={f}>
              <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} strokeDasharray="2 5" />
              <text
                x={W - PAD.r + 8}
                y={gy + 3}
                fontSize={8.5}
                fill="var(--foreground)"
                fillOpacity={0.35}
                style={{ opacity: under ? 0 : 1, transition: fade }}
              >
                {(pMax - f * (pMax - pMin)).toFixed(0)}
              </text>
            </g>
          )
        })}

        {candles.map((d, i) => {
          const barHue = d.c >= d.o ? GREEN : RED
          const dim = hi !== null && hi !== i
          const bodyTop = yP(Math.max(d.o, d.c))
          const bodyH = Math.max(1, Math.abs(yP(d.o) - yP(d.c)))
          return (
            <motion.g
              key={i}
              initial={reduced ? false : { opacity: 0, scaleY: 0.6 }}
              animate={{ opacity: 1, scaleY: 1 }}
              style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
              transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: i * stagger }}
            >
              <g style={{ opacity: dim ? 0.35 : 1, transition: fade }}>
                {/* volume is the same hue at a lower strength */}
                <rect x={cx(i) - cw / 2} y={yV(d.v)} width={cw} height={VOL_BOT - yV(d.v)} rx={1} fill={barHue} fillOpacity={0.45} />
                <line x1={cx(i)} y1={yP(d.h)} x2={cx(i)} y2={yP(d.l)} stroke={barHue} strokeWidth={1} />
                <rect x={cx(i) - cw / 2} y={bodyTop} width={cw} height={bodyH} rx={1} fill={barHue} />
              </g>
            </motion.g>
          )
        })}

        {/* the crosshair: a rule on the candle, a rule on its close, the close written on the axis */}
        {hi !== null && (
          <g pointerEvents="none">
            <line x1={cx(hi)} y1={PRICE_TOP} x2={cx(hi)} y2={VOL_BOT} stroke="var(--foreground)" strokeOpacity={0.18} strokeWidth={1} />
            <line x1={PAD.l} y1={yP(active.c)} x2={W - PAD.r} y2={yP(active.c)} stroke="var(--foreground)" strokeOpacity={0.16} strokeWidth={1} strokeDasharray="3 3" />
            <text x={W - PAD.r + 8} y={priceY + 3.5} fontSize={9.5} fontWeight={600} fill={hue}>
              {active.c.toFixed(2)}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}
