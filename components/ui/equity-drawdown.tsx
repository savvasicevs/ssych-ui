"use client"

import { useId, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Equity Drawdown, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · tabular figures are set once on the root, so the axis figure that missed them lines up
   · the readout is complete and in place: equity, the return to that point, the drawdown
     there and how long it has been under the peak. Before, only the equity was written
   · the outlined badge on the axis is plain text; an axis figure steps aside under it
   · the equity line follows the direction of the whole return, green for a gain and red
     for a loss (it was always green); the drawdown stays red
   · the dots carry no ring, the drawdown axis uses a true minus */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

const N = 96

/** Deterministic equity walk so every render agrees (LCG, one seed). */
const DEFAULT_EQUITY: number[] = (() => {
  let s = 42
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const out: number[] = []
  let v = 10000
  for (let i = 0; i < N; i++) {
    v *= 1 + (rnd() - 0.42) * 0.022
    out.push(v)
  }
  return out
})()

/** compact or currency formatting with a real minus */
const fmt = (n: number, o: { compact?: boolean; currency?: boolean; precision?: number } = {}) => {
  const digits = o.precision ?? (o.compact ? 1 : 2)
  const body = new Intl.NumberFormat("en-US", {
    notation: o.compact ? "compact" : "standard",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    style: o.currency ? "currency" : "decimal",
    currency: "USD",
  }).format(Math.abs(n))
  return (n < 0 ? "−" : "") + body
}

const signedPct = (v: number, dp = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`

/** running drawdown and the index of the high-water mark, for any equity series */
function drawdownOf(eq: number[]) {
  const dd: number[] = []
  const lastHigh: number[] = []
  let top = Number.NEGATIVE_INFINITY
  let topIdx = 0
  eq.forEach((v, i) => {
    if (v >= top) {
      top = v
      topIdx = i
    }
    dd.push(((v - top) / top) * 100)
    lastHigh.push(topIdx)
  })
  return { dd, lastHigh }
}

const W = 560
const H = 250
const PAD = { l: 8, r: 58, t: 16, b: 20 }
const PLOT_W = W - PAD.l - PAD.r
const DD_H = 54
const GAP = 14
const EQ_TOP = PAD.t
const EQ_BOT = H - PAD.b - DD_H - GAP
const DD_TOP = EQ_BOT + GAP
const DD_BOT = H - PAD.b

/**
 * A cumulative equity curve over its underwater panel (percent off the running peak). One
 * crosshair drives both and reads equity, the return to that point, the drawdown there
 * and how long it has been below the high-water mark. Every number is derivable: drawdown
 * is (value − peak) ÷ peak, the return is (value − first) ÷ first.
 */
export function EquityDrawdown({
  base,
  series,
  className,
}: {
  /** pin the demo curve so its last value is this number; a scale, so the drawdown pane stays identical */
  base?: number
  /** draw this series instead of the demo walk; any length */
  series?: number[]
  className?: string
}) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const svgRef = useRef<SVGSVGElement>(null)
  const [hi, setHi] = useState<number | null>(null)

  const { eq, n, dd, lastHigh, eqMin, eqMax, ddMin } = useMemo(() => {
    let eq: number[]
    if (series && series.length >= 2) eq = series
    else {
      const k = base != null && DEFAULT_EQUITY[N - 1] !== 0 ? base / DEFAULT_EQUITY[N - 1] : 1
      eq = k === 1 ? DEFAULT_EQUITY : DEFAULT_EQUITY.map((v) => v * k)
    }
    const { dd, lastHigh } = drawdownOf(eq)
    return {
      eq,
      n: eq.length,
      dd,
      lastHigh,
      eqMin: Math.min(...eq) * 0.998,
      eqMax: Math.max(...eq) * 1.002,
      ddMin: Math.min(...dd) * 1.1 || -1,
    }
  }, [base, series])

  const x = (i: number) => PAD.l + (i / (n - 1)) * PLOT_W
  const yEq = (v: number) => EQ_TOP + (1 - (v - eqMin) / (eqMax - eqMin || 1)) * (EQ_BOT - EQ_TOP)
  const yDd = (v: number) => DD_TOP + (v / ddMin) * (DD_BOT - DD_TOP)

  const geo = useMemo(() => {
    const eqLine = eq.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yEq(v).toFixed(1)}`).join(" ")
    const eqArea = `${eqLine} L${x(n - 1).toFixed(1)},${EQ_BOT} L${x(0).toFixed(1)},${EQ_BOT} Z`
    const ddLine = dd.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yDd(v).toFixed(1)}`).join(" ")
    const ddArea = `${ddLine} L${x(n - 1).toFixed(1)},${DD_TOP} L${x(0).toFixed(1)},${DD_TOP} Z`
    return { eqLine, eqArea, ddLine, ddArea }
    // the scales are derived from eq and dd; listing them keeps the memo honest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eq, dd, eqMin, eqMax, ddMin, n])

  const onMove = (e: React.PointerEvent) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHi(Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / PLOT_W) * (n - 1)))))
  }

  const active = hi ?? n - 1
  const retAt = (i: number) => ((eq[i] - eq[0]) / eq[0]) * 100
  const totalRet = retAt(n - 1)
  const maxDd = Math.min(...dd)
  const daysDown = active - lastHigh[active]
  const lineHue = totalRet >= 0 ? GREEN : RED
  const valueY = Math.max(EQ_TOP + 8, Math.min(EQ_BOT - 8, yEq(eq[active])))
  const fade = reduced ? "none" : "opacity 160ms"
  /* the readout swaps in place as the crosshair moves (text swap: 4px, 2px blur, 150ms),
     starting from a dimmed copy so it never blinks out mid-scrub; reduced motion keeps
     only the fade */
  const swap = {
    initial: reduced ? { opacity: 0.4 } : { opacity: 0.4, y: 4, filter: "blur(2px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.15, ease: EASE },
  }

  return (
    <div className={cn("w-[560px] tabular-nums", className)}>
      <div role="status" className="mb-1 flex items-baseline justify-between gap-4 px-1">
        <div className="flex items-baseline gap-2.5">
          <motion.span key={`v${active}`} {...swap} className="inline-block text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
            {fmt(eq[active], { currency: true, precision: 0 })}
          </motion.span>
          <motion.span key={`r${active}`} {...swap} className="inline-block text-[12px] font-medium" style={{ color: retAt(active) >= 0 ? GREEN : RED }}>
            {signedPct(retAt(active))}
          </motion.span>
        </div>
        <motion.span key={hi === null ? "all" : `d${active}`} {...swap} className="inline-block whitespace-nowrap text-[10px] text-foreground/45">
          {hi === null ? (
            <>
              Max drawdown{" "}
              <span className="font-medium" style={{ color: RED }}>
                {signedPct(maxDd)}
              </span>
            </>
          ) : daysDown > 0 ? (
            <>
              <span className="font-medium" style={{ color: RED }}>
                {signedPct(dd[active])}
              </span>{" "}
              off the peak, {daysDown} {daysDown === 1 ? "day" : "days"} below it
            </>
          ) : (
            "At the peak"
          )}
        </motion.span>
      </div>

      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block cursor-crosshair touch-none"
        role="img"
        aria-label={`Equity curve with drawdown. Equity ${fmt(eq[n - 1], { currency: true, precision: 0 })}, return ${signedPct(totalRet)}, max drawdown ${signedPct(maxDd)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHi(null)}
      >
        <defs>
          <linearGradient id={`${uid}-eq`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineHue} stopOpacity="0.16" />
            <stop offset="100%" stopColor={lineHue} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}-dd`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={RED} stopOpacity="0.02" />
            <stop offset="100%" stopColor={RED} stopOpacity="0.22" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((f) => {
          const gy = EQ_TOP + f * (EQ_BOT - EQ_TOP)
          const under = hi !== null && Math.abs(gy - valueY) < 11
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
                {fmt(eqMax - f * (eqMax - eqMin), { compact: true })}
              </text>
            </g>
          )
        })}

        <motion.path
          d={geo.eqArea}
          fill={`url(#${uid}-eq)`}
          initial={{ opacity: reduced ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: 0.2 }}
        />
        <motion.path
          d={geo.eqLine}
          fill="none"
          stroke={lineHue}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }}
        />

        {/* drawdown panel: the zero line is the only solid gridline */}
        <line x1={PAD.l} y1={DD_TOP} x2={W - PAD.r} y2={DD_TOP} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} />
        <text x={W - PAD.r + 8} y={DD_TOP + 3} fontSize={8.5} fill="var(--foreground)" fillOpacity={0.35}>
          0%
        </text>
        <text x={W - PAD.r + 8} y={DD_BOT + 2} fontSize={8.5} fill="var(--foreground)" fillOpacity={0.35}>
          {`${ddMin < 0 ? "−" : ""}${Math.abs(ddMin).toFixed(0)}%`}
        </text>
        <motion.path
          d={geo.ddArea}
          fill={`url(#${uid}-dd)`}
          initial={{ opacity: reduced ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: 0.25 }}
        />
        <motion.path
          d={geo.ddLine}
          fill="none"
          stroke={RED}
          strokeOpacity={0.8}
          strokeWidth={1.2}
          strokeLinejoin="round"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: 0.05 }}
        />

        {/* the current underwater episode, from the high-water mark to the cursor */}
        {hi !== null && daysDown > 0 && (
          <g pointerEvents="none">
            <rect
              x={x(lastHigh[active])}
              y={DD_TOP}
              width={x(active) - x(lastHigh[active])}
              height={DD_BOT - DD_TOP}
              fill={`color-mix(in srgb, ${RED} 8%, transparent)`}
            />
            <line
              x1={x(lastHigh[active])}
              y1={yEq(eq[lastHigh[active]])}
              x2={x(active)}
              y2={yEq(eq[lastHigh[active]])}
              stroke={`color-mix(in srgb, ${RED} 45%, transparent)`}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={x(lastHigh[active])} cy={yEq(eq[lastHigh[active]])} r={2.4} fill="var(--foreground)" fillOpacity={0.45} />
          </g>
        )}

        {/* one crosshair across both panels, the equity written on the axis */}
        {hi !== null && (
          <g pointerEvents="none">
            <line x1={x(active)} y1={EQ_TOP} x2={x(active)} y2={DD_BOT} stroke="var(--foreground)" strokeOpacity={0.2} strokeWidth={1} />
            <circle cx={x(active)} cy={yEq(eq[active])} r={3} fill={lineHue} />
            <circle cx={x(active)} cy={yDd(dd[active])} r={2.6} fill={RED} />
            <text x={W - PAD.r + 8} y={valueY + 3.5} fontSize={9} fontWeight={600} fill={lineHue}>
              {fmt(eq[active], { compact: true })}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}
