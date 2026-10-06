"use client"

import { useId, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { AxisTag, ChartCard } from "@/components/ui/chart-overlay"

/* Equity Drawdown, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · tabular figures are set once on the root, so the axis figure that missed them lines up
   · the readout is complete and in place: equity, the return to that point, the drawdown
     there and how long it has been under the peak. Before, only the equity was written
   · the outlined badge on the axis is plain text; an axis figure steps aside under it
   · the equity line follows the direction of the whole return, green for a gain and red
     for a loss (it was always green); the drawdown stays red
   · the dots carry no ring, the drawdown axis uses a true minus
   Motion (2026-10-01): once the chart first comes into view one clip wipes both panels in
   from the left, the equity line, its fill, the underwater line and its fill together, 900ms
   (it was a 400ms dash draw on mount). A new series of the same length morphs both lines and
   both fills point for point in 380ms; a series of another length is drawn at once. Reduced
   motion draws every state at once.
   2026-10-02 audit: the header has the three tiers (spec 14.1): the name at /45 with the
   window at /90, the last equity at 26px with its cents at /35, then the total return in its
   hue and "since start" at /45. The max drawdown left the header for the aria-label, and the
   pointed day reads in the shared ChartCard beside the cursor (equity, return, drawdown, days
   below the peak) instead of re-keying the header on every crosshair step and printing a
   sentence at 10px. The pointed equity is the shared AxisTag in the line's hue, gridlines
   are solid at 5%, axis figures are 9px /45 with dollars on the equity axis, and the chart
   is 460 wide (the other charts' width) with a viewBox and a w-full svg. A new `name` prop
   names the curve.
   Formulas:
   · return at a day = (equity − the first equity) ÷ the first equity × 100
   · drawdown at a day = (equity − the running peak) ÷ the running peak × 100
   · days below the peak = the day − the day of the last running peak
   · max drawdown = the lowest drawdown in the series */

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

const W = 460
const H = 240
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
  name = "Equity",
  base,
  series,
  className,
}: {
  /** what the curve is, on the label row's left */
  name?: string
  /** pin the demo curve so its last value is this number; a scale, so the drawdown pane stays identical */
  base?: number
  /** draw this series instead of the demo walk; any length */
  series?: number[]
  className?: string
}) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const svgRef = useRef<SVGSVGElement>(null)
  const seen = useInView(svgRef, { once: true, amount: 0.3 })
  const shown = seen || !!reduced
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
  const morph = reduced ? { duration: 0 } : { duration: 0.38, ease: EASE }
  const [whole, cents] = fmt(eq[n - 1], { currency: true }).split(".")
  const retHue = (v: number) => (v >= 0 ? GREEN : RED)

  return (
    <div className={cn("w-[460px] max-w-full tabular-nums", className)}>
      {/* the header, three tiers (spec 14.1); the pointed day reads in the card, not here */}
      <div className="mb-3 flex items-baseline justify-between text-[12px]">
        <span className="truncate text-foreground/45">{name}</span>
        <span className="shrink-0 pl-3 font-medium text-foreground/90">{n} days</span>
      </div>
      <p className="m-0 text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
        {whole}
        {cents && <span className="text-foreground/35">.{cents}</span>}
      </p>
      <p className="mb-4 mt-2 flex items-baseline gap-[7px] text-[12px] font-medium" style={{ color: retHue(totalRet) }}>
        <span>{signedPct(totalRet, 2)}</span>
        <span className="font-normal text-foreground/45">since start</span>
      </p>

      <div className="relative">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full cursor-crosshair touch-none"
          role="img"
          aria-label={`${name} curve with drawdown over ${n} days. Equity ${fmt(eq[n - 1], { currency: true, precision: 0 })}, return ${signedPct(totalRet)}, max drawdown ${signedPct(maxDd)}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHi(null)}
        >
          <defs>
            <linearGradient id={`${uid}-eq`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineHue} stopOpacity="0.16" style={{ transition: reduced ? "none" : "stop-color 200ms" }} />
              <stop offset="100%" stopColor={lineHue} stopOpacity="0" style={{ transition: reduced ? "none" : "stop-color 200ms" }} />
            </linearGradient>
            <linearGradient id={`${uid}-dd`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RED} stopOpacity="0.02" />
              <stop offset="100%" stopColor={RED} stopOpacity="0.22" />
            </linearGradient>
            {/* the entrance: one clip wipes both panels in from the left, once */}
            <clipPath id={`${uid}-wipe`}>
              <motion.rect
                x={0}
                y={0}
                height={H}
                initial={{ width: reduced ? W - PAD.r + 4 : 0 }}
                animate={{ width: shown ? W - PAD.r + 4 : 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
              />
            </clipPath>
          </defs>

          {[0, 0.5, 1].map((f) => {
            const gy = EQ_TOP + f * (EQ_BOT - EQ_TOP)
            const under = hi !== null && Math.abs(gy - valueY) < 11
            return (
              <g key={f}>
                <line x1={PAD.l} y1={gy} x2={W - PAD.r} y2={gy} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} />
                <text
                  x={W - PAD.r + 8}
                  y={gy + 3}
                  fontSize={9}
                  fill="var(--foreground)"
                  fillOpacity={0.45}
                  style={{ opacity: under ? 0 : 1, transition: fade }}
                >
                  {fmt(eqMax - f * (eqMax - eqMin), { compact: true, currency: true })}
                </text>
              </g>
            )
          })}

          {/* drawdown panel: the zero line is the only solid gridline; it sits under the curves */}
          <line x1={PAD.l} y1={DD_TOP} x2={W - PAD.r} y2={DD_TOP} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} />
          <text x={W - PAD.r + 8} y={DD_TOP + 3} fontSize={9} fill="var(--foreground)" fillOpacity={0.45}>
            0%
          </text>
          <text x={W - PAD.r + 8} y={DD_BOT + 2} fontSize={9} fill="var(--foreground)" fillOpacity={0.45}>
            {`${ddMin < 0 ? "−" : ""}${Math.abs(ddMin).toFixed(0)}%`}
          </text>

          {/* keyed by length: same-length series morph point for point, another length is drawn at once */}
          <g key={n} clipPath={`url(#${uid}-wipe)`}>
            <motion.path initial={false} animate={{ d: geo.eqArea }} transition={morph} fill={`url(#${uid}-eq)`} />
            <motion.path
              initial={false}
              animate={{ d: geo.eqLine }}
              transition={morph}
              fill="none"
              stroke={lineHue}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: reduced ? "none" : "stroke 200ms" }}
            />
            <motion.path initial={false} animate={{ d: geo.ddArea }} transition={morph} fill={`url(#${uid}-dd)`} />
            <motion.path
              initial={false}
              animate={{ d: geo.ddLine }}
              transition={morph}
              fill="none"
              stroke={RED}
              strokeOpacity={0.8}
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          </g>

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

          {/* one crosshair across both panels, the equity tagged on the axis (chart-overlay.tsx) */}
          {hi !== null && (
            <g pointerEvents="none">
              <line x1={x(active)} y1={EQ_TOP} x2={x(active)} y2={DD_BOT} stroke="var(--foreground)" strokeOpacity={0.2} strokeWidth={1} />
              <circle cx={x(active)} cy={yEq(eq[active])} r={3} fill={lineHue} stroke="var(--background)" strokeWidth={1.5} />
              <circle cx={x(active)} cy={yDd(dd[active])} r={2.6} fill={RED} />
              <AxisTag x={W - PAD.r + 4} y={valueY} width={PAD.r - 6} color={lineHue}>
                {fmt(eq[active], { compact: true, currency: true })}
              </AxisTag>
            </g>
          )}
        </svg>

        {/* the pointed day, read beside the cursor; it flips left past 60% of the plot */}
        <ChartCard
          open={hi !== null}
          x={`${(x(active) / W) * 100}%`}
          flip={x(active) > PAD.l + PLOT_W * 0.6}
          heading={`Day ${active + 1} of ${n}`}
          rows={[
            { label: "Equity", value: fmt(eq[active], { currency: true }) },
            { label: "Return", value: signedPct(retAt(active), 2), color: retHue(retAt(active)) },
            { label: "Drawdown", value: signedPct(dd[active], 2) },
            { label: "Below peak", value: daysDown > 0 ? `${daysDown} ${daysDown === 1 ? "day" : "days"}` : "At the peak" },
          ]}
        />
      </div>
    </div>
  )
}
