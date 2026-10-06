"use client"

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { ChartCard } from "@/components/ui/chart-overlay"

/* Assets Balance Card, the compact member of the Balance family (with Total Balance).
   2026-10-02 audit: redesigned. It was a 34px odometer figure, a drag handle that pulled
   the chart taller (and flipped the layout past 132px), 72px of dead padding on top and a
   scrub value made up from the line's pixel height; too complicated for what it says, and
   unlike its family sibling. Now, at Total Balance's 460px:
   · the three tier header (spec 14.1): the label at /45 with the period at /90 on the
     right, the balance at 26px with its cents at /35, then the signed move and its percent
     in the hue. The figure is there at once; nothing rolls in
   · a low 64px sparkline to the right of the figure (under it when the block is narrow),
     with a dashed baseline at the open, the line in the hue of the move
   · the pointed moment reads in the shared ChartCard (time, balance, change from the open),
     never in place of the balance. Arrow keys walk the line when it has focus, Escape
     lets go
   · no odometer, no drag handle, no mask fade, no dead padding
   · the line carries real dollar values, so every figure in the card is derivable. A new
     `values` prop takes them directly; the old 0..1 `series` still works and is mapped
     onto dollars with the formula below
   Every old prop is kept. `period` now sits on the label row, and the change's sign still
   follows `up`.
   Formulas:
   · change = |changeAbs| signed by `up`; open = balance − change
   · from `series` s (0..1, n points, t = i ÷ (n − 1)): value_i = open + change × t + amp ×
     (s_i − s_0 − (s_last − s_0) × t), amp = 1.5 × |change|; it opens at the open and closes
     on the balance exactly
   · pointed change = value − open; percent = that ÷ open × 100
   Motion: the line and its fill wipe in from the left once the block is in view (850ms); a
   new series of the same length morphs point for point (380ms). Reduced motion draws it
   all at once. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

/** deterministic seeded generator (mulberry32), so every render agrees */
const seeded = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** piecewise-linear keyframes of a down day: rally, sharp fall, choppy recovery */
const KEYS: Array<[number, number]> = [
  [0, 0.56], [0.1, 0.63], [0.2, 0.9], [0.28, 0.74], [0.36, 0.82], [0.46, 0.42],
  [0.56, 0.12], [0.64, 0.42], [0.71, 0.2], [0.79, 0.48], [0.88, 0.28], [1, 0.52],
]
const shape = (t: number) => {
  let i = 1
  while (i < KEYS.length - 1 && KEYS[i][0] < t) i++
  const [x0, y0] = KEYS[i - 1]
  const [x1, y1] = KEYS[i]
  return y0 + ((t - x0) / (x1 - x0 || 1)) * (y1 - y0)
}

const DEFAULT_SERIES = (() => {
  const rnd = seeded(7)
  return Array.from({ length: 48 }, (_, i) => {
    const t = i / 47
    return Math.min(1, Math.max(0, shape(t) + (rnd() - 0.5) * 0.16))
  })
})()

/** the plot is drawn in a 100 × 40 box stretched to the band; the stroke keeps its width */
const VB_W = 100
const VB_H = 40
/** the band's height in layout pixels */
const BAND = 64

/** x position 0..1 → intraday clock label (09:30 to 16:00) */
const intradayLabel = (t: number) => {
  const mins = Math.round(570 + t * 390)
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
}

const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0

export type AssetsBalanceCardProps = {
  label?: string
  balance?: string
  changePct?: string
  changeAbs?: string
  /** the window the change covers, on the label row's right */
  period?: string
  /** the change's sign, and with it the hue: green when up, red when down */
  up?: boolean
  /** ambient line values, 0..1 (0 = bottom of the band); mapped onto dollars between the open and the balance */
  series?: number[]
  /** the balance through the period in dollars, oldest first; wins over `series` */
  values?: number[]
  className?: string
}

/**
 * A balance and the day that made it: one large figure with its signed move, and a low
 * line beside it. Pointing at the line reads that moment in a card beside the cursor.
 */
export function AssetsBalanceCard({
  label = "Assets",
  balance = "$54,847.30",
  changePct = "3.24%",
  changeAbs = "-$1,023.95",
  period = "Today",
  up = false,
  series = DEFAULT_SERIES,
  values,
  className = "",
}: AssetsBalanceCardProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const signal = up ? GREEN : RED
  const plotRef = useRef<HTMLDivElement>(null)
  const seen = useInView(plotRef, { once: true, amount: 0.3 })
  const shown = seen || !!reduced
  const [hi, setHi] = useState<number | null>(null)

  const close = num(balance)
  const change = num(changeAbs) * (up ? 1 : -1)
  const open = close - change

  /* real dollar values: given, or mapped from the 0..1 shape (formulas above) */
  const dollars = useMemo(() => {
    if (values && values.length > 1) return values
    const s = series.length > 1 ? series : [0, 0]
    const n = s.length
    const amp = 1.5 * Math.abs(change || close * 0.01)
    return s.map((v, i) => {
      const t = i / (n - 1)
      return open + change * t + amp * (v - s[0] - (s[n - 1] - s[0]) * t)
    })
  }, [values, series, open, change, close])

  const n = dollars.length
  const geo = useMemo(() => {
    const lo = Math.min(...dollars, open)
    const top = Math.max(...dollars, open)
    const y = (v: number) => 4 + (1 - (v - lo) / (top - lo || 1)) * (VB_H - 8)
    const pts = dollars.map((v, i) => ({ x: (i / (n - 1)) * VB_W, y: y(v) }))
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ")
    return { pts, d, area: `${d} L${VB_W} ${VB_H} L0 ${VB_H} Z`, openY: y(open) }
  }, [dollars, n, open])

  const scrubTo = (clientX: number) => {
    const r = plotRef.current?.getBoundingClientRect()
    if (!r || !r.width) return
    setHi(Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1)))))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      const step = e.shiftKey ? 6 : 1
      setHi((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + (e.key === "ArrowLeft" ? -step : step))))
    } else if (e.key === "Escape") setHi(null)
  }

  const [whole, cents] = balance.split(".")
  const sign = up ? "+" : "−"
  const pct = `${sign}${changePct.replace(/^[+−-]/, "")}`
  const abs = `${sign}${changeAbs.replace(/^[+−-]/, "")}`
  const point = hi === null ? null : geo.pts[hi]
  const pointedChange = hi === null ? 0 : dollars[hi] - open
  const t = hi === null ? 1 : hi / (n - 1)

  return (
    <div className={cn("w-[460px] max-w-full tabular-nums", className)} role="group" aria-label={`${label} ${balance}, ${abs} (${pct}) ${period.toLowerCase()}`}>
      {/* the header, three tiers (spec 14.1) */}
      <div className="mb-3 flex items-baseline justify-between text-[12px]">
        <span className="truncate text-foreground/45">{label}</span>
        <span className="shrink-0 pl-3 font-medium text-foreground/90">{period}</span>
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="shrink-0">
          <p className="m-0 text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
            {whole}
            {cents !== undefined && <span className="text-foreground/35">.{cents}</span>}
          </p>
          <p className="mb-0 mt-2 text-[12px] font-medium" style={{ color: signal }}>
            {abs} ({pct})
          </p>
        </div>

        {/* the period's line; under the figure when the block is too narrow for both */}
        <div className="relative min-w-[200px] flex-1 basis-[200px]">
          <div
            ref={plotRef}
            tabIndex={0}
            role="slider"
            aria-label={`${label} through the period`}
            aria-valuemin={0}
            aria-valuemax={n - 1}
            aria-valuenow={hi ?? n - 1}
            aria-valuetext={`${usd(dollars[hi ?? n - 1])} at ${intradayLabel(t)}`}
            onKeyDown={onKey}
            onBlur={() => setHi(null)}
            onPointerMove={(e) => scrubTo(e.clientX)}
            onPointerDown={(e) => scrubTo(e.clientX)}
            onPointerLeave={() => setHi(null)}
            onPointerCancel={() => setHi(null)}
            className="relative cursor-crosshair touch-pan-y rounded-[4px] outline-none focus-visible:bg-foreground/[0.03]"
            style={{ height: BAND, color: signal }}
          >
            <motion.div
              className="h-full"
              initial={reduced ? false : { clipPath: "inset(-10% 100% -10% -2%)" }}
              animate={{ clipPath: shown ? "inset(-10% -2% -10% -2%)" : "inset(-10% 100% -10% -2%)" }}
              transition={reduced ? { duration: 0 } : { duration: 0.85, ease: EASE }}
            >
              <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="block h-full w-full overflow-visible" aria-hidden>
                <defs>
                  <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                  </linearGradient>
                </defs>
                {/* the open, a dashed baseline the move is measured from */}
                <line
                  x1={0}
                  x2={VB_W}
                  y1={geo.openY}
                  y2={geo.openY}
                  stroke="var(--foreground)"
                  strokeOpacity={0.3}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                {/* keyed by length: a same-length series morphs point for point, another length is drawn at once */}
                <motion.path
                  key={`a${n}`}
                  initial={false}
                  animate={{ d: geo.area }}
                  transition={reduced ? { duration: 0 } : { duration: 0.38, ease: EASE }}
                  fill={`url(#${uid}-fill)`}
                />
                <motion.path
                  key={`l${n}`}
                  initial={false}
                  animate={{ d: geo.d }}
                  transition={reduced ? { duration: 0 } : { duration: 0.38, ease: EASE }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ opacity: hi === null ? 1 : 0.45, transition: reduced ? "none" : "opacity 160ms" }}
                />
              </svg>
            </motion.div>
            {/* the crosshair: a rule and a dot on the pointed moment, HTML so they keep their shape */}
            {point && (
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 w-px bg-foreground/[0.18]" style={{ left: `${point.x}%` }} />
                <div
                  className="absolute size-[7px] rounded-full bg-current"
                  style={{ left: `${point.x}%`, top: `${(point.y / VB_H) * 100}%`, transform: "translate(-50%, -50%)", boxShadow: "0 0 0 1.5px var(--background)" }}
                />
              </div>
            )}
          </div>
          {/* the pointed moment, read beside the cursor (chart-overlay.tsx); it flips left past 60% */}
          <ChartCard
            open={hi !== null}
            x={point ? `${point.x}%` : 0}
            y={-8}
            flip={t > 0.6}
            heading={intradayLabel(t)}
            rows={[
              { label: "Balance", value: usd(dollars[hi ?? n - 1]) },
              {
                label: "Change",
                value: `${pointedChange < 0 ? "−" : "+"}${usd(Math.abs(pointedChange))} (${pointedChange < 0 ? "−" : "+"}${Math.abs(open ? (pointedChange / open) * 100 : 0).toFixed(2)}%)`,
                color: pointedChange >= 0 ? GREEN : RED,
              },
            ]}
            width={196}
          />
        </div>
      </div>
    </div>
  )
}
