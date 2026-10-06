"use client"

import { useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { LiveFigure } from "@/components/ui/live-figure"
import { cn } from "@/lib/utils"

/* Ratings Radar, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · it answers the pointer: pointing at an axis or its label keeps that rating full, dims
     the others, grows its point and reads the count and its share where the caption is
   · the labels are real buttons with their own names, the chart names itself
   · the shape's colour now means something: green when buy ratings outweigh sell ratings,
     red when they do not, ink when the labels say neither
   · the shape fades in and its outline draws, it no longer scales up from the middle
   · every figure is tabular; the sample labels are in sentence case
   Motion (2026-10-01): the fade, the outline draw and the points now wait until the chart
   is in view (they played on mount, off screen too), all landed by 0.65s; new counts morph
   the shape and glide each point along its spoke
   2026-10-02: the radar does not need a header (spec 14.1: no single figure to read first,
   its axis labels name it), so the visible "Analyst ratings" title is gone; the `title`
   prop still names the chart in its aria-label. The line over the chart stays: blank at
   rest, it reads the pointed rating's count and share.
   2026-10-02 audit: the sample axes run in the scale's order, Strong buy at the top and then
   Buy, Neutral, Sell and Strong sell clockwise, so a buy lean pulls the shape up and to the
   right (Strong sell used to sit beside Strong buy, so the shape meant nothing). The axis
   labels are 11px with the name at /60 and the count at /90. The line over the chart no
   longer repeats the label and count printed at the axis: it reads only the new figure,
   the share ("31.0% of 87 analysts"), 11px /60 with the share /90, and it swaps through the
   shared LiveFigure.
   Formulas, all from `ratings`: total = sum of counts; share = count / total × 100, 1dp;
   point radius = 6 + count / largest count × 96; the hue = green when the buy counts are
   at least the sell counts, red when not, ink when the labels say neither. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const INK = "var(--foreground)"

export interface RadarRating {
  label: string
  count: number
}

const DEFAULT_RATINGS: RadarRating[] = [
  { label: "Strong buy", count: 38 },
  { label: "Buy", count: 27 },
  { label: "Neutral", count: 11 },
  { label: "Sell", count: 8 },
  { label: "Strong sell", count: 3 },
]

const SIZE_W = 300
const SIZE_H = 252
const CX = 150
const CY = 128
const R = 102
const RINGS = 4

const BULL = /buy|outperform|overweight/i
const BEAR = /sell|underperform|underweight/i

/**
 * Analyst ratings as a pentagon: hairline rings and spokes, one shape pulled toward the
 * dominant rating, counts beside their labels. Pointing at an axis reads that rating's
 * share of all analysts in place of the caption.
 */
export function RatingsRadar({
  ratings = DEFAULT_RATINGS,
  title = "Analyst ratings",
  caption,
  className,
}: {
  /** One axis per rating, drawn clockwise from the top. */
  ratings?: RadarRating[]
  /** names the chart to a screen reader; not printed */
  title?: string
  /** a line shown over the chart at rest; blank by default */
  caption?: string
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
  const max = Math.max(...ratings.map((r) => r.count), 1)
  const total = ratings.reduce((a, r) => a + r.count, 0)

  /* the lean: buy counts minus sell counts, read from the labels */
  const bull = ratings.filter((r) => BULL.test(r.label)).reduce((a, r) => a + r.count, 0)
  const bear = ratings.filter((r) => BEAR.test(r.label)).reduce((a, r) => a + r.count, 0)
  const hue = bull + bear === 0 ? INK : bull >= bear ? GREEN : RED

  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i / Math.max(1, ratings.length)) * Math.PI * 2
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r] as const
  }
  const xy = (p: readonly [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
  const wedge = ratings.map((r, i) => pt(i, 6 + (r.count / max) * (R - 6)))
  const shape = `M${wedge.map(xy).join(" L")} Z`
  const top = ratings.reduce((a, r) => (r.count > a.count ? r : a), ratings[0] ?? { label: "", count: 0 })
  const share = (n: number) => (total ? (n / total) * 100 : 0).toFixed(1)

  return (
    <div ref={rootRef} className={cn("w-[300px] tabular-nums", className)}>
      <div className="text-center">
        <div role="status" className="text-[11px] text-foreground/60">
          {/* the line swaps in place when the pointed rating changes (LiveFigure: 4px, 2px blur, 150ms) */}
          <LiveFigure intent={hot}>
            {hot !== null && ratings[hot] ? (
              <>
                <span className="font-medium text-foreground/90">{share(ratings[hot].count)}%</span>
                {` of ${total} analysts`}
              </>
            ) : (
              (caption ?? "\u00a0") /* no summary at rest (user call, 2026-10-02) */
            )}
          </LiveFigure>
        </div>
      </div>

      <div className="relative mt-1" style={{ width: SIZE_W, height: SIZE_H }} onPointerLeave={() => setHot(null)}>
        <svg
          width={SIZE_W}
          height={SIZE_H}
          viewBox={`0 0 ${SIZE_W} ${SIZE_H}`}
          className="block overflow-visible"
          role="img"
          aria-label={`${title}, ${total} analysts. Most common: ${top.label} ${top.count}, ${share(top.count)}%`}
        >
          {Array.from({ length: RINGS }, (_, ri) => {
            const rr = ((ri + 1) / RINGS) * R
            const d = `M${ratings.map((_, i) => xy(pt(i, rr))).join(" L")} Z`
            return <path key={ri} d={d} fill="none" stroke={INK} strokeOpacity={0.05} strokeWidth={1} />
          })}
          {ratings.map((r, i) => {
            const [x2, y2] = pt(i, R)
            return (
              <line
                key={r.label}
                x1={CX}
                y1={CY}
                x2={x2}
                y2={y2}
                stroke={INK}
                strokeOpacity={hot === i ? 0.28 : 0.05}
                strokeWidth={1}
                style={{ transition: reduced ? "none" : "stroke-opacity 160ms" }}
              />
            )
          })}

          <motion.path
            fill={hue}
            fillOpacity={0.16}
            initial={reduced ? false : { opacity: 0, d: shape }}
            animate={{ opacity: play ? 1 : 0, d: shape }}
            transition={reduced ? { duration: 0 } : { opacity: { duration: 0.3, ease: EASE, delay: 0.1 }, d: morph }}
          />
          <motion.path
            fill="none"
            stroke={hue}
            strokeWidth={1.8}
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0, d: shape }}
            animate={{ pathLength: play ? 1 : 0, d: shape }}
            transition={reduced ? { duration: 0 } : { pathLength: { duration: 0.4, ease: EASE }, d: morph }}
          />

          {wedge.map((p, i) => (
            /* the group carries the point to its place, so new counts glide it along the spoke */
            <motion.g
              key={ratings[i].label}
              initial={reduced ? false : { opacity: 0, x: p[0], y: p[1] }}
              animate={{ opacity: play ? 1 : 0, x: p[0], y: p[1] }}
              transition={reduced ? { duration: 0 } : { opacity: { duration: 0.3, ease: EASE, delay: 0.2 + i * 0.035 }, default: morph }}
            >
              {/* the point grows by a transform about its own centre (2 → 3.2), never a radius tween */}
              <circle
                cx={0}
                cy={0}
                r={2}
                fill={hue}
                style={{
                  opacity: hot === null || hot === i ? 1 : 0.4,
                  transform: hot === i ? "scale(1.6)" : "scale(1)",
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  transition: reduced ? "opacity 160ms" : "transform 160ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms",
                }}
              />
            </motion.g>
          ))}

          {/* one slice of the pentagon per rating, so pointing anywhere near an axis picks it */}
          {ratings.map((r, i) => (
            <path
              key={r.label}
              d={`M${CX},${CY} L${xy(pt(i - 0.5, R + 8))} L${xy(pt(i, R + 8))} L${xy(pt(i + 0.5, R + 8))} Z`}
              fill="transparent"
              onPointerEnter={() => setHot(i)}
            />
          ))}
        </svg>

        {ratings.map((r, i) => {
          const [x, y] = pt(i, R + 18)
          const shift = Math.abs(x - CX) < 8 ? "-50%" : x > CX ? "0%" : "-100%"
          return (
            <button
              key={r.label}
              type="button"
              aria-label={`${r.label}: ${r.count} analysts, ${share(r.count)}%`}
              onPointerEnter={() => setHot(i)}
              onFocus={() => setHot(i)}
              onBlur={() => setHot(null)}
              onClick={() => setHot(i)}
              className="absolute whitespace-nowrap rounded-full text-[11px] outline-none transition-opacity duration-200 focus-visible:bg-foreground/[0.06]"
              style={{
                left: x,
                top: y,
                transform: `translate(${shift}, -50%)`,
                opacity: hot === null || hot === i ? 1 : 0.4,
              }}
            >
              <span className={hot === i ? "text-foreground/90" : "text-foreground/60"}>{r.label} </span>
              {r.count > 0 && <span className="font-medium text-foreground/90">{r.count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
