"use client"

import { useId, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { SURFACE } from "@/components/ui/control-classes"
import { LiveFigure } from "@/components/ui/live-figure"

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
   too); a new series morphs the line and the fill in place
   2026-10-02 audit: per his Stat Tile call each metric sits on its own surface card (7%
   foreground over the background, 12px padding, corner 18: the inner card of the card
   scale, 24 outside = 18 + the 6px gap), 6px apart, 152px each, so the row is 468px, the
   same width as Stat Tile, its family; the preview's zoom hack is gone. The figure swaps
   once as the pointer takes the line and once as it lets go, and moves at once in between
   (LiveFigure), where it replayed the swap on every step. The change is worked out from
   the series and names its window ("since Feb 24") on its own 12px sub line in its hue; a
   hand-written `delta` is still honoured when passed. Label 12px /45.
   Formulas:
   · headline  data[n − 1], or the pointed point's value while scrubbing
   · change    (data[n − 1] ÷ data[0] − 1) × 100 in percent, or data[n − 1] − data[0] in
               points when `diff` is "points" (metrics that are already a percent);
               the caller's `delta` string when one is passed
   · window    from labels[0] to the last point
   2026-10-02 round 2: his notes. The chart runs to the card's edges: no side padding and
   none under it, the card's 18px corner clips it (the plot is the card's full 152px). The
   window on the sub line is just the start date, "Feb 24", where it read "since Feb 24". */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export type KpiItem = {
  label: string
  /** the metric's real series, in its own unit; the last point is the headline */
  data: number[]
  /** formats the headline and the hover readout */
  format?: (v: number) => string
  /** a hand-written signed change, written with + or −; unpassed it is worked out from `data` */
  delta?: string
  /** with `delta`: false marks the change as a loss (red), a gain is green; a worked-out
   *  change takes its colour from its sign */
  up?: boolean
  /** how the worked-out change is measured: a percent of the first point, or a plain difference */
  diff?: "percent" | "points"
}

export interface KpiCardRowProps {
  /** one column per metric */
  items?: KpiItem[]
  /** what each sample point is called, read out while pointing at it */
  labels?: string[]
  className?: string
}

const DEFAULT_ITEMS: KpiItem[] = [
  { label: "Requests", format: (v) => `${v.toFixed(1)}M`, data: [1.6, 1.7, 1.75, 1.9, 2.0, 2.1, 2.15, 2.25, 2.35, 2.4] },
  { label: "Accuracy", format: (v) => `${v.toFixed(1)}%`, diff: "points", data: [96.4, 96.8, 96.6, 97.2, 97.5, 97.8, 98.0, 98.1, 98.3, 98.4] },
  { label: "Uptime", format: (v) => `${v.toFixed(2)}%`, diff: "points", data: [99.98, 99.97, 99.98, 99.96, 99.97, 99.95, 99.94, 99.95, 99.93, 99.92] },
]

const DEFAULT_LABELS = ["Feb 24", "Mar 3", "Mar 10", "Mar 17", "Mar 24", "Mar 31", "Apr 7", "Apr 14", "Apr 21", "Apr 28"]

/** the chart's width: the card's full 152px, edge to edge (round 2) */
const W = 152
const H = 52
const TOP = 6
/** room under the lowest point, so the corner's curve does not cut the line */
const BOT = 8

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
  /* the change: the caller's string when given, else worked out from the series */
  const points = item.diff === "points"
  const worked = points ? data[last] - data[0] : data[0] ? (data[last] / data[0] - 1) * 100 : 0
  const delta = item.delta ?? `${worked >= 0 ? "+" : "−"}${Math.abs(worked).toFixed(points ? 2 : 1)}${points ? " pt" : "%"}`
  const hue = (item.delta ? item.up !== false : worked >= 0) ? GREEN : RED
  /** the window, just its start date (round 2: "since" made it too long) */
  const since = labels[0] ?? ""

  return (
    /* corner 18: the inner card of the card scale (24 outside = 18 + the 6px gap) */
    <div ref={rootRef} className={cn("w-[152px] shrink-0 overflow-hidden rounded-[18px] p-3", SURFACE)}>
      <div className="text-[12px] text-foreground/45">{item.label}</div>
      <div role="status" className="mt-2">
        {/* the figure swaps once as the line is taken and once as it is let go (4px, 2px
            blur, 150ms); along the line it moves at once */}
        <LiveFigure intent={hi === null ? null : "scrub"} className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
          {format(data[shown])}
        </LiveFigure>
        <div className="mt-2 flex h-[15px] items-baseline gap-1.5 truncate text-[12px] leading-[15px]">
          {hi === null ? (
            <>
              <span className="font-medium" style={{ color: hue }}>
                {delta}
              </span>
              <span className="text-foreground/45">{since}</span>
            </>
          ) : (
            <span className="text-foreground/45">{labels[hi] ?? ""}</span>
          )}
        </div>
      </div>

      <div ref={boxRef} className="relative -mx-3 -mb-3 mt-3" onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full overflow-visible"
          fill="none"
          role="img"
          aria-label={`${item.label}, ${format(data[last])} now, ${delta}${since ? ` since ${since}` : ""}`}
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
 * A row of metric cards: the value, its signed change and the line it came from. Pointing
 * at a line reads any point in place of the headline, with its date.
 */
export function KpiCardRow({ items = DEFAULT_ITEMS, labels = DEFAULT_LABELS, className }: KpiCardRowProps) {
  return (
    <div className={cn("flex w-[468px] max-w-full flex-wrap items-start gap-1.5 tabular-nums", className)}>
      {items.map((item, i) => (
        <Kpi key={item.label} item={item} labels={labels} index={i} />
      ))}
    </div>
  )
}
