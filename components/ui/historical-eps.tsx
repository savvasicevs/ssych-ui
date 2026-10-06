"use client"

import { useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { ChartCard } from "@/components/ui/chart-overlay"

/* Historical EPS, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the forecast bar is a solid fill, not a dashed blue outline; forecast (--chart-1) and
     reported (--chart-5) each keep a colour so the pair tells apart (2026-09-30), and green
     and red stay for the surprise and the growth
   · the floating card with its outline and shadow is gone: pointing at a quarter puts its
     forecast, reported and surprise where the growth figures are, as plain text
   · the whole column answers the pointer, not only the two thin bars
   · growth figures carry + or − with a true minus, the axis too
   · every figure is tabular, the chart names itself to a screen reader
   Motion (2026-10-01): the bars grow out of the zero line once the chart is in view (it
   played on mount, off screen too), 30ms apart per quarter, all landed by 0.7s; new data
   tweens every bar's top and height and glides the gridlines with their figures
   2026-10-02 audit: the chart has no one figure to read first, so the visible title went
   (the `title` prop still names it in the aria-label) and the legend leads the label row:
   a 6px round dot per series and the name at 11px /60, where square chips were. The
   growth line at rest went too; YoY and QoQ live in the aria-label. Pointing a quarter now
   reads it in a card over its column (chart-overlay.tsx): Forecast, Reported, and the
   Surprise in its hue. The chart is a fixed 560 wide and drawn 1:1, so the 9px axis no
   longer scales up; gridlines are solid at 5%, the axis states its unit ("$0.42") at /45,
   and the arrow keys walk the quarters (Escape lets go).
   Formulas:
   · surprise = (reported − forecast) ÷ |forecast| × 100, the forecast floored at 0.01
   · YoY      = (reported now − reported four quarters back) ÷ |that| × 100, rounded
   · QoQ      = (reported now − reported a quarter back) ÷ |that| × 100, rounded
   · axis     = the top at 98% and the middle at 49% of the largest value × 1.1, and zero */

const EASE = [0.16, 1, 0.3, 1] as const
const RED = "var(--chart-down)"
const GREEN = "var(--chart-up)"
/* forecast and reported are two series the reader tells apart bar against bar, so each has
   its own colour (the first two of the categorical order), and it follows into the legend
   and the readout; green and red stay for the surprise and the growth */
const FORECAST = "var(--chart-1)"
const REPORTED = "var(--chart-5)"

export interface EpsQuarter {
  label: string
  forecast: number
  reported: number
}

const DEFAULT_DATA: EpsQuarter[] = [
  { label: "Q1 23", forecast: 0.42, reported: 0.31 },
  { label: "Q2 23", forecast: 0.18, reported: 0.66 },
  { label: "Q3 23", forecast: 0.55, reported: 0.47 },
  { label: "Q4 23", forecast: 0.09, reported: -0.22 },
  { label: "Q1 24", forecast: -0.12, reported: 0.06 },
  { label: "Q2 24", forecast: 0.71, reported: 0.94 },
  { label: "Q3 24", forecast: 0.28, reported: 0.19 },
  { label: "Q4 24", forecast: 0.44, reported: 1.02 },
  { label: "Q1 25", forecast: 0.83, reported: 0.58 },
]

const W = 560
const H = 190
const PAD = { l: 8, r: 40, t: 14, b: 24 }
const BAR_W = 11

/** "+0.42" or "−0.42", always signed, with the typographic minus */
const signed = (v: number, dp: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}`
/** "$0.42" or "−$0.42": a level, so only the minus is written */
const level = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`

/**
 * Forecast against reported, quarter by quarter: two bars in two colours, standing on a
 * shared zero line. Pointing at a quarter dims the others and reads its forecast, reported
 * and surprise in a card over its column. Growth and surprise derive from the data.
 */
export function HistoricalEps({
  data = DEFAULT_DATA,
  title = "Historical EPS",
  className,
}: {
  data?: EpsQuarter[]
  title?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<number | null>(null)
  /* the entrance plays once, when a third of the chart is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const play = !!reduced || seen
  /** a change of data glides between the two states */
  const morph = reduced ? { duration: 0 } : { duration: 0.35, ease: EASE }
  const colW = (W - PAD.l - PAD.r) / Math.max(1, data.length)

  const max = Math.max(...data.flatMap((q) => [q.forecast, q.reported]), 0.1) * 1.1
  const min = Math.min(...data.flatMap((q) => [q.forecast, q.reported]), 0) * 1.4
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b)
  const zero = y(0)

  /** (reported − forecast) ÷ |forecast| */
  const surprise = (q: EpsQuarter) => (q.reported - q.forecast) / Math.max(0.01, Math.abs(q.forecast))

  // growth vs 4 quarters back (YoY) and the previous quarter (QoQ)
  const last = data[data.length - 1]
  const yoyBase = data[data.length - 5]
  const qoqBase = data[data.length - 2]
  const pct = (now?: number, base?: number) =>
    now === undefined || base === undefined || base === 0 ? null : Math.round(((now - base) / Math.abs(base)) * 100)
  const yoy = pct(last?.reported, yoyBase?.reported)
  const qoq = pct(last?.reported, qoqBase?.reported)

  const q = hot !== null ? data[hot] : null
  const hue = (v: number) => (v >= 0 ? GREEN : RED)
  /* the card sits beside the pointed column, on its left once past 60% of the plot */
  const flip = hot !== null && (hot + 0.5) / Math.max(1, data.length) > 0.6
  const cardX = hot !== null ? PAD.l + hot * colW + colW / 2 + (flip ? -BAR_W - 6 : BAR_W + 6) : 0
  const growth = [yoy !== null ? `growth ${signed(yoy, 0)}% year on year` : "", qoq !== null ? `${signed(qoq, 0)}% on the quarter` : ""]
    .filter(Boolean)
    .join(", ")

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setHot(null)
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || !data.length) return
    e.preventDefault()
    const at = hot ?? (e.key === "ArrowLeft" ? data.length : -1)
    setHot(Math.max(0, Math.min(data.length - 1, at + (e.key === "ArrowRight" ? 1 : -1))))
  }

  return (
    <div ref={rootRef} className={cn("w-[560px] max-w-full tabular-nums", className)}>
      {/* no title: the legend leads the label row (spec 14.1, 14.3), the name is in the aria-label */}
      <div aria-hidden className="mb-3 flex items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: FORECAST }} />
          <span className="text-foreground/60">Forecast</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: REPORTED }} />
          <span className="text-foreground/60">Reported</span>
        </span>
      </div>

      <div
        role="group"
        tabIndex={0}
        aria-label={`${title} by quarter. Arrow keys walk the quarters`}
        onKeyDown={onKey}
        onBlur={() => setHot(null)}
        className="relative rounded-[4px] outline-none focus-visible:bg-foreground/[0.03]"
      >
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto max-w-full"
        role="img"
        aria-label={
          last
            ? `${title}, ${data.length} quarters. ${last.label}: reported ${level(last.reported)} against a forecast of ${level(last.forecast)}${growth ? `, ${growth}` : ""}`
            : title
        }
        onPointerLeave={() => setHot(null)}
      >
        {(
          [
            ["top", max * 0.98],
            ["mid", max * 0.49],
            ["zero", 0],
          ] as const
        ).map(([place, v]) => (
          /* keyed by place, not value, so new data glides each line and its figure */
          <g key={place}>
            <motion.line
              x1={PAD.l}
              x2={W - PAD.r}
              stroke="var(--foreground)"
              strokeOpacity={0.05}
              strokeWidth={1}
              initial={false}
              animate={{ y1: y(v), y2: y(v) }}
              transition={morph}
            />
            <motion.text
              x={W - PAD.r + 8}
              fontSize={9}
              fill="var(--foreground)"
              fillOpacity={0.45}
              initial={false}
              animate={{ attrY: y(v) + 3 }}
              transition={morph}
            >
              {level(v)}
            </motion.text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = PAD.l + i * colW + colW / 2
          const dim = hot !== null && hot !== i
          const fTop = Math.min(y(d.forecast), zero)
          const fH = Math.abs(y(d.forecast) - zero)
          const rTop = Math.min(y(d.reported), zero)
          const rH = Math.abs(y(d.reported) - zero)
          return (
            <g key={d.label} onPointerEnter={() => setHot(i)}>
              {/* the whole column is the target, so the pointer never falls between two bars */}
              <rect x={cx - colW / 2} y={0} width={colW} height={H} fill="transparent" />
              <g style={{ opacity: dim ? 0.35 : 1, transition: "opacity 160ms ease-out" }}>
                {/* each bar grows out of the zero line once in view, 30ms apart per quarter;
                    new data tweens its top and height */}
                <motion.rect
                  x={cx - BAR_W - 2} width={BAR_W} rx={2} fill={FORECAST}
                  style={{ originY: d.forecast >= 0 ? 1 : 0 }}
                  initial={reduced ? false : { scaleY: 0, attrY: fTop, height: Math.max(2, fH) }}
                  animate={{ scaleY: play ? 1 : 0, attrY: fTop, height: Math.max(2, fH) }}
                  transition={reduced ? { duration: 0 } : { scaleY: { duration: 0.4, ease: EASE, delay: i * 0.03 }, default: morph }}
                />
                <motion.rect
                  x={cx + 2} width={BAR_W} rx={2} fill={REPORTED}
                  style={{ originY: d.reported >= 0 ? 1 : 0 }}
                  initial={reduced ? false : { scaleY: 0, attrY: rTop, height: Math.max(2, rH) }}
                  animate={{ scaleY: play ? 1 : 0, attrY: rTop, height: Math.max(2, rH) }}
                  transition={reduced ? { duration: 0 } : { scaleY: { duration: 0.4, ease: EASE, delay: i * 0.03 + 0.015 }, default: morph }}
                />
              </g>
              <text
                x={cx}
                y={H - 6}
                textAnchor="middle"
                fontSize={9}
                fill="var(--foreground)"
                fillOpacity={hot === i ? 0.9 : 0.45}
                style={{ transition: reduced ? "none" : "fill-opacity 160ms ease-out" }}
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* the pointed quarter, read in a card over its column (chart-overlay.tsx) */}
      <ChartCard
        open={q !== null}
        x={`${(cardX / W) * 100}%`}
        flip={flip}
        width={140}
        heading={q?.label ?? ""}
        rows={
          q
            ? [
                { label: "Forecast", value: level(q.forecast) },
                { label: "Reported", value: level(q.reported) },
                { label: "Surprise", value: `${signed(surprise(q) * 100, 1)}%`, color: hue(q.reported - q.forecast) },
              ]
            : []
        }
      />
      </div>
    </div>
  )
}
