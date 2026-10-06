"use client"

import { useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Analyst Radar: a subject's factor scores against its sector, 0 to 100 per axis.
   Formulas: a vertex sits at score / 100 × the radius along its axis; the legend reads the
   pointed axis's two scores as given, nothing is derived.
   Motion (2026-10-01): once the chart is in view the sector shape, then the company shape,
   fades and settles from 0.9 about the centre (it was 0.6 on mount, off screen too), landed
   by 0.7s; the legend now fades a series out and back instead of remounting it, and new
   scores morph each shape in place.
   2026-10-02 audit: rebuilt to sit beside Ratings Radar. A radar has no single figure, so
   the title and the "company vs sector" caption are gone from view (title and caption still
   name the chart in its aria-label). The legend moved from a strip under the plot to the
   label row at the top, as 14.3 items: a 6px dot for the company, a dotted 10 by 2 line for
   the dashed sector, the name at /60, and the pointed axis's score at /90 (it replaces the
   old readout of two bare coloured numbers); each item stays a real toggle with
   aria-pressed. The second series is --chart-5 (the second categorical colour) instead of
   amber. Labels are 11px at /60 on the foreground ladder, the pointed one /90, never bold.
   Each axis has a slice target and a real button label, so the keyboard and touch read an
   axis the same way the mouse does, and the chart names both series to a screen reader.
   The plot is 300 by 252, level with Ratings Radar. */

const EASE = [0.16, 1, 0.3, 1] as const
const BLUE = "var(--chart-1)"
const LILAC = "var(--chart-5)"
const INK = "var(--foreground)"

const W = 300
const H = 252
const CX = 150
const CY = 128
const R = 92
/** where the axis labels sit, past the outer ring */
const LABEL_R = R + 16

const DEFAULT_AXES = ["Value", "Growth", "Profit", "Momentum", "Health", "Quality"]
const DEFAULT_PRIMARY = [78, 64, 82, 55, 71, 68]
const DEFAULT_SECONDARY = [60, 58, 65, 62, 55, 60]

export interface AnalystRadarProps {
  /** names the chart to a screen reader; not printed since 2026-10-02 */
  title?: string
  /** read to a screen reader after the title; not printed since 2026-10-02 (the legend reads the pointed axis) */
  caption?: string
  /** Up to 8 axis names — the polygon carries one vertex per axis. */
  axes?: string[]
  /** Subject series, 0–100 per axis. */
  primary?: number[]
  /** Comparison series (peer group / sector), 0–100 per axis. */
  secondary?: number[]
  primaryLabel?: string
  secondaryLabel?: string
  primaryColor?: string
  secondaryColor?: string
  className?: string
}

/**
 * Multivariate score with two series overlaid — the subject against its peer
 * group — across up to 8 axes indexed 0–100. Pointing at an axis (or tabbing to
 * its label) reads both scores in the legend; a legend item mutes its series so
 * the other can be read alone. Subject is a filled polygon, peers a dashed outline.
 */
export function AnalystRadar({
  title = "Factor scores",
  caption = "company vs sector",
  axes = DEFAULT_AXES,
  primary = DEFAULT_PRIMARY,
  secondary = DEFAULT_SECONDARY,
  primaryLabel = "Company",
  secondaryLabel = "Sector",
  primaryColor = BLUE,
  secondaryColor = LILAC,
  className,
}: AnalystRadarProps) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<number | null>(null)
  const [show, setShow] = useState({ primary: true, secondary: true })
  /* the entrance plays once, when a third of the chart is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const play = !!reduced || seen

  const n = axes.length
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n)
  /** a point at radius r (px) along axis i, which may be fractional for slice edges */
  const at = (i: number, r: number) => [CX + r * Math.cos(angle(i)), CY + r * Math.sin(angle(i))] as const
  const pt = (v: number, i: number) => at(i, (v / 100) * R)
  const xy = (p: readonly [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`
  const poly = (vals: number[]) => vals.map((v, i) => pt(v, i).join(",")).join(" ")
  /** the same polygon as a path, so a change of scores can morph it */
  const shapeOf = (vals: number[]) => `M${vals.map((v, i) => pt(v, i).map((c) => c.toFixed(2)).join(",")).join(" L")} Z`
  /** the chart centre as a fraction of the shape's own box, so the settle scales about it */
  const originOf = (vals: number[]) => {
    const ps = vals.map((v, i) => pt(v, i))
    const xs = ps.map((p) => p[0])
    const ys = ps.map((p) => p[1])
    const x0 = Math.min(...xs)
    const y0 = Math.min(...ys)
    return {
      originX: (CX - x0) / (Math.max(...xs) - x0 || 1),
      originY: (CY - y0) / (Math.max(...ys) - y0 || 1),
    }
  }
  /** settle in on view, fade on a legend toggle, morph on new scores */
  const shapeMotion = (vals: number[], on: boolean, delay: number) => {
    const d = shapeOf(vals)
    return {
      style: { ...originOf(vals), pointerEvents: "none" as const },
      initial: reduced ? (false as const) : { opacity: 0, scale: 0.9, d },
      animate: { opacity: play && on ? 1 : 0, scale: play ? 1 : 0.9, d },
      transition: reduced
        ? { duration: 0 }
        : {
            opacity: { duration: 0.4, ease: EASE, delay },
            scale: { duration: 0.6, ease: EASE, delay },
            d: { duration: 0.35, ease: EASE },
          },
    }
  }

  const series = [
    { key: "primary", color: primaryColor, label: primaryLabel, values: primary, dashed: false },
    { key: "secondary", color: secondaryColor, label: secondaryLabel, values: secondary, dashed: true },
  ] as const
  const summary = axes.map((ax, i) => `${ax} ${primary[i] ?? 0} and ${secondary[i] ?? 0}`).join(", ")

  return (
    <div ref={rootRef} className={cn("w-[300px] tabular-nums", className)}>
      {/* the legend in the label row: a toggle per series, the pointed axis's score after its name */}
      <div className="flex items-center justify-center gap-3 text-[11px]">
        {series.map((s) => {
          const active = show[s.key]
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={active}
              aria-label={`${active ? "Hide" : "Show"} ${s.label}`}
              onClick={() => setShow((v) => ({ ...v, [s.key]: !v[s.key] }))}
              className="-mx-1.5 flex items-center gap-1.5 rounded-full px-1.5 outline-none transition-[opacity,background-color] duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06]"
              style={{ opacity: active ? 1 : 0.4 }}
            >
              {s.dashed ? (
                <svg width={10} height={2} aria-hidden className="shrink-0">
                  <line x1={0} y1={1} x2={10} y2={1} stroke={s.color} strokeWidth={2} strokeDasharray="3 2" />
                </svg>
              ) : (
                <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
              )}
              <span className="text-foreground/60">{s.label}</span>
              {/* the score holds its width, so pointing never shifts the row */}
              <span className="inline-block min-w-[1.9em] text-left font-medium text-foreground/90">
                {hot !== null ? (s.values[hot] ?? "") : " "}
              </span>
            </button>
          )
        })}
      </div>

      <div className="relative mt-1" style={{ width: W, height: H }} onPointerLeave={() => setHot(null)}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block overflow-visible"
          role="img"
          aria-label={`${title}, ${caption}: ${primaryLabel} against ${secondaryLabel} out of 100. ${summary}`}
        >
          {/* grid rings */}
          {[25, 50, 75, 100].map((ring) => (
            <polygon key={ring} points={poly(axes.map(() => ring))} fill="none" stroke={INK} strokeOpacity={0.05} strokeWidth={1} />
          ))}

          {/* spokes; the pointed one firms up */}
          {axes.map((ax, i) => {
            const [ex, ey] = pt(100, i)
            return (
              <line
                key={ax}
                x1={CX}
                y1={CY}
                x2={ex}
                y2={ey}
                stroke={INK}
                strokeOpacity={hot === i ? 0.16 : 0.06}
                strokeWidth={1}
                style={{ transition: reduced ? "none" : "stroke-opacity 150ms" }}
              />
            )
          })}

          {/* comparison series — dashed outline, sits behind; muting fades it rather than removing it */}
          <motion.path
            fill={`color-mix(in srgb, ${secondaryColor} 8%, transparent)`}
            stroke={secondaryColor}
            strokeOpacity={0.7}
            strokeWidth={1.4}
            strokeDasharray="3 2"
            {...shapeMotion(secondary, show.secondary, 0)}
          />

          {/* subject series — filled */}
          <motion.path
            fill={`color-mix(in srgb, ${primaryColor} 16%, transparent)`}
            stroke={primaryColor}
            strokeWidth={1.8}
            {...shapeMotion(primary, show.primary, 0.08)}
          />

          {/* vertex dots on the pointed axis */}
          {hot !== null && (
            <g pointerEvents="none">
              {show.primary && <circle cx={pt(primary[hot] ?? 0, hot)[0]} cy={pt(primary[hot] ?? 0, hot)[1]} r={3.2} fill={primaryColor} />}
              {show.secondary && <circle cx={pt(secondary[hot] ?? 0, hot)[0]} cy={pt(secondary[hot] ?? 0, hot)[1]} r={2.8} fill={secondaryColor} />}
            </g>
          )}

          {/* one slice of the polygon per axis, so pointing anywhere near an axis picks it */}
          {axes.map((ax, i) => (
            <path
              key={ax}
              d={`M${CX},${CY} L${xy(at(i - 0.5, R + 8))} L${xy(at(i, R + 8))} L${xy(at(i + 0.5, R + 8))} Z`}
              fill="transparent"
              onPointerEnter={() => setHot(i)}
            />
          ))}
        </svg>

        {/* the axis names are real buttons: focus and a tap read the axis like the pointer does */}
        {axes.map((ax, i) => {
          const [x, y] = at(i, LABEL_R)
          const shift = Math.abs(x - CX) < 8 ? "-50%" : x > CX ? "0%" : "-100%"
          return (
            <button
              key={ax}
              type="button"
              aria-label={`${ax}: ${primaryLabel} ${primary[i] ?? 0}, ${secondaryLabel} ${secondary[i] ?? 0}`}
              onPointerEnter={() => setHot(i)}
              onFocus={() => setHot(i)}
              onBlur={() => setHot(null)}
              onClick={() => setHot(i)}
              className={cn(
                "absolute whitespace-nowrap rounded-full text-[11px] outline-none transition-colors duration-150 focus-visible:bg-foreground/[0.06]",
                hot === i ? "text-foreground/90" : "text-foreground/60",
              )}
              style={{ left: x, top: y, transform: `translate(${shift}, -50%)` }}
            >
              {ax}
            </button>
          )
        })}
      </div>
    </div>
  )
}
