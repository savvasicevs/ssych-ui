"use client"

import { useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const BLUE = "var(--chart-1)"
const AMBER = "var(--chart-amber)"
const TEXT = "var(--foreground)"
const TEXT_MUTED = "var(--muted-foreground)"

/** Hairline / label tints — one foreground hue at different alphas, so the grid
 * stays a whisper in either theme without a fixed hex. */
const tint = (pct: number) => `color-mix(in srgb, ${TEXT} ${pct}%, transparent)`

const CX = 145
const CY = 148
const R = 96

const DEFAULT_AXES = ["Value", "Growth", "Profit", "Momentum", "Health", "Quality"]
const DEFAULT_PRIMARY = [78, 64, 82, 55, 71, 68]
const DEFAULT_SECONDARY = [60, 58, 65, 62, 55, 60]

/* Motion (2026-10-01): once the chart is in view the sector shape, then the company shape,
   fades and settles from 0.9 about the centre (it was 0.6 on mount, off screen too), landed
   by 0.7s; the legend now fades a series out and back instead of remounting it, and new
   scores morph each shape in place */
export interface AnalystRadarProps {
  title?: string
  /** Sits in the header until a spoke is hovered, then the read-out takes over. */
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
 * group — across up to 8 axes indexed 0–100. Hovering a spoke makes the header
 * read both values at once; the legend mutes a series so the other can be read
 * alone. Subject is a filled brand polygon, peers a dashed outline behind it.
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
  secondaryColor = AMBER,
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
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n
  const pt = (v: number, i: number) => {
    const a = angle(i)
    const r = (v / 100) * R
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const
  }
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
      style: { ...originOf(vals), pointerEvents: on ? undefined : ("none" as const) },
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

  return (
    <div ref={rootRef} className={cn("w-[300px]", className)}>
      <div className="mb-1 flex items-baseline justify-between px-1">
        <span className="text-[13px] font-medium" style={{ color: TEXT }}>
          {title}
        </span>
        <span className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>
          {hot !== null ? (
            <>
              <span style={{ color: TEXT }}>{axes[hot]}</span>
              <span className="mx-1.5" style={{ color: primaryColor }}>
                {primary[hot]}
              </span>
              <span style={{ color: secondaryColor }}>{secondary[hot]}</span>
            </>
          ) : (
            caption
          )}
        </span>
      </div>

      <svg width={296} height={296} viewBox="0 0 296 296" className="block">
        {/* grid rings */}
        {[25, 50, 75, 100].map((ring) => (
          <polygon key={ring} points={poly(axes.map(() => ring))} fill="none" stroke={tint(5)} strokeWidth={1} />
        ))}

        {/* spokes + wide invisible hit areas + labels */}
        {axes.map((ax, i) => {
          const [ex, ey] = pt(100, i)
          const [lx, ly] = pt(118, i)
          const on = hot === i
          return (
            <g key={ax} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)} style={{ cursor: "default" }}>
              <line x1={CX} y1={CY} x2={ex} y2={ey} stroke={tint(6)} strokeWidth={1} />
              <line x1={CX} y1={CY} x2={ex} y2={ey} stroke="transparent" strokeWidth={22} />
              <text
                x={lx}
                y={ly + 3}
                textAnchor={Math.abs(lx - CX) < 8 ? "middle" : lx > CX ? "start" : "end"}
                fontSize={9}
                fontWeight={on ? 700 : 500}
                fill={on ? TEXT : tint(45)}
              >
                {ax}
              </text>
            </g>
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

        {/* vertex dots on the hovered axis */}
        {hot !== null && (
          <g pointerEvents="none">
            {show.primary && (
              <circle cx={pt(primary[hot], hot)[0]} cy={pt(primary[hot], hot)[1]} r={3.5} fill={primaryColor} />
            )}
            {show.secondary && (
              <circle cx={pt(secondary[hot], hot)[0]} cy={pt(secondary[hot], hot)[1]} r={3} fill={secondaryColor} />
            )}
          </g>
        )}
      </svg>

      {/* legend — click to mute a series */}
      <div className="mt-1 flex justify-center gap-2 px-1">
        {(
          [
            ["primary", primaryColor, primaryLabel],
            ["secondary", secondaryColor, secondaryLabel],
          ] as const
        ).map(([key, color, label]) => {
          const active = show[key]
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] transition-opacity"
              style={{ color: TEXT_MUTED, opacity: active ? 1 : 0.4 }}
            >
              <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
