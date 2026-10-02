"use client"

import { useId, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* KPI Card Row, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card, outline or inner shadow around each metric: three columns on the page
   · the line is ink; only the change carries colour, green for a gain and red for a loss
     (it was blue, green and amber by position)
   · the value no longer counts up: the number is there to be read at once, and the count
     re-rendered the card sixty times a second
   · pointing at the line puts that point's value and date where the headline is, as plain
     text, so nothing floats over the chart
   · each chart names itself to a screen reader
   Motion (2026-10-01): once a column is in view its line and fill sweep in left to right
   through one clip, 50ms apart per column, landed by 0.9s (they drew on mount, off screen
   too); a new series morphs the line and the fill in place */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export type KpiItem = {
  label: string
  /** the metric's real series, in its own unit; the last point is the headline */
  data: number[]
  /** formats the headline and the hover readout */
  format?: (v: number) => string
  /** signed change beside the headline, written with + or − */
  delta?: string
  /** false marks the change as a loss (red); a gain is green */
  up?: boolean
}

export interface KpiCardRowProps {
  /** one column per metric */
  items?: KpiItem[]
  /** what each sample point is called, read out while pointing at it */
  labels?: string[]
  className?: string
}

const DEFAULT_ITEMS: KpiItem[] = [
  { label: "Requests", format: (v) => `${v.toFixed(1)}M`, delta: "+18.2%", up: true, data: [1.6, 1.7, 1.75, 1.9, 2.0, 2.1, 2.15, 2.25, 2.35, 2.4] },
  { label: "Accuracy", format: (v) => `${v.toFixed(1)}%`, delta: "+0.8%", up: true, data: [96.4, 96.8, 96.6, 97.2, 97.5, 97.8, 98.0, 98.1, 98.3, 98.4] },
  { label: "Uptime", format: (v) => `${v.toFixed(2)}%`, delta: "−0.06%", up: false, data: [99.98, 99.97, 99.98, 99.96, 99.97, 99.95, 99.94, 99.95, 99.93, 99.92] },
]

const DEFAULT_LABELS = ["Feb 24", "Mar 3", "Mar 10", "Mar 17", "Mar 24", "Mar 31", "Apr 7", "Apr 14", "Apr 21", "Apr 28"]

const W = 186
const H = 64
const TOP = 6
const BOT = 4

const fallbackFormat = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1))

function Kpi({ item, labels, index }: { item: KpiItem; labels: string[]; index: number }) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const boxRef = useRef<HTMLDivElement>(null)
  const [hi, setHi] = useState<number | null>(null)
  /* the entrance plays once, when a third of the column is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const play = !!reduced || seen
  /** a change of data glides between the two states */
  const morph = reduced ? { duration: 0 } : { duration: 0.35, ease: EASE }

  const data = item.data.length ? item.data : [0]
  const format = item.format ?? fallbackFormat
  const last = data.length - 1
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = Math.max(1e-6, max - min)
  const x = (i: number) => (i / Math.max(1, last)) * W
  const y = (v: number) => TOP + (1 - (v - min) / span) * (H - TOP - BOT)
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ")
  const area = `${line} L ${W} ${H} L 0 ${H} Z`

  const onMove = (e: React.PointerEvent) => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setHi(Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / r.width) * last))))
  }

  const shown = hi ?? last
  const hue = item.up === false ? RED : GREEN

  return (
    <div ref={rootRef} className="w-[160px]">
      <div className="text-[11.5px] font-medium text-foreground/45">{item.label}</div>
      <div role="status" className="mt-1.5 flex items-baseline gap-2">
        {/* the figure swaps in place as the pointer moves: a 4px rise through a 2px blur */}
        <motion.span
          key={shown}
          className="inline-block text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          {format(data[shown])}
        </motion.span>
        {hi === null
          ? item.delta && (
              <span className="text-[10px] font-medium" style={{ color: hue }}>
                {item.delta}
              </span>
            )
          : labels[hi] && <span className="text-[10px] text-foreground/45">{labels[hi]}</span>}
      </div>

      <div ref={boxRef} className="relative mt-3" onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full overflow-visible"
          fill="none"
          role="img"
          aria-label={`${item.label}, ${format(data[last])} now${item.delta ? `, ${item.delta}` : ""}`}
        >
          <defs>
            <linearGradient id={`kpi-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
            </linearGradient>
            {/* the line and its fill sweep in left to right, a few px wider than the plot for the round caps */}
            <clipPath id={`kpi-reveal-${uid}`}>
              <motion.rect
                x={-4}
                y={-4}
                height={H + 8}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: play ? W + 8 : 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.8, ease: EASE, delay: index * 0.05 }}
              />
            </clipPath>
          </defs>
          <g clipPath={`url(#kpi-reveal-${uid})`}>
            <motion.path fill={`url(#kpi-${uid})`} initial={false} animate={{ d: area }} transition={morph} />
            <motion.path
              stroke="var(--foreground)"
              strokeOpacity={0.9}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ d: line }}
              transition={morph}
            />
          </g>
          {hi !== null && (
            <g pointerEvents="none">
              <line x1={x(hi)} y1={0} x2={x(hi)} y2={H} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth="1" />
              <circle cx={x(hi)} cy={y(data[hi])} r="2.5" fill="var(--foreground)" />
            </g>
          )}
        </svg>
      </div>
    </div>
  )
}

/**
 * A row of metrics: the value, its signed change and the line it came from. Pointing at a
 * line reads any point in place of the headline, with its date.
 */
export function KpiCardRow({ items = DEFAULT_ITEMS, labels = DEFAULT_LABELS, className }: KpiCardRowProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-center gap-x-7 gap-y-8 tabular-nums", className)}>
      {items.map((item, i) => (
        <Kpi key={item.label} item={item} labels={labels} index={i} />
      ))}
    </div>
  )
}
