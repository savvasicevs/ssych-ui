"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { motion, useAnimate, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Date Range Picker, written new through ssych-component (2026-09-29).
   What it is for: choosing the window a board plots, by preset or by two presses on a
   two-month sheet.
   Read first: the filled run of days, and under it the same window in words with its
   length, "Aug 30 – Sep 28, 2026 · 30 days".
   The pointer: the first press drops an end, the days under the pointer fill in behind
   it in the accent, in either direction, and the second press sets the window. Over a
   day with no end down, the line under the sheet reads that day and how far back it is.
   Arrow keys move the day by one or by a week, Page up and Page down by a month, Home
   and End to the ends of the week; Enter presses, Escape lifts a dropped end.
   Sketch: src/components/lab/DateRangePicker.tsx. Kept: two presses with a live band
   between them, the presets, no Apply button, days past the last one the series has
   render but do not answer, the count under the sheet. Changed: the sheet is always
   open (a preview has to render whole), the window is two ISO dates where the sketch
   had two indices and a `dayAt` function from the caller, and the presets are a
   switcher above the sheet, not a rail beside it.
   Reference, ideas only, no code read or taken: the "date range picker" entries on
   browsable (Honest UI, Motion Lexicon). Idea taken: a range being swept looks
   different from one that is set.
   The clock: there is none. Days are whole numbers counted from 1970-01-01 by the
   civil-calendar arithmetic below, so the sheet is the same on every render and in
   every time zone. "Today" is the `today` prop, 2026-09-28 in the sample.
   Formulas:
   · length of a window = to − from + 1, in days, both ends counted
   · 7d, 30d, 90d = today − 6, − 29, − 89 to today; year to date = 1 Jan of today's
     year to today
   · days ago = today − the day being pointed at */

const EASE = [0.16, 1, 0.3, 1] as const
const ACCENT = "var(--chart-1)"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** an inclusive window, both ends as ISO dates (2026-09-28) */
export type DayRange = { from: string; to: string }

export type DateRangePreset = {
  label: string
  /** the long name, read to a screen reader */
  name: string
  /** the window this preset means, in day numbers, given the first and last reachable day */
  range: (min: number, max: number) => { from: number; to: number }
}

export interface DateRangePickerProps {
  /** the window, when the caller owns it */
  value?: DayRange
  /** the window on the first render, when the caller does not */
  defaultValue?: DayRange
  onChange?: (range: DayRange) => void
  /** the last day that can be picked, and the day the presets count back from */
  today?: string
  /** the first day that can be picked */
  min?: string
  presets?: DateRangePreset[]
  className?: string
}

/** day number of a civil date: whole days since 1970-01-01 */
export function toDay(y: number, m: number, d: number) {
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/** the civil date of a day number */
export function fromDay(z: number) {
  const n = z + 719468
  const era = Math.floor(n / 146097)
  const doe = n - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d }
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return toDay(y, m || 1, d || 1)
}
const pad = (n: number) => String(n).padStart(2, "0")
const iso = (z: number) => {
  const c = fromDay(z)
  return `${c.y}-${pad(c.m)}-${pad(c.d)}`
}
/** months since year 0, so two months compare and step as numbers */
const ymOf = (z: number) => {
  const c = fromDay(z)
  return c.y * 12 + c.m - 1
}
const firstOf = (ym: number) => toDay(Math.floor(ym / 12), (ym % 12) + 1, 1)
/** Monday is 0; 1970-01-01 was a Thursday */
const weekday = (z: number) => (((z + 3) % 7) + 7) % 7
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
/** the same day of the month, `by` months away, held inside the shorter month */
const shiftMonths = (z: number, by: number) => {
  const ym = ymOf(z) + by
  const len = firstOf(ym + 1) - firstOf(ym)
  return firstOf(ym) + Math.min(fromDay(z).d, len) - 1
}

const short = (z: number, year: boolean) => {
  const c = fromDay(z)
  return `${MONTHS[c.m - 1].slice(0, 3)} ${c.d}${year ? `, ${c.y}` : ""}`
}
const long = (z: number) => `${WEEKDAYS[weekday(z)]}, ${short(z, true)}`
/** one year when the window stays inside it, two when it straddles */
const rangeText = (from: number, to: number) => `${short(from, fromDay(from).y !== fromDay(to).y)} – ${short(to, true)}`
const daysText = (n: number) => `${n} ${n === 1 ? "day" : "days"}`

export const DEFAULT_PRESETS: DateRangePreset[] = [
  { label: "7d", name: "Last 7 days", range: (min, max) => ({ from: Math.max(min, max - 6), to: max }) },
  { label: "30d", name: "Last 30 days", range: (min, max) => ({ from: Math.max(min, max - 29), to: max }) },
  { label: "90d", name: "Last 90 days", range: (min, max) => ({ from: Math.max(min, max - 89), to: max }) },
  { label: "Year to date", name: "Year to date", range: (min, max) => ({ from: Math.max(min, toDay(fromDay(max).y, 1, 1)), to: max }) },
]

const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`

const NAV =
  "absolute top-0 grid h-6 w-6 place-items-center rounded-full text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:bg-foreground/[0.06] focus-visible:text-foreground/90 disabled:pointer-events-none disabled:opacity-35"

/**
 * A two-month sheet you sweep across: the first press drops an end, the days fill in
 * behind the pointer, the second press sets the window. The presets above it are one
 * quiet switcher for the windows nobody should have to press twice for, and the line
 * under it says the window in words with its length.
 */
export function DateRangePicker({
  value,
  defaultValue = { from: "2026-08-30", to: "2026-09-28" },
  onChange,
  today = "2026-09-28",
  min = "2025-01-01",
  presets = DEFAULT_PRESETS,
  className,
}: DateRangePickerProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const root = useRef<HTMLDivElement>(null)
  /** set by a key press, so the day it moved to takes the focus after the render */
  const follow = useRef(false)
  /** the last move came from the keyboard: the readout then changes at once */
  const viaKey = useRef(false)
  /** the two day grids, slid 8px from the side the page came from when a month button
   *  turns the sheet (250ms, 2px blur); a key that turns it moves at once */
  const [sheet, animateSheet] = useAnimate<HTMLDivElement>()
  const turned = useRef(0)

  const hi = parse(today)
  const lo = Math.min(parse(min), hi)
  const [inner, setInner] = useState(defaultValue)
  const held = value ?? inner
  const set = { from: clamp(parse(held.from), lo, hi), to: clamp(parse(held.to), lo, hi) }

  /** the end dropped by the first press; null between picks */
  const [pick, setPick] = useState<number | null>(null)
  /** the day the band runs to while an end is down */
  const [peek, setPeek] = useState<number | null>(null)
  const [hot, setHot] = useState<number | null>(null)
  /** the day the arrow keys move from */
  const [cursor, setCursor] = useState(set.to)

  /* the left month on the sheet; the right one is the month after it */
  const ymMin = ymOf(lo)
  const ymMax = Math.max(ymMin, ymOf(hi) - 1)
  const [ym, setYm] = useState(clamp(ymOf(set.to) - 1, ymMin, ymMax))

  /* before paint, once the new months are in the DOM, so no frame shows them unmoved */
  useLayoutEffect(() => {
    const by = turned.current
    turned.current = 0
    if (!by || !sheet.current) return
    animateSheet(
      "[data-sheet]",
      reduced ? { opacity: [0, 1] } : { opacity: [0, 1], x: [by * 8, 0], filter: ["blur(2px)", "blur(0px)"] },
      { duration: reduced ? 0.15 : 0.25, ease: EASE },
    )
  }, [ym, animateSheet, reduced, sheet])

  useEffect(() => {
    if (!follow.current) return
    follow.current = false
    root.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)?.focus()
  }, [cursor, ym])

  const commit = (from: number, to: number) => {
    const next = { from: iso(from), to: iso(to) }
    setInner(next)
    onChange?.(next)
  }
  const lift = () => {
    setPick(null)
    setPeek(null)
  }
  const choose = (d: number) => {
    if (pick === null) {
      setPick(d)
      setPeek(d)
      return
    }
    commit(Math.min(pick, d), Math.max(pick, d))
    lift()
  }
  /** bring a day onto the sheet, turning the fewest pages */
  const show = (d: number) => setYm((now) => clamp(ymOf(d) < now ? ymOf(d) : ymOf(d) > now + 1 ? ymOf(d) - 1 : now, ymMin, ymMax))
  const turn = (by: number) => {
    const next = clamp(ym + by, ymMin, ymMax)
    setYm(next)
    if (next !== ym) turned.current = by < 0 ? -1 : 1
    /* the key cursor comes along, so Tab still lands on the sheet */
    if (ymOf(cursor) < next || ymOf(cursor) > next + 1) setCursor(clamp(by < 0 ? firstOf(next + 2) - 1 : firstOf(next), lo, hi))
  }

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && pick !== null) {
      e.stopPropagation()
      lift()
      return
    }
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    let next: number | null = null
    if (e.key in step) next = cursor + step[e.key]
    else if (e.key === "PageUp") next = shiftMonths(cursor, -1)
    else if (e.key === "PageDown") next = shiftMonths(cursor, 1)
    else if (e.key === "Home") next = cursor - weekday(cursor)
    else if (e.key === "End") next = cursor + 6 - weekday(cursor)
    if (next === null) return
    e.preventDefault()
    viaKey.current = true
    next = clamp(next, lo, hi)
    follow.current = true
    setCursor(next)
    setHot(next)
    if (pick !== null) setPeek(next)
    show(next)
  }

  const sweeping = pick !== null
  const band = pick !== null ? { from: Math.min(pick, peek ?? pick), to: Math.max(pick, peek ?? pick) } : set
  const length = band.to - band.from + 1

  const viewFrom = firstOf(ym)
  const viewTo = firstOf(ym + 2) - 1
  /** the one day Tab lands on */
  const stop = cursor >= viewFrom && cursor <= viewTo ? cursor : clamp(viewFrom, lo, hi)

  const fill = sweeping ? `color-mix(in srgb, ${ACCENT} 18%, transparent)` : ink(8)
  const ease = reduced ? "none" : "background-color 150ms, color 150ms"

  return (
    <div
      ref={root}
      className={cn("w-[416px] max-w-full tabular-nums", className)}
      role="group"
      aria-label={`Date range, ${rangeText(set.from, set.to)}, ${daysText(set.to - set.from + 1)}`}
    >
      <div className="inline-flex rounded-full bg-foreground/[0.04] p-0.5">
        {presets.map((p) => {
          const r = p.range(lo, hi)
          const on = !sweeping && r.from === set.from && r.to === set.to
          return (
            <button
              key={p.label}
              type="button"
              aria-label={p.name}
              aria-pressed={on}
              onClick={() => {
                commit(r.from, r.to)
                lift()
                setCursor(r.to)
                setYm(clamp(ymOf(r.to) - 1, ymMin, ymMax))
              }}
              className={cn(
                "relative h-7 rounded-full px-3 text-[11px] font-medium outline-none transition-colors duration-150 focus-visible:bg-foreground/[0.06]",
                on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/70",
              )}
            >
              {on &&
                (reduced ? (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
                ) : (
                  <motion.span
                    aria-hidden
                    layoutId={`range-${uid}`}
                    className="absolute inset-0 rounded-full bg-foreground/[0.08]"
                    transition={{ duration: 0.25, ease: EASE }}
                  />
                ))}
              <span className="relative">{p.label}</span>
            </button>
          )
        })}
      </div>

      <div ref={sheet} className="mt-4 flex gap-6" onKeyDown={onKey} onPointerLeave={() => setHot(null)}>
        {[ym, ym + 1].map((m, side) => {
          const first = firstOf(m)
          const count = firstOf(m + 1) - first
          const lead = weekday(first)
          const title = `${MONTHS[m % 12]} ${Math.floor(m / 12)}`
          return (
            <div key={m} role="group" aria-label={title} className="w-[196px] shrink-0">
              <div className="relative flex h-6 items-center justify-center">
                {side === 0 && (
                  <button type="button" aria-label="Earlier month" disabled={ym <= ymMin} onClick={() => turn(-1)} className={cn(NAV, "left-0")}>
                    <svg aria-hidden width="5" height="8" viewBox="0 0 5 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 1L1 4l3 3" />
                    </svg>
                  </button>
                )}
                <span className="text-[11.5px] font-medium text-foreground/90">{title}</span>
                {side === 1 && (
                  <button type="button" aria-label="Later month" disabled={ym >= ymMax} onClick={() => turn(1)} className={cn(NAV, "right-0")}>
                    <svg aria-hidden width="5" height="8" viewBox="0 0 5 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 1l3 3-3 3" />
                    </svg>
                  </button>
                )}
              </div>

              <div aria-hidden className="mt-2 grid grid-cols-[repeat(7,28px)]">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="pb-1 text-center text-[9px] text-foreground/35">
                    {w[0]}
                  </span>
                ))}
              </div>

              {/* six weeks tall whatever the month, so the line under the sheet never jumps */}
              <div data-sheet className="grid min-h-[168px] grid-cols-[repeat(7,28px)] content-start">
                {Array.from({ length: lead + count }, (_, i) => {
                  if (i < lead) return <span key={i} className="block h-7 w-7" />
                  const d = first + i - lead
                  const col = i % 7
                  const off = d < lo || d > hi
                  const inBand = d >= band.from && d <= band.to
                  const edge = d === band.from || d === band.to
                  const opens = inBand && (d === band.from || col === 0 || d === first)
                  const closes = inBand && (d === band.to || col === 6 || d === first + count - 1)
                  return (
                    /* the cell paints the run, so the fill is unbroken from day to day */
                    <span
                      key={i}
                      className={cn("block h-7 w-7", opens && "rounded-l-[4px]", closes && "rounded-r-[4px]")}
                      style={{ background: inBand ? fill : undefined, transition: ease }}
                    >
                      <button
                        type="button"
                        data-day={d}
                        disabled={off}
                        tabIndex={d === stop ? 0 : -1}
                        aria-label={`${long(d)}${d === hi ? ", today" : ""}`}
                        aria-pressed={inBand}
                        aria-current={d === hi ? "date" : undefined}
                        onClick={() => choose(d)}
                        onPointerEnter={() => {
                          viaKey.current = false
                          setHot(d)
                          if (pick !== null) setPeek(d)
                        }}
                        onFocus={() => {
                          setCursor(d)
                          setHot(d)
                          if (pick !== null) setPeek(d)
                        }}
                        onBlur={() => setHot(null)}
                        className={cn(
                          "relative h-7 w-7 rounded-[4px] text-[10.5px] outline-none disabled:pointer-events-none",
                          edge ? "font-semibold" : "hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.1]",
                        )}
                        style={{
                          background: edge ? (sweeping ? ACCENT : ink(90)) : undefined,
                          color: edge ? "var(--background)" : ink(off ? 20 : inBand ? 90 : 70),
                          transition: ease,
                        }}
                      >
                        {fromDay(d).d}
                        {d === hi && <span aria-hidden className="absolute bottom-[3px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-current" />}
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div role="status" className="mt-3 border-t border-foreground/[0.05] pt-2 text-[10.5px]">
        {/* the line crosses over as the pointer moves between days (4px, 2px blur, 150ms);
            a key press changes it at once */}
        <motion.div
          key={hot !== null && !sweeping ? `d${hot}` : `r${band.from}-${band.to}`}
          className="flex items-baseline justify-between"
          initial={viaKey.current ? false : reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
        {hot !== null && !sweeping ? (
          <>
            <span className="font-medium text-foreground/90">{long(hot)}</span>
            <span className="text-foreground/45">{hot === hi ? "today" : `${daysText(hi - hot)} ago`}</span>
          </>
        ) : (
          <>
            <span className="font-medium text-foreground/90">{rangeText(band.from, band.to)}</span>
            <span className="text-foreground/45">{daysText(length)}</span>
          </>
        )}
        </motion.div>
      </div>
    </div>
  )
}
