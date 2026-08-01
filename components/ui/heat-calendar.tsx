import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const

/** Deterministic activity field so demo renders agree (quieter weekends). */
const demoLevel = (w: number, d: number) => {
  const s = Math.sin(w * 12.9898 + d * 78.233) * 43758.5453
  const r = s - Math.floor(s)
  return d >= 5 ? Math.max(0, r - 0.55) * 1.4 : r
}

const ALPHA = [0.04, 0.14, 0.3, 0.5, 0.75]

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "")
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)].join(",")
}

/**
 * Weeks of activity as a sequential single-hue grid — magnitude is the alpha
 * of one hue, never a second color. Hover a cell for its exact count; columns
 * settle in left to right.
 */
export function HeatCalendar({
  title = "Ship activity",
  unit = "ships",
  weeks = 12,
  maxCount = 14,
  values,
  color = "#4790E4",
  className,
}: {
  title?: string
  /** Noun shown after the hovered count, e.g. "ships", "commits". */
  unit?: string
  weeks?: number
  /** Count a cell at intensity 1.0 represents — hover shows `intensity × maxCount`. */
  maxCount?: number
  /** `values[week][day]` intensities in 0..1 (7 days per week). Defaults to a deterministic demo field. */
  values?: number[][]
  /** The single hue; magnitude maps to its alpha. */
  color?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const [hover, setHover] = useState<{ w: number; d: number } | null>(null)

  const rgb = hexToRgb(color)
  const level = (w: number, d: number) => values?.[w]?.[d] ?? demoLevel(w, d)
  const step = (v: number) => ALPHA[Math.min(4, Math.floor(v * 5))]
  const count = (v: number) => Math.round(v * maxCount)

  return (
    <div className={cn("relative w-fit", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-foreground/50">{title}</span>
        <span className="text-[11px] text-foreground/30">{weeks} weeks</span>
      </div>

      <div className="mt-3 flex gap-[4px]" onPointerLeave={() => setHover(null)}>
        {Array.from({ length: weeks }, (_, w) => (
          <motion.div
            key={w}
            className="flex flex-col gap-[4px]"
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: w * 0.035 }}
          >
            {Array.from({ length: 7 }, (_, d) => {
              const v = level(w, d)
              const on = hover?.w === w && hover?.d === d
              return (
                <button
                  key={d}
                  type="button"
                  aria-label={`${count(v)} ${unit}`}
                  onPointerEnter={() => setHover({ w, d })}
                  onFocus={() => setHover({ w, d })}
                  className="h-[14px] w-[14px] rounded-[3.5px] transition-transform duration-150"
                  style={{
                    background: `rgba(${rgb},${step(v)})`,
                    boxShadow: on
                      ? "inset 0 0 0 1px color-mix(in srgb, var(--foreground) 40%, transparent)"
                      : "inset 0 0 0 1px color-mix(in srgb, var(--foreground) 3%, transparent)",
                    transform: on ? "scale(1.25)" : undefined,
                  }}
                />
              )
            })}
          </motion.div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="flex items-center gap-1">
          <span className="text-[10px] text-foreground/30">less</span>
          {ALPHA.map((a) => (
            <span key={a} className="h-[11px] w-[11px] rounded-[3px]" style={{ background: `rgba(${rgb},${a})` }} />
          ))}
          <span className="text-[10px] text-foreground/30">more</span>
        </span>
        <span className="tabular-nums text-[11px] text-foreground/45">
          {hover ? `${count(level(hover.w, hover.d))} ${unit}` : " "}
        </span>
      </div>
    </div>
  )
}
