"use client"

import { useId, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { THUMB } from "@/components/ui/control-classes"
import { LiveFigure } from "@/components/ui/live-figure"
import { cn } from "@/lib/utils"

/* Donut Chart, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the ring is one ink at several strengths, strongest for the largest slice, not a hue
     per coin. The slice being pointed at (or picked) takes the accent, on the ring and in
     the list. Same decision as the Sectors Donut rebuild
   · arcs are filled shapes, 9px deep, not 9px strokes that grow to 12px
   · the centre figure is 13px, so the component has no large size at all
   · reduced motion is honoured, the ring fades in once on mount
   · every figure is tabular, the centre is a status readout, the chart says its total
   Props: `color` on a datum is now optional and is no longer drawn. Callers that pass it
   keep compiling. Nothing else changed.
   Motion (2026-10-01): the ring sweeps open clockwise from the top once, 800ms, when the
   chart first comes into view (it used to run on mount, in 400ms). Reduced motion starts it whole.
   2026-10-02 audit: legend chips are 6px round dots, not squares; a legend row is a fully
   round pill and a picked one wears the shared control thumb (control-classes), not a 4px
   corner with a bare token; the share reads at /90 medium as the value, the name at /60 and
   the amount at /60; the tail band is named "11 others" with no dot separator; the name
   column is 120px like Sectors Donut's and the row layout is 350px wide (gap 24), the
   Donut family's width; the centre label is /60 and the centre swaps through LiveFigure.
   Formulas, all from `data`: share = value / sum of values × 100, 1dp; arc span = share ×
   360° less a 1.6° gap; the centre at rest is `total` (by default the sum of the sample's
   values, abbreviated K/M/B/T), and pointed it is that slice's value. */

const EASE = [0.16, 1, 0.3, 1] as const

/** the strength of each arc, largest share first; past the end they stay at the last step */
const STEPS = [92, 70, 54, 42, 32, 24]
/** the slice being pointed at or picked; at rest there is no colour at all */
const ACCENT = "var(--chart-1)"
const inkAt = (rank: number) => `color-mix(in srgb, var(--foreground) ${STEPS[Math.min(rank, STEPS.length - 1)]}%, transparent)`

const SIZE = 140
const MID = SIZE / 2
const R_OUT = 62
const R_IN = 53
/** how far the invisible hit shape reaches past the band on each side */
const REACH = 7
/** the gap between two arcs, in degrees; never more than half the slice */
const GAP = 1.6

export interface DonutDatum {
  name: string
  value: number
  /** kept so existing callers compile; the ring is drawn in ink and ignores it */
  color?: string
  /** trailing figure on the legend row, the amount the share is a share of */
  amount?: string
}

export interface DonutChartProps {
  data?: DonutDatum[]
  /** centre figure when nothing is pointed at */
  total?: string
  /** what the centre calls that figure */
  label?: string
  /** ring and legend side by side, or legend stacked under the ring for a rail */
  layout?: "row" | "stacked"
  /** the picked slice's name: dims every other slice, ring and legend alike */
  selected?: string | null
  /** given, the legend rows become toggles and the chart becomes the control */
  onSelect?: (name: string) => void
  className?: string
}

/* The top five positions of the sample book, then every remaining position summed into
   one band. `Other` is the arithmetic of the tail, never a hand-typed figure. */
const DEFAULT_SLICES: DonutDatum[] = [
  { name: "Bitcoin", value: 27139.98 },
  { name: "Ethereum", value: 12505 },
  { name: "Solana", value: 4144 },
  { name: "Avalanche", value: 3283.2 },
  { name: "Dogecoin", value: 2997 },
  { name: "11 others", value: 13955.9 },
]

const usdAbbr = (n: number) => {
  const abs = Math.abs(n)
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e4) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const DEFAULT_TOTAL = DEFAULT_SLICES.reduce((s, d) => s + d.value, 0)

const at = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180
  return `${(MID + r * Math.cos(a)).toFixed(2)} ${(MID + r * Math.sin(a)).toFixed(2)}`
}

/** one arc of the ring as a closed shape between two radii, from `a` to `b` degrees */
function arcPath(a: number, b: number, rOut: number, rIn: number) {
  const large = b - a > 180 ? 1 : 0
  return `M ${at(a, rOut)} A ${rOut} ${rOut} 0 ${large} 1 ${at(b, rOut)} L ${at(b, rIn)} A ${rIn} ${rIn} 0 ${large} 0 ${at(a, rIn)} Z`
}

/**
 * Allocation as a ring: shares as arcs of one ink around an open centre that the total
 * sits in. Slices sort descending. Pointing at an arc or a row turns it the accent, dims
 * the rest and puts its amount in the middle; with `onSelect` the rows pick a slice.
 * 2026-10-02: the picked row takes the segmented control's thumb fill so it reads on white and on black.
 */
export function DonutChart({
  data = DEFAULT_SLICES,
  total = usdAbbr(DEFAULT_TOTAL),
  label = "Total",
  layout = "row",
  selected = null,
  onSelect,
  className,
}: DonutChartProps) {
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  /* the sweep waits until the chart is on screen, so a page of charts does not spend it out of sight */
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const maskId = `donut-sweep-${useId().replace(/:/g, "")}`
  const [hot, setHot] = useState<string | null>(null)
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const sum = sorted.reduce((s, d) => s + d.value, 0) || 1

  /* one focus at a time: the pointer wins while it is over the chart, otherwise the
     picked slice is what the ring and the centre answer about */
  const focus = hot ?? selected

  let acc = 0
  const segs = sorted.map((d, i) => {
    const frac = d.value / sum
    const span = frac * 360
    const gap = Math.min(GAP, span * 0.5)
    const a0 = acc * 360 + gap / 2
    const a1 = Math.max((acc + frac) * 360 - gap / 2, a0 + 0.2)
    acc += frac
    return { ...d, frac, ink: inkAt(i), d: arcPath(a0, a1, R_OUT, R_IN), hit: arcPath(a0, a1, R_OUT + REACH, R_IN - REACH) }
  })
  const fillOf = (s: (typeof segs)[number]) => (focus === s.name ? ACCENT : s.ink)
  const centred = focus ? segs.find((s) => s.name === focus) : undefined
  const stacked = layout === "stacked"

  const ring = (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block overflow-visible"
        role="img"
        aria-label={`${label} ${total}. ${segs.map((s) => `${s.name} ${(s.frac * 100).toFixed(1)}%`).join(", ")}`}
        onPointerLeave={() => setHot(null)}
      >
        {/* the ring draws in once, clockwise from the top: a stroke in the mask sweeps the
            band open. Reduced motion starts it whole */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={SIZE} height={SIZE}>
          <motion.circle
            cx={MID}
            cy={MID}
            r={(R_OUT + R_IN) / 2}
            fill="none"
            stroke="white"
            strokeWidth={R_OUT - R_IN + 4}
            transform={`rotate(-90 ${MID} ${MID})`}
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: seen || reduced ? 1 : 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.8, ease: EASE }}
          />
        </mask>
        <g mask={`url(#${maskId})`}>
          {segs.map((s) => (
            <motion.path
              key={s.name}
              aria-hidden
              pointerEvents="none"
              d={s.d}
              fill={fillOf(s)}
              style={{ transition: "fill 160ms" }}
              initial={false}
              animate={{ opacity: !focus || focus === s.name ? 1 : 0.35 }}
              transition={{ duration: 0.16, ease: EASE }}
            />
          ))}
        </g>
        {segs.map((s) => (
          <g key={s.name}>
            {/* the hit shape, unseen and deeper than the band: 9px is a thin thing to find */}
            <path
              aria-hidden
              d={s.hit}
              fill="transparent"
              onPointerEnter={() => setHot(s.name)}
              onClick={onSelect ? () => onSelect(s.name) : undefined}
              className={onSelect ? "cursor-pointer" : undefined}
            />
          </g>
        ))}
      </svg>
      <div role="status" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {/* the readout swaps in place when the pointed slice changes (LiveFigure: 4px rise, 2px blur, 150ms) */}
        <LiveFigure intent={centred ? centred.name : null} className="flex flex-col items-center">
          <span className="max-w-[88px] truncate text-center text-[9.5px] text-foreground/60">{centred ? centred.name : label}</span>
          <span className="mt-0.5 text-[13px] font-semibold text-foreground/90">{centred ? usdAbbr(centred.value) : total}</span>
        </LiveFigure>
      </div>
    </div>
  )

  const legend = (
    <div className={cn("flex flex-col", stacked && "w-full")} onPointerLeave={() => setHot(null)}>
      {segs.map((s) => {
        const on = selected === s.name
        return (
          <button
            key={s.name}
            type="button"
            aria-label={`${s.name} ${(s.frac * 100).toFixed(1)}%${s.amount ? `, ${s.amount}` : ""}`}
            aria-pressed={onSelect ? on : undefined}
            onClick={onSelect ? () => onSelect(s.name) : undefined}
            onPointerEnter={() => setHot(s.name)}
            onFocus={() => setHot(s.name)}
            onBlur={() => setHot(null)}
            /* selection is a fill, never an outline, so the column cannot reflow */
            className={cn(
              "flex items-center gap-2.5 rounded-full px-2 py-[5px] text-left outline-none transition-[opacity,background-color,transform,translate,scale,rotate] duration-200 focus-visible:bg-foreground/[0.06]",
              !stacked && "-mx-2",
              onSelect ? "cursor-pointer hover:bg-foreground/[0.03] active:scale-[0.97]" : "cursor-default",
              on && THUMB,
              focus && focus !== s.name && "opacity-35",
            )}
          >
            <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: fillOf(s), transition: "background 160ms" }} />
            <span className={cn("truncate text-[11.5px] text-foreground/60", stacked ? "min-w-0 flex-1" : "w-[120px]")}>{s.name}</span>
            <span className="w-[38px] text-right text-[11px] font-medium text-foreground/90">{(s.frac * 100).toFixed(1)}%</span>
            {s.amount && <span className="w-[86px] text-right text-[10.5px] text-foreground/60">{s.amount}</span>}
          </button>
        )
      })}
    </div>
  )

  return (
    <div
      ref={rootRef}
      /* the Donut family's width, 350 (Sectors Donut: ring 132 + gap 32 + legend 186); here ring 140 + gap 24 + legend 184;
         rows that carry an amount need more, so they size to their content */
      className={cn(
        "tabular-nums",
        stacked ? "flex w-full flex-col items-center gap-4" : cn("flex items-center gap-6", data.some((d) => d.amount) ? "w-fit" : "w-[350px]"),
        className,
      )}
    >
      {ring}
      {legend}
    </div>
  )
}
