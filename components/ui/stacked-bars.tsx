"use client"

import { useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { ChartCard } from "@/components/ui/chart-overlay"

/* Stacked Bars, written new through ssych-component (2026-09-29).
   What it is for: a total over time and what it is made of, here twelve months of
   inference spend split by model.
   Read first: the height of the bars, the total climbing month on month. The split is
   second: one ink at four strengths, strongest for the largest series.
   The pointer: over a segment keeps its series at full strength in the other months and
   dims the rest; a card beside the bar reads the month, segments highest first, and the
   bar's total. Over a name in the legend the whole series is lit and the header gives its sum and
   its share of everything. Left and right arrows
   walk the months, up and down the segments of a bar, Escape lets go.
   Sketch: src/components/lab/StackedBarChart.tsx, which shows
   src/components/ui/stacked-bar-chart.tsx. Kept: its data shape (rows of named
   segments, `StackedBarRow` and `StackedBarSegment`), the value formatter, the series
   names as buttons that light their series. Changed: the rows are months and stand
   upright, the card, the heading tag, the capitals and the four hues are gone, and the
   `color` field of a segment is dropped because a series is a strength of ink here.
   No reference was named for this one.
   Formulas, all from the rows:
   · total of a bar = the sum of its segments
   · share of a segment = its value ÷ the total of its bar
   · sum of a series = its value added over every bar; its share = that ÷ the sum of
     every segment of every bar
   · strength follows the sum of the series, largest first
   · the value axis tops out at the first round step at or above the tallest bar
   Colour pass (2026-09-30): the parts of a stack must be told apart, so each series takes
   its own colour by its place in the rows (chart 1, 5, 3, amber, 2, 4); a series named
   "Other", and any past six, is the one Other ink. The colour follows the series into its
   swatch; pointing keeps it at full strength and dims the rest to 0.35.
   Motion (2026-10-01): the bars rise from the baseline once the chart is a third in view,
   25ms apart over 450ms (725ms in all); reduced motion shows them standing. No data changes
   here, so nothing else moves.
   2026-10-02: the header and the line beside it read oddly, and the square chips under the
   plot did not match the legends of Model Comparison, SMA Chart and Performance Chart. So
   the header now has the library's three tiers like Market Snapshot (spec 14.1): the title
   at /45 with the period on the right, the total of every bar as the headline with its
   decimals at /35, and under it the window at /45. Pointing reads the segment or the series
   in the same two lines (its value as the headline, then its name, its month and its share).
   The data has no change worth a hue, so none is shown. The legend moved up under the
   header (spec 14.3): a 6px round dot in the series colour and the name at /60, still a
   button that lights its series. The default formatter now groups thousands.
   2026-10-02 audit: pointing a segment rewrote the headline, so the total you read first
   left the screen. Now the headline stays the total while a segment is pointed, and a card
   over the chart beside the bar (chart-overlay.tsx) reads that month: every segment highest
   first, then the bar's total. Pointing a name in the legend still reads the series in the
   header. The year under the months was 8.5px and is now 9px like the other ticks, and the
   axis and month figures moved from /35 to /45, the floor for axis text.
   2026-10-02 round 2: the series are named for current models, Claude Opus 5.5, GPT-5 and
   Gemini 3 Pro (the set Model Comparison shows), in place of claude-sonnet-4.5, gpt-4.1 and
   gemini-2.5-pro. The monthly figures are unchanged, so every total and share holds. */

const EASE = [0.16, 1, 0.3, 1] as const
/** the house order for things that must be told apart; nothing on this chart means up */
const PALETTE = ["var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-amber)", "var(--chart-2)", "var(--chart-4)"]
const OTHER = "color-mix(in srgb, var(--foreground) 22%, transparent)"

export interface StackedBarSegment {
  label: string
  value: number
}

export interface StackedBarRow {
  label: string
  caption?: string
  segments: StackedBarSegment[]
}

export interface StackedBarsProps {
  /** one bar for each row, in time order; segments stack from the first one up */
  rows?: StackedBarRow[]
  title?: string
  valueFormatter?: (value: number) => string
  className?: string
}

const SERIES = ["Claude Opus 5.5", "GPT-5", "Gemini 3 Pro", "Other"]
/** monthly spend in thousands of dollars, one column for each name in SERIES */
const SPEND: [string, string, number[]][] = [
  ["Oct", "2025", [31.2, 22.4, 9.8, 6.1]],
  ["Nov", "2025", [33.6, 21.9, 10.4, 6.4]],
  ["Dec", "2025", [36.1, 23.2, 11.9, 6.0]],
  ["Jan", "2026", [38.4, 22.1, 12.6, 6.8]],
  ["Feb", "2026", [41.0, 21.4, 13.8, 7.1]],
  ["Mar", "2026", [41.2, 24.6, 15.1, 8.5]],
  ["Apr", "2026", [45.7, 23.8, 16.4, 8.2]],
  ["May", "2026", [48.3, 22.6, 18.9, 8.8]],
  ["Jun", "2026", [52.9, 21.7, 19.6, 9.4]],
  ["Jul", "2026", [55.4, 23.1, 21.2, 9.1]],
  ["Aug", "2026", [58.8, 22.4, 22.7, 9.9]],
  ["Sep", "2026", [63.5, 21.8, 24.3, 10.2]],
]
const DEFAULT_ROWS: StackedBarRow[] = SPEND.map(([label, caption, values]) => ({
  label,
  caption,
  segments: values.map((value, i) => ({ label: SERIES[i], value })),
}))

const formatValue = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
/** the headline's figure, its decimals (and any unit after them) split off to sit at /35 */
const splitDecimals = (text: string) => {
  const m = text.match(/^(.*?\d)(\.\d+\D*)$/)
  return m ? [m[1], m[2]] : [text, ""]
}


const W = 480
const H = 204
const PAD = { l: 0, r: 42, t: 8, b: 30 }
const PLOT_W = W - PAD.l - PAD.r
const BASE = H - PAD.b

const STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
/** the first round step at or above v */
function ceilNice(v: number) {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  return (STEPS.find((m) => m * p >= v - 1e-9) ?? 10) * p
}

/** what is being pointed at: one segment of one bar, or a whole series when `row` is null */
type Hot = { row: number | null; series: string }

/**
 * Bars that stack a total out of its parts, month by month. The parts are one ink at
 * several strengths, so the chart is about the height until the pointer asks about a
 * part: that segment takes the accent and the line above gives its value and its share
 * of the bar.
 */
export function StackedBars({ rows = DEFAULT_ROWS, title = "Inference spend", valueFormatter = formatValue, className }: StackedBarsProps) {
  const reduced = useReducedMotion()
  const plotRef = useRef<HTMLDivElement>(null)
  /* the bars wait until the chart is a third in view, then rise once */
  const play = useInView(plotRef, { once: true, amount: 0.3 }) || !!reduced
  const [hot, setHot] = useState<Hot | null>(null)
  /** arrow keys walk the segments; the readout then changes at once, only the pointer gets the swap */
  const [byKey, setByKey] = useState(false)
  const point = (h: Hot) => {
    setByKey(false)
    setHot(h)
  }

  const { series, sums, grand, totals, top } = useMemo(() => {
    const sums = new Map<string, number>()
    for (const r of rows) for (const s of r.segments) sums.set(s.label, (sums.get(s.label) ?? 0) + Math.max(0, s.value))
    const series = [...sums.keys()]
    const totals = rows.map((r) => r.segments.reduce((a, s) => a + Math.max(0, s.value), 0))
    const grand = totals.reduce((a, b) => a + b, 0)
    return { series, sums, grand, totals, top: ceilNice(Math.max(0, ...totals)) }
  }, [rows])

  /* the list under the chart reads largest first */
  const rank = [...series].sort((a, b) => (sums.get(b) ?? 0) - (sums.get(a) ?? 0))
  /* the colour belongs to the series, by its place in the rows; "Other" and past six share one ink */
  const named = series.filter((l) => l !== "Other")
  const hueOf = (label: string) => (label === "Other" ? OTHER : (PALETTE[named.indexOf(label)] ?? OTHER))
  const lit = (row: number, label: string) => hot !== null && hot.series === label && (hot.row === null || hot.row === row)

  const slot = PLOT_W / Math.max(1, rows.length)
  const bar = Math.max(4, Math.min(26, slot - 8))
  const y = (v: number) => BASE - (v / top) * (BASE - PAD.t)
  const period = (r?: StackedBarRow) => (r ? `${r.label}${r.caption ? ` ${r.caption}` : ""}` : "")

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setHot(null)
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) || !rows.length) return
    e.preventDefault()
    setByKey(true)
    const row = hot?.row ?? rows.length - 1
    const names = rows[row].segments.map((s) => s.label)
    const at = hot && hot.row !== null ? Math.max(0, names.indexOf(hot.series)) : 0
    if (hot === null || hot.row === null) return setHot({ row, series: names[0] })
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const next = Math.max(0, Math.min(rows.length - 1, row + (e.key === "ArrowRight" ? 1 : -1)))
      const keep = rows[next].segments.some((s) => s.label === hot.series)
      return setHot({ row: next, series: keep ? hot.series : rows[next].segments[0].label })
    }
    const next = Math.max(0, Math.min(names.length - 1, at + (e.key === "ArrowUp" ? 1 : -1)))
    setHot({ row, series: names[next] })
  }

  const seg = hot && hot.row !== null ? rows[hot.row]?.segments.find((s) => s.label === hot.series) : undefined
  const last = rows.length - 1
  /* the headline: the total of every bar, or the pointed series' sum while a legend name is
     pointed; a pointed segment leaves it on the total and reads in the card */
  const seriesHot = hot && hot.row === null ? hot.series : null
  const headValue = seriesHot !== null ? (sums.get(seriesHot) ?? 0) : grand
  /* the card goes to the bar's left once the bar is past 60% of the plot */
  const cardFlip = hot !== null && hot.row !== null && (hot.row + 0.5) / Math.max(1, rows.length) > 0.6
  const [headWhole, headDecimals] = splitDecimals(valueFormatter(headValue))

  return (
    <div className={cn("w-[480px] max-w-full tabular-nums", className)}>
      {/* the header, three tiers (spec 14.1): title and period, the figure, then what it is */}
      <div className="mb-3 flex items-baseline justify-between text-[12px]">
        <span className="truncate text-foreground/45">{title}</span>
        <span className="shrink-0 pl-3 font-medium text-foreground/90">
          {period(rows[0])} to {period(rows[last])}
        </span>
      </div>
      <div role="status">
        {/* the pointer swaps the readout in place: 4px out of a 2px blur over 150ms; arrow keys change it at once */}
        <motion.div
          key={seriesHot !== null ? `series-${seriesHot}` : "rest"}
          initial={reduced || byKey ? false : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          <p className="m-0 text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
            {headWhole}
            <span className="text-foreground/35">{headDecimals}</span>
          </p>
          <p className="mb-0 mt-2 flex items-baseline gap-[7px] truncate text-[12px]">
            {seriesHot !== null ? (
              <>
                <span className="truncate font-medium text-foreground/60">{seriesHot}</span>
                <span className="shrink-0 text-foreground/45">{(((sums.get(seriesHot) ?? 0) / (grand || 1)) * 100).toFixed(1)}% of the total</span>
              </>
            ) : (
              <span className="text-foreground/45">Total over {rows.length === 1 ? "1 month" : `${rows.length} months`}</span>
            )}
          </p>
        </motion.div>
      </div>

      {/* the legend, at the top under the header (spec 14.3): a 6px round dot and the name;
          pointing at a name lights its series */}
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1" onPointerLeave={() => setHot(null)}>
        {rank.map((label) => {
          const on = hot?.series === label
          return (
            <button
              key={label}
              type="button"
              aria-label={`${label}, ${valueFormatter(sums.get(label) ?? 0)}, ${(((sums.get(label) ?? 0) / (grand || 1)) * 100).toFixed(1)}% of the total`}
              onPointerEnter={() => point({ row: null, series: label })}
              onFocus={() => setHot({ row: null, series: label })}
              onBlur={() => setHot(null)}
              className={cn(
                "-mx-1 flex items-center gap-1.5 rounded-full px-1 text-[11px] text-foreground/60 outline-none transition-opacity duration-200 focus-visible:bg-foreground/[0.06] motion-reduce:transition-none",
                hot !== null && !on && "opacity-35",
              )}
            >
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: hueOf(label) }} />
              {label}
            </button>
          )
        })}
      </div>

      <div
        ref={plotRef}
        role="group"
        tabIndex={0}
        aria-label={`${title} by segment, ${rows.length} bars`}
        onKeyDown={onKey}
        onBlur={() => setHot(null)}
        className="relative mt-4 rounded-[4px] outline-none focus-visible:bg-foreground/[0.03]"
      >
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto max-w-full overflow-visible"
          role="img"
          aria-label={`${title}, ${period(rows[0])} to ${period(rows[last])}, ${valueFormatter(grand)} in all, ${valueFormatter(totals[last] ?? 0)} in ${period(rows[last])}`}
          onPointerLeave={() => setHot(null)}
        >
          {[0.5, 1].map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={PAD.l + PLOT_W} y1={y(top * t)} y2={y(top * t)} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} />
              <text x={W} y={y(top * t) + 3} textAnchor="end" fontSize={9} fill="var(--foreground)" fillOpacity={0.45}>
                {valueFormatter(top * t)}
              </text>
            </g>
          ))}
          <line x1={PAD.l} x2={PAD.l + PLOT_W} y1={BASE + 0.5} y2={BASE + 0.5} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} />

          {rows.map((r, ri) => {
            const cx = PAD.l + slot * ri + slot / 2
            let acc = 0
            return (
              <g key={`${r.label}-${r.caption ?? ri}`}>
                {/* the bar rises once from the baseline; the dim lives on the segments inside */}
                <motion.g
                  style={{ originY: 1 }}
                  initial={reduced ? false : { scaleY: 0, opacity: 0 }}
                  animate={play ? { scaleY: 1, opacity: 1 } : { scaleY: 0, opacity: 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.45, ease: EASE, delay: Math.min(ri, 15) * 0.025 }}
                >
                  {r.segments.map((s) => {
                    const v = Math.max(0, s.value)
                    const y0 = y(acc)
                    acc += v
                    const y1 = y(acc)
                    const on = lit(ri, s.label)
                    const dim = hot !== null && hot.series !== s.label
                    return (
                      <rect
                        key={s.label}
                        x={cx - bar / 2}
                        y={y1}
                        width={bar}
                        /* a 1px gap parts two segments */
                        height={Math.max(1, y0 - y1 - 1)}
                        rx={2}
                        fill={hueOf(s.label)}
                        opacity={dim ? 0.35 : on || hot === null ? 1 : 0.85}
                        style={{ cursor: "pointer", transition: reduced ? "none" : "opacity 160ms" }}
                        onPointerEnter={() => point({ row: ri, series: s.label })}
                      />
                    )
                  })}
                </motion.g>
                <text
                  x={cx}
                  y={BASE + 14}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--foreground)"
                  fillOpacity={hot?.row === ri ? 0.9 : 0.45}
                  style={{ transition: reduced ? "none" : "fill-opacity 160ms" }}
                >
                  {r.label}
                </text>
                {/* the year is written once, under the first bar that belongs to it */}
                {r.caption && r.caption !== rows[ri - 1]?.caption && (
                  <text x={cx} y={BASE + 25} textAnchor="middle" fontSize={9} fill="var(--foreground)" fillOpacity={0.45}>
                    {r.caption}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* the pointed month, read in a card beside its bar (chart-overlay.tsx): segments
            highest first, then the bar's total; it flips to the bar's left past 60% */}
        <ChartCard
          open={hot !== null && hot.row !== null && seg !== undefined}
          x={hot && hot.row !== null ? `${((PAD.l + slot * hot.row + slot / 2 + (cardFlip ? -bar / 2 : bar / 2)) / W) * 100}%` : 0}
          flip={cardFlip}
          width={168}
          heading={hot && hot.row !== null ? period(rows[hot.row]) : ""}
          rows={
            hot && hot.row !== null && rows[hot.row]
              ? [
                  ...[...rows[hot.row].segments]
                    .sort((a, b) => b.value - a.value)
                    .map((s) => ({ label: s.label, value: valueFormatter(s.value) })),
                  { label: "Total", value: valueFormatter(totals[hot.row] ?? 0) },
                ]
              : []
          }
        />
      </div>
    </div>
  )
}
