import { useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

const INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const DEFAULT_YEARS = [2021, 2022, 2023, 2024, 2025]

/** Deterministic sample field so every render agrees (2022 reads as a down year). */
const DEFAULT_RETURNS: number[][] = (() => {
  let seed = 2021
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  return DEFAULT_YEARS.map((_, yi) =>
    INITIALS.map(() => Math.round(((yi === 1 ? -1.6 : 0.9) + (rnd() - 0.5) * 12) * 10) / 10),
  )
})()

/** Compounded year return from its months, in percent. */
const compound = (row: number[]) => (row.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100

const signed = (v: number, dp: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}`

export interface ReturnsCalendarProps {
  /** Heading above the grid. */
  title?: string
  /** Caption shown while nothing is hovered. */
  hint?: string
  /** Row labels — one per row of `returns`. */
  years?: number[]
  /** `returns[year][month]` in percent (12 months per row). */
  returns?: number[][]
  className?: string
}

/**
 * Monthly-returns heat grid — years × months, diverging up/down by magnitude,
 * with a compounded year-total column. Hovering a cell reads out the month and
 * dims every unrelated cell; cells settle in on a diagonal delay.
 */
export function ReturnsCalendar({
  title = "Monthly returns",
  hint = "hover a month · year = compounded",
  years = DEFAULT_YEARS,
  returns = DEFAULT_RETURNS,
  className,
}: ReturnsCalendarProps) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<{ y: number; m: number } | null>(null)

  const totals = useMemo(() => returns.map(compound), [returns])
  const hotValue = hot ? returns[hot.y]?.[hot.m] : undefined

  /** magnitude → tinted fill of the single up/down hue, never a second color */
  const cellFill = (r: number, on: boolean) =>
    `color-mix(in srgb, ${r >= 0 ? GREEN : RED} ${Math.round(Math.min(Math.abs(r) / 8, 1) * 55 + (on ? 22 : 7))}%, transparent)`

  return (
    <div className={cn("w-[440px]", className)}>
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <span className="text-[13px] font-medium text-foreground">{title}</span>
        <span className="text-[10px] tabular-nums text-foreground/45">
          {hot && hotValue != null ? (
            <>
              <span className="text-foreground">
                {MONTHS[hot.m]} {years[hot.y]}
              </span>
              <span className="mx-1.5 text-foreground/25">·</span>
              <span style={{ color: hotValue >= 0 ? GREEN : RED }}>{signed(hotValue, 1)}%</span>
            </>
          ) : (
            hint
          )}
        </span>
      </div>

      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: "30px repeat(12, 1fr) 46px" }}
        onPointerLeave={() => setHot(null)}
      >
        <span />
        {INITIALS.map((m, i) => (
          <span
            key={i}
            className="pb-0.5 text-center text-[9px] text-foreground/45"
            style={{ opacity: hot && hot.m !== i ? 0.4 : 1 }}
          >
            {m}
          </span>
        ))}
        <span className="pb-0.5 text-center text-[9px] text-foreground/45">Yr</span>

        {years.map((year, y) => (
          <div key={year} className="contents">
            <span
              className="flex items-center justify-end pr-1 text-[9.5px] tabular-nums text-foreground/45"
              style={{ opacity: hot && hot.y !== y ? 0.4 : 1 }}
            >
              {`’${String(year).slice(2)}`}
            </span>

            {(returns[y] ?? []).map((r, m) => {
              const on = hot?.y === y && hot?.m === m
              const dim = !!hot && !on && hot.y !== y && hot.m !== m
              return (
                <motion.button
                  key={m}
                  type="button"
                  aria-label={`${MONTHS[m]} ${year} ${signed(r, 1)}%`}
                  onPointerEnter={() => setHot({ y, m })}
                  onFocus={() => setHot({ y, m })}
                  className="grid aspect-square place-items-center rounded-[3px] text-[8px] font-semibold tabular-nums outline-none"
                  style={{
                    background: cellFill(r, on),
                    color: `color-mix(in srgb, var(--foreground) ${Math.round(40 + Math.min(Math.abs(r) / 8, 1) * 45)}%, transparent)`,
                    outline: on ? `1.5px solid ${r >= 0 ? GREEN : RED}` : "none",
                    outlineOffset: "-1.5px",
                  }}
                  initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.6 }}
                  animate={{ opacity: dim ? 0.35 : 1, scale: 1 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: 0.008 * (y * 12 + m) }}
                >
                  {Math.abs(r) >= 4 ? Math.round(r) : ""}
                </motion.button>
              )
            })}

            <span
              className="grid place-items-center rounded-[3px] text-[9px] font-semibold tabular-nums"
              style={{ background: cellFill(totals[y] / 3, false), color: totals[y] >= 0 ? GREEN : RED }}
            >
              {signed(totals[y], 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
