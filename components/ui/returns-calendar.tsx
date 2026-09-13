"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
/* the house lift spring: cells are physical objects, so they settle instead of easing */
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const COLS = MONTHS.map((name, m) => ({ name, initial: name[0], m }))
/** The compounded column, addressed like a thirteenth month. */
const YEAR = 12

const DEFAULT_YEARS = [2021, 2022, 2023, 2024, 2025]

/** Deterministic sample field so every render agrees (2022 reads as a down year). */
const DEFAULT_RETURNS: number[][] = (() => {
  let seed = 2021
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  return DEFAULT_YEARS.map((_, yi) =>
    MONTHS.map(() => Math.round(((yi === 1 ? -1.6 : 0.9) + (rnd() - 0.5) * 12) * 10) / 10),
  )
})()

/** Compounded return of a run of percentages, in percent: Π(1+r)−1. */
const compound = (run: number[]) => (run.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100

const signed = (v: number, dp: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}`

/** A hue as text: in the light theme its lightness is capped so 9px numbers reach AA
 *  while the chroma stays; in dark it is native (`--ink-l` flips per theme on the root). */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

/** magnitude → tinted fill of the single up/down hue, never a second color */
const tint = (v: number, on: boolean) =>
  `color-mix(in srgb, ${v >= 0 ? GREEN : RED} ${Math.round(Math.min(Math.abs(v) / 8, 1) * 55 + (on ? 22 : 7))}%, transparent)`

/** A hovered or selected cell, with its box inside the grid so the tooltip can hang from it. */
type Hot = { y: number; m: number; left: number; width: number; top: number }
/** Reads the box of the cell wrapper (the button inside it bleeds into the gaps). */
const hotFrom = (el: HTMLElement, y: number, m: number): Hot => {
  const box = el.parentElement ?? el
  return { y, m, left: box.offsetLeft, width: box.offsetWidth, top: box.offsetTop }
}
const same = (a: Hot | null, y: number, m: number) => a?.y === y && a?.m === m

const RING = "inset 0 0 0 1.5px var(--foreground)"

/** Pointer devices only: touch never hovers, so the lift stays off there. */
function useCanHover() {
  const [can, setCan] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover)")
    setCan(mq.matches)
    const onChange = () => setCan(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return can
}

export interface ReturnsCalendarProps {
  /** Row labels, one per row of `returns`. */
  years?: number[]
  /** `returns[year][month]` in percent (12 months per row). */
  returns?: number[][]
  className?: string
}

/**
 * Monthly-returns heat grid: years by months, diverging up/down by magnitude,
 * with a compounded year column. Cells settle in on a diagonal delay. Hovering
 * a month glides a tooltip with its value and dims everything that shares
 * neither its row nor its column; hovering a year total replays that row Jan to
 * Dec. One click anchors a span and dims the rest, hovering then previews the
 * run to the pointer with its compounded return, a second click locks it, a
 * third clears it. The year column selects the same way by whole years.
 */
export function ReturnsCalendar({ years = DEFAULT_YEARS, returns = DEFAULT_RETURNS, className }: ReturnsCalendarProps) {
  const reduced = useReducedMotion()
  const canHover = useCanHover()
  const [hover, setHover] = useState<Hot | null>(null)
  const [pinned, setPinned] = useState<Hot | null>(null)
  const [spanEnd, setSpanEnd] = useState<Hot | null>(null)
  /* the entrance owns the cells until it has landed; the hover lift takes over after */
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), reduced ? 0 : years.length * 12 * 8 + 450)
    return () => clearTimeout(t)
  }, [years.length, reduced])

  const totals = useMemo(() => returns.map(compound), [returns])
  /** every month in order, so a span is one slice */
  const flat = useMemo(() => returns.flat(), [returns])
  const valueAt = (y: number, m: number) => returns[y]?.[m] ?? 0

  /* one click on a month anchors a span and dims everything else; hovering then
     previews the run from the anchor to the pointer and compounds it live, a
     second click locks it, and the next click anywhere clears it */
  const ci = (c: Hot) => c.y * 12 + c.m
  const clear = () => {
    setPinned(null)
    setSpanEnd(null)
  }
  const anchored = pinned !== null && pinned.m !== YEAR
  const spanTo = spanEnd ?? (anchored && hover && hover.m !== YEAR ? hover : null)
  const span =
    anchored && pinned
      ? spanTo
        ? { lo: Math.min(ci(pinned), ci(spanTo)), hi: Math.max(ci(pinned), ci(spanTo)) }
        : { lo: ci(pinned), hi: ci(pinned) }
      : null
  const spanValue = span ? compound(flat.slice(span.lo, span.hi + 1)) : 0

  /* the year column runs its own selection: anchor a year, then a second year
     spans whole years and compounds every month between them */
  const yearAnchored = pinned !== null && pinned.m === YEAR
  const yearTo = spanEnd ?? (yearAnchored && hover && hover.m === YEAR ? hover : null)
  const yearSpan =
    yearAnchored && pinned
      ? { lo: Math.min(pinned.y, (yearTo ?? pinned).y), hi: Math.max(pinned.y, (yearTo ?? pinned).y) }
      : null
  const yearSpanValue = yearSpan ? compound(flat.slice(yearSpan.lo * 12, (yearSpan.hi + 1) * 12)) : 0

  const select = (cell: Hot) => {
    if (spanEnd || same(pinned, cell.y, cell.m)) clear()
    /* extend within the same track, month to month or year to year; a different track re-anchors */
    else if (pinned && (pinned.m === YEAR) === (cell.m === YEAR)) setSpanEnd(cell)
    else {
      setPinned(cell)
      setSpanEnd(null)
    }
  }

  /** the cell the grid reacts to: lift, labels and the year replay follow the pointer */
  const hot = hover ?? spanEnd ?? pinned
  /** the cell the tooltip hangs from: a locked span keeps it on its end */
  const tip = spanEnd ?? hover ?? pinned
  /* the year replay is a plain-hover flourish; held back while a year span is being built */
  const sweepRow = !yearAnchored && hot?.m === YEAR ? hot.y : null
  const showSpan = span !== null && span.lo !== span.hi
  const showYearSpan = yearSpan !== null && yearSpan.lo !== yearSpan.hi
  const tipValue = showYearSpan
    ? yearSpanValue
    : showSpan && span
      ? spanValue
      : tip
        ? tip.m === YEAR
          ? totals[tip.y]
          : valueAt(tip.y, tip.m)
        : 0
  const tipLabel =
    showYearSpan && yearSpan
      ? `${years[yearSpan.lo]} – ${years[yearSpan.hi]}`
      : showSpan && span
        ? `${MONTHS[span.lo % 12]} ${years[Math.floor(span.lo / 12)]} – ${MONTHS[span.hi % 12]} ${years[Math.floor(span.hi / 12)]}`
        : tip
          ? tip.m === YEAR
            ? `${years[tip.y]}`
            : `${MONTHS[tip.m]} ${years[tip.y]}`
          : ""
  const tipNote =
    showYearSpan && yearSpan
      ? `${yearSpan.hi - yearSpan.lo + 1} years`
      : showSpan && span
        ? `${span.hi - span.lo + 1} months`
        : tip?.m === YEAR
          ? "for the year"
          : null
  /* near either edge the tooltip hangs from the cell's outer corner instead of its center */
  const align = tip ? (tip.m <= 1 ? "start" : tip.m >= 10 ? "end" : "center") : "center"
  const tipX = tip ? tip.left + (align === "start" ? 0 : align === "end" ? tip.width : tip.width / 2) : 0
  const tipY = tip ? tip.top : 0

  const enter = (y: number, m: number) => (e: { currentTarget: HTMLElement }) => setHover(hotFrom(e.currentTarget, y, m))
  const press = (y: number, m: number) => (e: { currentTarget: HTMLElement }) => select(hotFrom(e.currentTarget, y, m))
  const clearOnEscape = (e: { key: string }) => {
    if (e.key === "Escape") clear()
  }
  const yearEnd = (y: number) => (yearSpan ? y === yearSpan.lo || y === yearSpan.hi : same(pinned, y, YEAR))

  return (
    <div className={cn("w-[440px] [--ink-l:0.5] dark:[--ink-l:1]", className)}>
      <div
        className="relative grid gap-[3px]"
        style={{ gridTemplateColumns: "30px repeat(12, 1fr) 46px" }}
        onPointerLeave={() => setHover(null)}
      >
        <span />
        {COLS.map((c) => (
          <span
            key={c.name}
            className={cn(
              "pb-0.5 text-center text-[9px] transition-colors duration-200",
              hot?.m === c.m ? "text-foreground/80" : "text-foreground/45",
            )}
          >
            {c.initial}
          </span>
        ))}
        <span
          className={cn(
            "pb-0.5 text-center text-[9px] transition-colors duration-200",
            hot?.m === YEAR ? "text-foreground/80" : "text-foreground/45",
          )}
        >
          Yr
        </span>

        {years.map((year, y) => (
          <div key={year} className="contents">
            <span
              className={cn(
                "flex items-center justify-end pr-1 text-[9.5px] tabular-nums transition-colors duration-200",
                hot?.y === y ? "text-foreground/80" : "text-foreground/45",
              )}
            >
              {`’${String(year).slice(2)}`}
            </span>

            {COLS.map(({ name, m }) => {
              const v = valueAt(y, m)
              const i = y * 12 + m
              const on = same(hot, y, m)
              const isEnd = span ? i === span.lo || i === span.hi : same(pinned, y, m)
              /* a year span lights whole rows; months in the picked years stay lit, the rest dim */
              const dim = span
                ? i < span.lo || i > span.hi
                : yearSpan
                  ? y < yearSpan.lo || y > yearSpan.hi
                  : !!hot && !on && hot.y !== y && hot.m !== m
              const lift = settled && on && canHover && !reduced ? 1.15 : 1
              return (
                /* the outer span owns the dim so it never fights the transforms inside */
                <span
                  key={`${year}-${name}`}
                  className="relative block aspect-square w-full transition-opacity duration-200"
                  style={{ opacity: dim ? 0.35 : 1 }}
                >
                  {/* the hit area is the cell plus half the gap on every side, so a fast
                      pointer never falls through; the visual inside takes no pointer events */}
                  <motion.button
                    type="button"
                    aria-label={`${MONTHS[m]} ${year} ${signed(v, 1)}%`}
                    aria-pressed={isEnd}
                    onPointerEnter={enter(y, m)}
                    onFocus={enter(y, m)}
                    onBlur={() => setHover(null)}
                    onClick={press(y, m)}
                    onKeyDown={clearOnEscape}
                    className="absolute -inset-0.5 block rounded-[4px] outline-none"
                    whileTap={reduced ? undefined : { scale: 0.92, transition: LIFT_SPRING }}
                  >
                    <motion.span
                      className="pointer-events-none absolute inset-0.5 grid place-items-center rounded-[3px] text-[8px] font-semibold tabular-nums"
                      style={{
                        background: tint(v, on),
                        color: `color-mix(in srgb, var(--foreground) ${Math.round(85 + Math.min(Math.abs(v) / 8, 1) * 15)}%, transparent)`,
                        boxShadow: isEnd ? RING : on ? `inset 0 0 0 1.5px ${v >= 0 ? GREEN : RED}` : "none",
                        transition: "background 150ms, box-shadow 150ms",
                      }}
                      /* cells settle in on a diagonal delay; once landed the hovered cell
                         lifts, and hovering the year total replays the row Jan to Dec */
                      initial={reduced ? false : { opacity: 0, scale: 0.6 }}
                      animate={
                        sweepRow === y && !reduced
                          ? { opacity: 1, scale: [1, 1.1, 1], transition: { duration: 0.36, ease: EASE, delay: m * 0.035 } }
                          : settled
                            ? { opacity: 1, scale: lift, transition: LIFT_SPRING }
                            : {
                                opacity: 1,
                                scale: 1,
                                transition: reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: 0.008 * (y * 12 + m) },
                              }
                      }
                    >
                      {Math.abs(v) >= 4 ? Math.round(v) : ""}
                    </motion.span>
                  </motion.button>
                </span>
              )
            })}

            <span
              className="relative block transition-opacity duration-200"
              style={{
                opacity: (
                  span
                    ? y < Math.floor(span.lo / 12) || y > Math.floor(span.hi / 12)
                    : yearSpan
                      ? y < yearSpan.lo || y > yearSpan.hi
                      : hot && hot.y !== y
                )
                  ? 0.35
                  : 1,
              }}
            >
              <motion.button
                type="button"
                aria-label={`${year} ${signed(totals[y], 1)}% for the year`}
                aria-pressed={yearEnd(y)}
                onPointerEnter={enter(y, YEAR)}
                onFocus={enter(y, YEAR)}
                onBlur={() => setHover(null)}
                onClick={press(y, YEAR)}
                onKeyDown={clearOnEscape}
                className="absolute -inset-0.5 block rounded-[4px] outline-none"
                whileTap={reduced ? undefined : { scale: 0.96, transition: LIFT_SPRING }}
              >
                <motion.span
                  className="pointer-events-none absolute inset-0.5 grid place-items-center rounded-[3px] text-[9px] font-semibold tabular-nums"
                  /* a neutral cell under the colored number: a tint of the same hue ate its contrast */
                  style={{
                    background: same(hot, y, YEAR) ? "var(--card)" : "color-mix(in srgb, var(--foreground) 6%, transparent)",
                    color: ink(totals[y] >= 0 ? GREEN : RED),
                    boxShadow: yearEnd(y)
                      ? RING
                      : same(hot, y, YEAR)
                        ? `inset 0 0 0 1.5px ${totals[y] >= 0 ? GREEN : RED}`
                        : "none",
                    transition: "background 150ms, box-shadow 150ms",
                  }}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: 0.008 * (y * 12 + 13) }}
                >
                  {signed(totals[y], 0)}
                </motion.span>
              </motion.button>
            </span>
          </div>
        ))}

        <AnimatePresence>
          {tip ? (
            <motion.div
              key="tip"
              className="pointer-events-none absolute left-0 top-0 z-10"
              initial={false}
              animate={{ x: tipX, y: tipY }}
              transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE }}
            >
              <motion.div
                role="status"
                className={cn(
                  "absolute bottom-1.5 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-foreground/[0.05] px-2.5 py-1 text-[10px] tabular-nums",
                  align === "end" ? "right-0" : "left-0",
                )}
                style={{
                  x: align === "center" ? "-50%" : 0,
                  background: "var(--card)",
                  boxShadow: "0 8px 24px var(--card-shadow, rgba(0,0,0,0.35))",
                }}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 2 }}
                transition={reduced ? { duration: 0 } : { duration: 0.15, ease: EASE }}
              >
                <span className="text-foreground/45">{tipLabel}</span>
                <span className="font-semibold" style={{ color: ink(tipValue >= 0 ? GREEN : RED) }}>
                  {signed(tipValue, 1)}%
                </span>
                {tipNote ? <span className="text-foreground/45">{tipNote}</span> : null}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
