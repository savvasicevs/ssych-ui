"use client"

import { useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

const TF = ["1D", "1W", "1M", "1Y", "All"] as const
export type ScrubTimeframe = (typeof TF)[number]

const N: Record<ScrubTimeframe, number> = { "1D": 78, "1W": 84, "1M": 90, "1Y": 120, All: 150 }

/** Deterministic walk per timeframe (LCG); 1M trends down so red earns its keep. */
function makeSeries(tf: ScrubTimeframe): number[] {
  let s = 1000 + TF.indexOf(tf) * 733
  const n = N[tf]
  const drift = tf === "1M" ? -0.22 : 0.28
  let v = 178
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    v += (s / 0x7fffffff - 0.5) * 2.2 + drift * 0.08
    out.push(v)
  }
  return out
}

function timeLabel(tf: ScrubTimeframe, f: number): string {
  const clamp = (x: number, top: number) => Math.max(0, Math.min(top, x))
  switch (tf) {
    case "1D": {
      const m = 570 + Math.round(f * 390)
      return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
    }
    case "1W":
      return ["Mon", "Tue", "Wed", "Thu", "Fri"][clamp(Math.floor(f * 5), 4)]
    case "1M":
      return `Day ${1 + Math.round(f * 29)}`
    case "1Y":
      return ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"][clamp(Math.floor(f * 12), 11)]
    case "All":
      return `’${22 + clamp(Math.floor(f * 4), 4)}`
  }
}

const AXES: Record<ScrubTimeframe, string[]> = {
  "1D": ["09:30", "11:30", "13:30", "15:30"],
  "1W": ["Mon", "Wed", "Fri"],
  "1M": ["Wk 1", "Wk 2", "Wk 3", "Wk 4"],
  "1Y": ["Aug", "Nov", "Feb", "May"],
  All: ["’22", "’23", "’24", "’25", "’26"],
}

const fmtPrice = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const W = 560
const H = 220
const PAD = { l: 10, r: 66, t: 18, b: 26 }
const PLOT_W = W - PAD.l - PAD.r
const PLOT_H = H - PAD.t - PAD.b

/* the hover wash: half-width of the falloff in svg units and how far the rest of
   the series drops back while it is lit; the ramp plateaus around the cursor
   and tails off steeply, peaking under 1 so it reads as brightness, not bloom */
const SPOT = 215
const SPOT_DIM = 0.2
const SPOT_STOPS: [number, number][] = [
  [0, 0],
  [0.1, 0],
  [0.22, 0.05],
  [0.32, 0.2],
  [0.4, 0.5],
  [0.5, 0.78],
  [0.6, 0.5],
  [0.68, 0.2],
  [0.78, 0.05],
  [0.9, 0],
  [1, 0],
]

/**
 * The scrub chart: a magnet crosshair snaps to the real datum with price and
 * time badges riding the axes, and scrubbing updates the hero number, which
 * recolours the whole chart off the reference price. A soft wash rides the
 * cursor, so the line reads lighter under the pointer and settles back on the
 * far sides. Timeframe pills morph the chart in place.
 */
export function PriceScrubber({
  symbol = "NVDA",
  timeframe = "1Y",
  className,
}: {
  symbol?: string
  /** the timeframe the chart opens on */
  timeframe?: ScrubTimeframe
  className?: string
}) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const svgRef = useRef<SVGSVGElement>(null)
  const [tf, setTf] = useState<ScrubTimeframe>(timeframe)
  const [hi, setHi] = useState<number | null>(null)

  const data = useMemo(() => makeSeries(tf), [tf])
  const n = data.length
  const { min, max } = useMemo(() => {
    const lo = Math.min(...data)
    const top = Math.max(...data)
    const pad = (top - lo) * 0.08
    return { min: lo - pad, max: top + pad }
  }, [data])

  const x = (i: number) => PAD.l + (i / (n - 1)) * PLOT_W
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * PLOT_H

  const onMove = (e: React.PointerEvent) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHi(Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / PLOT_W) * (n - 1)))))
  }

  const reference = data[0]
  const activeIdx = hi ?? n - 1
  const activeVal = data[activeIdx]
  const delta = activeVal - reference
  const deltaPct = (delta / reference) * 100
  const up = delta >= 0
  const hue = up ? GREEN : RED

  const line = data.map((v, idx) => `${idx === 0 ? "M" : "L"}${x(idx).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
  const area = `${line} L${x(n - 1).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z`
  const badgeY = y(activeVal)
  const crossX = x(activeIdx)

  return (
    <div className={cn("w-[560px]", className)}>
      {/* hero: scrubbing updates the number and the delta, everything recolours off the reference */}
      <div className="mb-1 px-1">
        <div className="flex items-center gap-2 text-[11px] text-foreground/45">
          <span className="font-semibold text-foreground/90">{symbol}</span>
          <span>· {hi === null ? "Today" : timeLabel(tf, activeIdx / (n - 1))}</span>
        </div>
        <div className="mt-0.5 flex items-baseline gap-2.5">
          <span className="text-[26px] font-semibold tabular-nums tracking-[-0.02em] text-foreground/90">{fmtPrice(activeVal)}</span>
          <span className="text-[13px] font-medium tabular-nums" style={{ color: hue }}>
            {up ? "+" : "−"}
            {fmtPrice(Math.abs(delta))} · {up ? "+" : "−"}
            {Math.abs(deltaPct).toFixed(2)}%
          </span>
        </div>
      </div>

      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block cursor-crosshair touch-none"
        role="img"
        aria-label={`${symbol} price over ${tf}, ${fmtPrice(data[n - 1])}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHi(null)}
      >
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hue} stopOpacity="0.16" />
            <stop offset="100%" stopColor={hue} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}-hot`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hue} stopOpacity="0.24" />
            <stop offset="100%" stopColor={hue} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((f) => {
          const gy = PAD.t + f * PLOT_H
          return (
            <g key={f}>
              <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy} stroke="var(--foreground)" strokeOpacity={0.05} strokeDasharray="2 5" />
              <text x={W - PAD.r + 8} y={gy + 3} fontSize={8.5} fill="var(--foreground)" fillOpacity={0.3} className="tabular-nums">
                {(max - f * (max - min)).toFixed(0)}
              </text>
            </g>
          )
        })}

        {AXES[tf].map((t, idx, arr) => (
          <text key={t} x={PAD.l + (idx / (arr.length - 1)) * PLOT_W} y={H - 8} textAnchor={idx === 0 ? "start" : idx === arr.length - 1 ? "end" : "middle"} fontSize={8.5} fill="var(--foreground)" fillOpacity={0.3}>
            {t}
          </text>
        ))}

        {/* area and line, re-keyed on the timeframe so they redraw; they sit back while scrubbing */}
        <g opacity={hi === null ? 1 : SPOT_DIM} style={{ transition: reduced ? "none" : "opacity 0.22s" }}>
          <motion.path key={`a-${tf}`} d={area} fill={`url(#${uid}-fill)`} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: 0.35 }} />
          <motion.path key={`l-${tf}`} d={line} fill="none" stroke={hue} strokeWidth={1.8} strokeLinejoin="round" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={reduced ? { duration: 0 } : { duration: 0.85, ease: EASE }} />
        </g>

        {/* the wash: a full-strength copy revealed through a mask that rides the cursor */}
        <AnimatePresence>
          {hi !== null && (
            <motion.g key="spot" pointerEvents="none" initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.16 } }} transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE }}>
              <defs>
                <linearGradient id={`${uid}-ramp`} gradientUnits="userSpaceOnUse" x1={crossX - SPOT} y1="0" x2={crossX + SPOT} y2="0">
                  {SPOT_STOPS.map(([offset, o]) => (
                    <stop key={offset} offset={`${offset * 100}%`} stopColor="white" stopOpacity={o} />
                  ))}
                </linearGradient>
                <mask id={`${uid}-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                  <rect x={0} y={0} width={W} height={H} fill={`url(#${uid}-ramp)`} />
                </mask>
              </defs>
              <g mask={`url(#${uid}-mask)`}>
                <path d={area} fill={`url(#${uid}-hot)`} />
                <path d={line} fill="none" stroke={hue} strokeWidth={1.8} strokeLinejoin="round" />
              </g>
            </motion.g>
          )}
        </AnimatePresence>

        {/* magnet crosshair: rule, snapped dot and the two axis badges */}
        {hi !== null && (
          <g pointerEvents="none">
            <line x1={crossX} y1={PAD.t} x2={crossX} y2={H - PAD.b} stroke="var(--foreground)" strokeOpacity={0.2} strokeWidth={1} />
            <circle cx={crossX} cy={badgeY} r={3.5} fill={hue} stroke="var(--card)" strokeWidth={1.75} />
            <g transform={`translate(${W - PAD.r + 2}, ${Math.max(PAD.t + 8, Math.min(H - PAD.b - 8, badgeY))})`}>
              <rect x={0} y={-8} width={58} height={16} rx={4} fill="var(--card)" stroke={hue} strokeOpacity={0.7} />
              <text x={6} y={3.5} fontSize={9.5} fontWeight={600} fill={hue} className="tabular-nums">
                {activeVal.toFixed(2)}
              </text>
            </g>
            <g transform={`translate(${Math.max(PAD.l + 20, Math.min(W - PAD.r - 20, crossX))}, ${H - PAD.b + 2})`}>
              <rect x={-22} y={0} width={44} height={15} rx={4} fill="var(--card)" stroke={hue} strokeOpacity={0.7} />
              <text x={0} y={11} textAnchor="middle" fontSize={9} fontWeight={600} fill={hue}>
                {timeLabel(tf, activeIdx / (n - 1))}
              </text>
            </g>
          </g>
        )}
      </svg>

      {/* timeframe pills: the chart morphs in place */}
      <div className="mt-2 flex justify-center gap-1">
        {TF.map((t) => {
          const on = t === tf
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => setTf(t)}
              className={cn("relative h-7 rounded-full px-3 text-[11px] font-semibold tabular-nums transition-colors duration-150", on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/70")}
            >
              {on && !reduced && <motion.span layoutId={`${uid}-tf`} className="absolute inset-0 rounded-full bg-foreground/[0.08]" transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} />}
              {on && reduced && <span className="absolute inset-0 rounded-full bg-foreground/[0.08]" />}
              <span className="relative">{t}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
