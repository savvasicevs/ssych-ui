"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Historical EPS, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the forecast bar is a solid fill, not a dashed blue outline; forecast (--chart-1) and
     reported (--chart-5) each keep a colour so the pair tells apart (2026-09-30), and green
     and red stay for the surprise and the growth
   · the floating card with its outline and shadow is gone: pointing at a quarter puts its
     forecast, reported and surprise where the growth figures are, as plain text
   · the whole column answers the pointer, not only the two thin bars
   · growth figures carry + or − with a true minus, the axis too
   · every figure is tabular, the chart names itself to a screen reader */

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
const PAD = { l: 8, r: 36, t: 14, b: 24 }
const BAR_W = 11

/** "+0.42" or "−0.42", always signed, with the typographic minus */
const signed = (v: number, dp: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}`
/** "0.42" or "−0.42": a level, so only the minus is written */
const level = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`

/**
 * Forecast against reported, quarter by quarter: two bars in two colours, standing on a
 * shared zero line. Pointing at a quarter dims the
 * others and reads its forecast, reported and surprise in place of the growth figures.
 * Growth and surprise derive from the data.
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

  return (
    <div className={cn("w-full max-w-[620px] tabular-nums", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <span className="text-[13px] font-medium text-foreground/90">{title}</span>
          <span aria-hidden className="flex items-center gap-3 text-[10px] text-foreground/45">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: FORECAST }} />
              Forecast
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: REPORTED }} />
              Reported
            </span>
          </span>
        </div>

        {/* the readout crosses over when the quarter changes (4px, 2px blur, 150ms) */}
        <motion.div
          key={hot ?? "rest"}
          role="status"
          className="flex items-baseline gap-3 whitespace-nowrap text-[10px] text-foreground/45"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          {q ? (
            <>
              <span className="font-medium text-foreground/90">{q.label}</span>
              <span>
                Forecast <span className="font-medium" style={{ color: FORECAST }}>{level(q.forecast)}</span>
              </span>
              <span>
                Reported <span className="font-medium" style={{ color: REPORTED }}>{level(q.reported)}</span>
              </span>
              <span>
                Surprise{" "}
                <span className="font-medium" style={{ color: hue(q.reported - q.forecast) }}>
                  {signed(surprise(q) * 100, 1)}%
                </span>
              </span>
            </>
          ) : (
            <>
              {yoy !== null && (
                <span>
                  Growth YoY{" "}
                  <span className="font-medium" style={{ color: hue(yoy) }}>
                    {signed(yoy, 0)}%
                  </span>
                </span>
              )}
              {qoq !== null && (
                <span>
                  QoQ{" "}
                  <span className="font-medium" style={{ color: hue(qoq) }}>
                    {signed(qoq, 0)}%
                  </span>
                </span>
              )}
            </>
          )}
        </motion.div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 block w-full"
        role="img"
        aria-label={
          last
            ? `${title}, ${data.length} quarters. ${last.label}: reported ${level(last.reported)} against a forecast of ${level(last.forecast)}`
            : title
        }
        onPointerLeave={() => setHot(null)}
      >
        {[max * 0.98, max * 0.49, 0].map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              y1={y(v)}
              x2={W - PAD.r}
              y2={y(v)}
              stroke="var(--foreground)"
              strokeOpacity={0.05}
              strokeWidth={1}
              strokeDasharray={v === 0 ? undefined : "2 4"}
            />
            <text x={W - PAD.r + 8} y={y(v) + 3} fontSize={9} fill="var(--foreground)" fillOpacity={0.35}>
              {level(v)}
            </text>
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
                {/* each bar grows out of the zero line once on mount, 30ms apart per quarter */}
                <motion.rect
                  x={cx - BAR_W - 2} y={fTop} width={BAR_W} height={Math.max(2, fH)} rx={2} fill={FORECAST}
                  style={{ originY: d.forecast >= 0 ? 1 : 0 }}
                  initial={reduced ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: i * 0.03 }}
                />
                <motion.rect
                  x={cx + 2} y={rTop} width={BAR_W} height={Math.max(2, rH)} rx={2} fill={REPORTED}
                  style={{ originY: d.reported >= 0 ? 1 : 0 }}
                  initial={reduced ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: i * 0.03 + 0.015 }}
                />
              </g>
              <text
                x={cx}
                y={H - 6}
                textAnchor="middle"
                fontSize={9}
                fill="var(--foreground)"
                fillOpacity={hot === i ? 0.9 : 0.35}
                style={{ transition: reduced ? "none" : "fill-opacity 160ms ease-out" }}
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
