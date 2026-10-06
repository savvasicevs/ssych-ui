"use client"

import { useState } from "react"
import type { KeyboardEvent, PointerEvent } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { SURFACE } from "@/components/ui/control-classes"
import { LiveFigure } from "@/components/ui/live-figure"

/* Stat Tile, new through ssych-component (2026-09-29).
   What it is for: one metric in the least room it can take: label, value, signed change and,
   when there is a series, a tiny line. 152px a tile, three in a row by default.
   Read first: the value. The change under it is the only colour.
   The pointer: pointing at a tile (or tabbing to it) dims the others. Moving across a tile
   that has a line reads that point: the value swaps to it and the change gives way to the
   point's label. Arrow keys walk the points.
   Sketch: lab/StatTile. Kept label, value, signed change and the optional line under them.
   The card, the count-up, the delta pill with its arrow, the info icon, the capacity meter
   and the full-bleed filled chart are gone.
   Against ui/kpi-card-row: this is the compact form at the same width, a 17px value
   against 22 and a 20px line with no area fill against a 48px filled chart.
   2026-10-02 audit: his call, each tile now sits in a box with the background: the surface
   step (7% foreground over the background), 12px padding, corner 18 (the inner card of the
   card scale: 24 outside, 18 inside at a 6px gap), tiles 6px apart. Tiles are 152px, so the
   row is 468px, the same width as KPI Card Row, its family. The value no longer replays its
   swap on every scrub step: it swaps once as the pointer (or the arrow keys) takes the line
   and once as it lets go, and moves at once in between (LiveFigure). Label 12px /45, the
   change 11px font-medium in its hue.
   Formulas:
   · value  = data[n − 1] when a series is given, else `value`
   · change = (data[n − 1] / data[0] − 1) × 100 in percent, or data[n − 1] − data[0] in
              points when `diff` is "points" (for metrics that are already a percent);
              with no series it is the `change` given
   2026-10-02 round 2: his note, the chart fills its container. The line runs the tile's
   full 152px, edge to edge, and sits on the tile's bottom edge with no padding under it (the
   18px corner clips it; the lowest point keeps 7px of room so the curve never cuts it). The
   focus ring sits on the tile's own edge, inset, in ink. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export interface StatTileItem {
  label: string
  /** the metric's series, oldest first; the last point is the value shown */
  data?: number[]
  /** the value when there is no series */
  value?: number
  /** the change when there is no series, in the unit `diff` names */
  change?: number
  /** how the change is measured: a percent of the first point, or a plain difference */
  diff?: "percent" | "points"
  format?: (v: number) => string
}

export interface StatTileProps {
  /** one tile per metric */
  items?: StatTileItem[]
  /** what each sample point is called, read out while pointing at it */
  labels?: string[]
  className?: string
}

const DEFAULT_ITEMS: StatTileItem[] = [
  { label: "Net P&L", format: (v) => `$${Math.round(v).toLocaleString("en-US")}`, data: [11510, 11620, 11480, 11760, 11900, 11840, 12120, 12260, 12310, 12480] },
  { label: "Win rate", format: (v) => `${v.toFixed(1)}%`, diff: "points", data: [56.1, 56.4, 56.0, 56.9, 57.2, 57.0, 57.6, 57.9, 58.1, 58.3] },
  { label: "Sharpe ratio", format: (v) => v.toFixed(2), data: [2.08, 2.05, 2.1, 2.04, 2.0, 2.02, 1.97, 1.95, 1.94, 1.92] },
]

const DEFAULT_LABELS = ["Feb 24", "Mar 3", "Mar 10", "Mar 17", "Mar 24", "Mar 31", "Apr 7", "Apr 14", "Apr 21", "Apr 28"]

/** the line's width: the tile's full 152px, edge to edge (round 2) */
const W = 152
const H = 30
/** room above the highest point */
const TOP = 3
/** room under the lowest point, so the corner's curve does not cut the line */
const BOT = 7

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const fallbackFormat = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2))

function Tile({
  item,
  labels,
  index,
  dim,
  onHot,
}: {
  item: StatTileItem
  labels: string[]
  index: number
  dim: boolean
  onHot: (on: boolean) => void
}) {
  const reduced = useReducedMotion()
  const [hi, setHi] = useState<number | null>(null)

  const data = item.data && item.data.length ? item.data : null
  const format = item.format ?? fallbackFormat
  const last = data ? data.length - 1 : 0
  const now = data ? data[last] : (item.value ?? 0)
  const points = item.diff === "points"
  const change = data ? (points ? data[last] - data[0] : data[0] ? (data[last] / data[0] - 1) * 100 : 0) : item.change
  const signed = change == null ? "" : `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(points ? 1 : 2)}${points ? " pt" : "%"}`

  const max = data ? Math.max(...data) : 1
  const min = data ? Math.min(...data) : 0
  const span = Math.max(1e-6, max - min)
  const x = (i: number) => (i / Math.max(1, last)) * W
  const y = (v: number) => TOP + (1 - (v - min) / span) * (H - TOP - BOT)
  const line = data ? data.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ") : ""

  const shown = hi ?? last
  const value = data ? data[shown] : now

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!data) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHi(clamp(Math.round((px / W) * last), 0, last))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!data) return
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0
    if (step) {
      e.preventDefault()
      setHi(clamp((hi ?? last) + step, 0, last))
    } else if (e.key === "Escape") setHi(null)
  }
  const leave = () => {
    setHi(null)
    onHot(false)
  }

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`${item.label}, ${format(now)}${signed ? `, ${signed}` : ""}`}
      onPointerEnter={() => onHot(true)}
      onPointerMove={onMove}
      onPointerLeave={leave}
      onFocus={() => onHot(true)}
      onBlur={leave}
      onKeyDown={onKey}
      /* corner 18: the inner card of the card scale (24 outside = 18 + the 6px gap) */
      className={cn(
        "w-[152px] shrink-0 touch-none overflow-hidden rounded-[18px] p-3 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground/20",
        SURFACE,
        data && "cursor-crosshair",
        !reduced && "transition-opacity duration-200",
      )}
      style={{ opacity: dim ? 0.45 : 1 }}
    >
      <div className="truncate text-[12px] text-foreground/45">{item.label}</div>
      <div role="status" className="mt-1.5">
        {/* the value swaps once as the line is taken and once as it is let go (4px, 2px blur,
            150ms); along the line it moves at once */}
        <LiveFigure intent={hi === null ? null : "scrub"} className="truncate text-[17px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
          {format(value)}
        </LiveFigure>
        <div className="mt-1.5 h-[14px] truncate text-[11px] leading-[14px]">
          {hi !== null ? (
            <span className="text-foreground/45">{labels[hi] ?? ""}</span>
          ) : signed ? (
            <span className="font-medium" style={{ color: (change ?? 0) >= 0 ? GREEN : RED }}>
              {signed}
            </span>
          ) : null}
        </div>
      </div>

      {data && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="-mx-3 -mb-3 mt-2 block max-w-none"
          fill="none"
          role="img"
          aria-label={`${item.label} over ${data.length} points, from ${format(data[0])} to ${format(data[last])}`}
        >
          <motion.path
            d={line}
            stroke="var(--foreground)"
            strokeOpacity={0.9}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: index * 0.035 }}
          />
          {hi !== null && <circle cx={x(hi)} cy={y(data[hi])} r={2.2} fill="var(--foreground)" pointerEvents="none" />}
        </svg>
      )}
    </div>
  )
}

/**
 * Compact metrics in a row: label, value, signed change and a tiny ink line, each on its
 * own surface, 152px each.
 * Pointing at a tile dims the others; moving across it reads any point of its line in
 * place of the value, with the point's label.
 */
export function StatTile({ items = DEFAULT_ITEMS, labels = DEFAULT_LABELS, className }: StatTileProps) {
  const [hot, setHot] = useState<number | null>(null)
  return (
    <div className={cn("flex w-[468px] max-w-full flex-wrap items-start gap-1.5 tabular-nums", className)}>
      {items.map((item, i) => (
        <Tile
          key={item.label}
          item={item}
          labels={labels}
          index={i}
          dim={hot !== null && hot !== i}
          onHot={(on) => setHot((h) => (on ? i : h === i ? null : h))}
        />
      ))}
    </div>
  )
}
