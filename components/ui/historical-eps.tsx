"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const FORECAST = "var(--chart-1)"
const RED = "var(--chart-down)"
const GREEN = "var(--chart-up)"

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
const PAD = { l: 8, r: 36, t: 34, b: 24 }

/**
 * Forecast-vs-reported quarterly bars in the Ink register: dashed bars are
 * forecasts, solid bars are reported, a "Beat by" tip points at the biggest
 * positive surprise, and hovering opens a tooltip with the surprise line.
 * Growth figures derive from the data.
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
  const colW = (W - PAD.l - PAD.r) / data.length
  const barW = 11

  const max = Math.max(...data.flatMap((q) => [q.forecast, q.reported]), 0.1) * 1.1
  const min = Math.min(...data.flatMap((q) => [q.forecast, q.reported]), 0) * 1.4
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b)
  const zero = y(0)

  const surprise = (q: EpsQuarter) => (q.reported - q.forecast) / Math.max(0.01, Math.abs(q.forecast))

  // growth vs 4 quarters back (YoY) and the previous quarter (QoQ)
  const last = data[data.length - 1]
  const yoyBase = data[data.length - 5]
  const qoqBase = data[data.length - 2]
  const pct = (now: number, base?: number) =>
    base === undefined || base === 0 ? null : Math.round(((now - base) / Math.abs(base)) * 100)
  const yoy = pct(last.reported, yoyBase?.reported)
  const qoq = pct(last.reported, qoqBase?.reported)

  return (
    <div className={cn("w-full max-w-[620px]", className)}>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[13px] font-medium text-foreground/85">{title}</span>
          <span className="ml-4 inline-flex items-center gap-3 text-[10px] text-foreground/40">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full border" style={{ borderColor: FORECAST }} /> Forecast
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" /> Reported
            </span>
          </span>
        </div>
        <span className="text-[10px] text-foreground/40">
          {yoy !== null && (
            <>
              Growth YoY: <span style={{ color: yoy >= 0 ? GREEN : RED }}>{yoy}%</span>
            </>
          )}
          {yoy !== null && qoq !== null && <span className="mx-2 text-foreground/20">·</span>}
          {qoq !== null && (
            <>
              QoQ: <span style={{ color: qoq >= 0 ? GREEN : RED }}>{qoq}%</span>
            </>
          )}
        </span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block w-full text-foreground" onMouseLeave={() => setHot(null)}>
          {[max * 0.98, max * 0.49, 0].map((v) => (
            <g key={v}>
              <line
                x1={PAD.l}
                y1={y(v)}
                x2={W - PAD.r}
                y2={y(v)}
                stroke="currentColor" strokeOpacity={0.05}
                strokeDasharray={v === 0 ? undefined : "2 4"}
              />
              <text x={W - PAD.r + 8} y={y(v) + 3} fontSize={9} fill="currentColor" fillOpacity={0.3}>
                {v.toFixed(2)}
              </text>
            </g>
          ))}

          {data.map((q, i) => {
            const cx = PAD.l + i * colW + colW / 2
            const dim = hot !== null && hot !== i
            const fTop = Math.min(y(q.forecast), zero)
            const fH = Math.abs(y(q.forecast) - zero)
            const rTop = Math.min(y(q.reported), zero)
            const rH = Math.abs(y(q.reported) - zero)
            return (
              <motion.g
                key={q.label}
                onMouseEnter={() => setHot(i)}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: dim ? 0.3 : 1 }}
                transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: i * 0.04 }}
              >
                <rect
                  x={cx - barW - 2}
                  y={fTop}
                  width={barW}
                  height={Math.max(2, fH)}
                  rx={2.5}
                  fill="color-mix(in srgb, var(--chart-1) 7%, transparent)"
                  stroke={FORECAST}
                  strokeOpacity={0.35}
                  strokeWidth={1}
                  strokeDasharray="3 2.5"
                />
                <rect
                  x={cx + 2}
                  y={rTop}
                  width={barW}
                  height={Math.max(2, rH)}
                  rx={2.5}
                  fill="currentColor"
                  fillOpacity={dim ? 0.35 : 0.78}
                />
                <text
                  x={cx}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill="currentColor"
                  fillOpacity={hot === i ? 0.75 : 0.3}
                >
                  {q.label}
                </text>
              </motion.g>
            )
          })}
        </svg>

        {hot !== null && (
          <div
            className="pointer-events-none absolute z-10 w-[150px] rounded-lg border border-foreground/[0.05] p-2.5"
            style={{
              background: "var(--card)",
              boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 6%, transparent), 0 12px 32px rgba(0,0,0,0.5)",
              // sit BESIDE the hovered column (right of it in the left half, left of it
              // in the right half) so the tooltip never covers the bar you're reading
              left: `${((hot < data.length / 2
                ? Math.min(W - 152, PAD.l + hot * colW + colW / 2 + 16)
                : Math.max(2, PAD.l + hot * colW + colW / 2 - 166)) / W) * 100}%`,
              top: 8,
            }}
          >
            <div className="text-[9px] text-foreground/35">{data[hot].label} · after close</div>
            <div className="mt-1.5 flex justify-between text-[10px]">
              <span className="text-foreground/50">Forecast</span>
              <span className="tabular-nums text-foreground/80">{data[hot].forecast.toFixed(2)}</span>
            </div>
            <div className="mt-1 flex justify-between text-[10px]">
              <span className="text-foreground/50">Reported</span>
              <span className="tabular-nums text-foreground/80">{data[hot].reported.toFixed(2)}</span>
            </div>
            <div className="mt-1.5 flex justify-between border-t border-foreground/[0.04] pt-1.5 text-[10px]">
              <span className="text-foreground/50">Surprise</span>
              <span className="tabular-nums" style={{ color: data[hot].reported >= data[hot].forecast ? GREEN : RED }}>
                {data[hot].reported >= data[hot].forecast ? "+" : "−"}
                {Math.abs(surprise(data[hot]) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
