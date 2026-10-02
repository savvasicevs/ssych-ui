"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Heat Calendar, rebuilt through the ssych-component skill (2026-09-29).
   It now sits beside returns-calendar: the same 3px gaps and 3px corners, cells of 24px,
   the same tint of one hue by magnitude, the same lift, ring and dimming on hover.
   What changed against the version before it (in git history), and why:
   · no ring on every cell (107 inner shadows) and no floating card with a shadow: the
     count and the date are plain text under the grid, where the date range is
   · the hue is ink by default, not blue: a count has no direction, so it is one ink at
     many strengths. The cell being pointed at takes the accent ring
   · magnitude is continuous, as in returns-calendar, not five alpha steps; the five
     legend steps stay as the filter
   · hover follows returns-calendar: the cell lifts, its row and column stay lit and the
     rest dim. The ripple through the neighbours is gone
   · day names on the left, the legend steps are real buttons
   PROPS CHANGED:
   · `color` takes any CSS colour and defaults to the foreground token (it was a hex
     string with a blue default). A hex still works
   · `endDate` defaults to a fixed day, 27 Sep 2026, not to the day of viewing, so the
     sample is the same on every render. Pass `endDate` for a live calendar
   Motion (2026-10-01): the cells settle in on the diagonal once the grid is in view (it
   played on mount, off screen too), over about 0.7s; a level filter or new values ease the
   dim and the tint in place, nothing reflows */

const EASE = [0.16, 1, 0.3, 1] as const
/* the house lift spring: cells are physical objects, so they settle instead of easing */
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
const ACCENT = "var(--chart-1)"
/** per diagonal step of the entrance; 22 diagonals on 16 weeks land inside 400ms */
const STAGGER = 0.017

/** Deterministic activity field so demo renders agree (quieter weekends). */
const demoLevel = (w: number, d: number) => {
  const s = Math.sin(w * 12.9898 + d * 78.233) * 43758.5453
  const r = s - Math.floor(s)
  return d >= 5 ? Math.max(0, r - 0.55) * 1.4 : r
}

/** The legend's five steps; a cell belongs to the step its intensity falls in. */
const STEPS = [0, 1, 2, 3, 4]

/** Cell size and gap, as in returns-calendar; every position in the grid derives from these. */
const CELL = 24
const GAP = 3
const MONTH_ROW = 12
const DAY_COL = 26

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name, d) => ({ name, d }))

/** The last day of the sample grid, a Sunday, so the sample never moves. */
const DEFAULT_END = new Date(2026, 8, 27)

const startOfDay = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
/** Monday on or before `d`, so every column reads Mon to Sun, top to bottom. */
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7))

const fmtDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })
const fmtMonth = new Intl.DateTimeFormat("en-US", { month: "short" })
const fmtRange = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

type Cell = { w: number; d: number }

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

/**
 * Weeks of activity as a grid of one hue, stronger where there was more, with month and
 * day names so a date is found without a legend. Cells settle in on a diagonal delay.
 * Pointing at a cell lifts it, keeps its week and weekday lit, dims the rest and reads
 * the count and date under the grid. One click anchors a span, pointing then previews the
 * run with its total, a second click locks it, a third clears it. Pointing at a legend
 * step keeps only that level lit.
 */
export function HeatCalendar({
  unit = "ships",
  weeks = 16,
  maxCount = 14,
  values,
  endDate = DEFAULT_END,
  color = "var(--foreground)",
  className,
}: {
  /** Noun after every count, e.g. "ships", "commits". */
  unit?: string
  weeks?: number
  /** Count a cell at intensity 1.0 represents; a cell reads `intensity × maxCount`. */
  maxCount?: number
  /** `values[week][day]` intensities in 0..1 (7 days per week). Defaults to a deterministic demo field. */
  values?: number[][]
  /** Last day of the grid; the grid ends on that day's week. Defaults to a fixed sample day. */
  endDate?: Date
  /** The single hue, any CSS colour; magnitude is how much of it is mixed in. */
  color?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const canHover = useCanHover()
  const [hover, setHover] = useState<Cell | null>(null)
  const [pinned, setPinned] = useState<Cell | null>(null)
  const [spanEnd, setSpanEnd] = useState<Cell | null>(null)
  const [step, setStep] = useState<number | null>(null)
  /* the entrance owns the cells until it has landed; the hover lift takes over after */
  const [settled, setSettled] = useState(false)
  /* the entrance plays once, when a third of the grid is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const play = !!reduced || seen
  useEffect(() => {
    if (!play) return
    const t = setTimeout(() => setSettled(true), reduced ? 0 : (weeks + 6) * STAGGER * 1000 + 320)
    return () => clearTimeout(t)
  }, [weeks, reduced, play])

  const end = useMemo(() => startOfDay(endDate), [endDate])
  const start = useMemo(() => addDays(mondayOf(end), -(weeks - 1) * 7), [end, weeks])

  const level = (w: number, d: number) => Math.min(1, Math.max(0, values?.[w]?.[d] ?? demoLevel(w, d)))
  const bucket = (v: number) => Math.min(4, Math.floor(v * 5))
  const count = (v: number) => Math.round(v * maxCount)
  const dateOf = (w: number, d: number) => addDays(start, w * 7 + d)
  const future = (w: number, d: number) => dateOf(w, d) > end

  /** magnitude → how much of the one hue is mixed in, never a second colour */
  const tint = (v: number, on: boolean) =>
    `color-mix(in srgb, ${color} ${Math.round(v * 55 + (on ? 22 : 7))}%, transparent)`

  /* one label per month at its first column; the leading label yields if the
     next month starts within two columns, so two labels never overlap */
  const cols = useMemo(() => {
    const list = Array.from({ length: weeks }, (_, w) => {
      const date = addDays(start, w * 7)
      const m = date.getMonth()
      const fresh = w === 0 || addDays(start, (w - 1) * 7).getMonth() !== m
      return { id: `w${w}`, w, m, label: fresh ? fmtMonth.format(date) : null }
    })
    if (list[0] && (list[1]?.label || list[2]?.label)) list[0].label = null
    return list
  }, [start, weeks])

  /** every count on the grid, added up */
  let total = 0
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) if (!future(w, d)) total += count(level(w, d))

  /* one click anchors a span and dims everything else; pointing then previews
     the run from the anchor to the pointer and totals it live, a second click
     locks it so the number stays put, and the next click anywhere clears it */
  const idx = (c: Cell) => c.w * 7 + c.d
  const clear = () => {
    setPinned(null)
    setSpanEnd(null)
  }
  const spanTo = spanEnd ?? (pinned ? (hover ?? pinned) : null)
  const span =
    pinned && spanTo ? { lo: Math.min(idx(pinned), idx(spanTo)), hi: Math.max(idx(pinned), idx(spanTo)) } : null
  let spanTotal = 0
  if (span) {
    for (let i = span.lo; i <= span.hi; i++) {
      if (future(Math.floor(i / 7), i % 7)) break
      spanTotal += count(level(Math.floor(i / 7), i % 7))
    }
  }
  const select = (cell: Cell) => {
    if (spanEnd) clear()
    else if (pinned && idx(pinned) === idx(cell)) setPinned(null)
    else if (pinned) setSpanEnd(cell)
    else setPinned(cell)
  }

  /** the cell the grid reacts to: lift and label highlight follow the pointer */
  const hot = hover ?? spanEnd ?? pinned
  /** the cell the readout speaks for: a locked span keeps it on its end */
  const tip = spanEnd ?? hover ?? pinned
  const hotMonth = hot ? dateOf(hot.w, hot.d).getMonth() : null
  const showSpan = span !== null && span.lo !== span.hi

  const readout = showSpan && span
    ? {
        value: `${spanTotal} ${unit}`,
        note: `${fmtRange.format(addDays(start, span.lo))} to ${fmtRange.format(addDays(start, span.hi))}, ${span.hi - span.lo + 1} days`,
      }
    : tip
      ? { value: `${count(level(tip.w, tip.d))} ${unit}`, note: fmtDay.format(dateOf(tip.w, tip.d)) }
      : { value: `${total} ${unit}`, note: `${fmtRange.format(start)} to ${fmtRange.format(end)}` }

  return (
    <div
      ref={rootRef}
      className={cn("w-fit tabular-nums", className)}
      role="group"
      aria-label={`${unit} per day, ${fmtRange.format(start)} to ${fmtRange.format(end)}, ${total} in total`}
    >
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `${DAY_COL}px repeat(${weeks}, ${CELL}px)`,
          gridTemplateRows: `${MONTH_ROW}px repeat(7, ${CELL}px)`,
          gap: GAP,
        }}
        onPointerLeave={() => setHover(null)}
      >
        {cols.map((c) =>
          c.label ? (
            <span
              key={c.id}
              className={cn(
                "whitespace-nowrap text-[9px] leading-none transition-colors duration-200",
                hotMonth === c.m ? "text-foreground/80" : "text-foreground/45",
              )}
              style={{ gridColumn: c.w + 2, gridRow: 1 }}
            >
              {c.label}
            </span>
          ) : null,
        )}

        {DAYS.map(({ name, d }) =>
          d % 2 === 0 ? (
            <span
              key={name}
              className={cn(
                "flex items-center justify-end pr-1 text-[9px] transition-colors duration-200",
                hot?.d === d ? "text-foreground/80" : "text-foreground/45",
              )}
              style={{ gridColumn: 1, gridRow: d + 2 }}
            >
              {name}
            </span>
          ) : null,
        )}

        {cols.map(({ id, w }) =>
          DAYS.map(({ name, d }) => {
            if (future(w, d)) return null
            const v = level(w, d)
            const i = w * 7 + d
            const on = hot?.w === w && hot?.d === d
            const isEnd = span ? i === span.lo || i === span.hi : pinned?.w === w && pinned?.d === d
            /* a legend step keeps its level; a span keeps its run; a pointed cell keeps its week and weekday */
            const dim =
              step !== null
                ? step !== bucket(v)
                : span
                  ? i < span.lo || i > span.hi
                  : !!hot && !on && hot.w !== w && hot.d !== d
            const lift = settled && on && canHover && !reduced ? 1.15 : 1
            return (
              /* the outer span owns the dim so it never fights the transforms inside */
              <span
                key={`${id}-${name}`}
                className="relative block transition-opacity duration-200"
                style={{ gridColumn: w + 2, gridRow: d + 2, opacity: dim ? 0.35 : 1, zIndex: on ? 1 : 0 }}
              >
                {/* the hit area is the cell plus half the gap on every side, so a fast
                    pointer never falls through; the visual inside takes no pointer events */}
                <motion.button
                  type="button"
                  aria-label={`${count(v)} ${unit} on ${fmtDay.format(dateOf(w, d))}`}
                  aria-pressed={isEnd}
                  onPointerEnter={() => setHover({ w, d })}
                  onFocus={() => setHover({ w, d })}
                  onBlur={() => setHover(null)}
                  onClick={() => select({ w, d })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") clear()
                  }}
                  className="absolute -inset-0.5 block rounded-[4px] outline-none"
                  whileTap={reduced ? undefined : { scale: 0.92, transition: LIFT_SPRING }}
                >
                  <motion.span
                    className="pointer-events-none absolute inset-0.5 block rounded-[3px]"
                    style={{
                      background: tint(v, on),
                      boxShadow: isEnd ? "inset 0 0 0 1.5px var(--foreground)" : on ? `inset 0 0 0 1.5px ${ACCENT}` : "none",
                      transition: "background 150ms, box-shadow 150ms",
                    }}
                    /* cells settle in on a diagonal delay; once landed the pointed cell lifts */
                    initial={reduced ? false : { opacity: 0, scale: 0.8 }}
                    animate={
                      settled
                        ? { opacity: 1, scale: lift, transition: reduced ? { duration: 0 } : LIFT_SPRING }
                        : !play
                          ? { opacity: 0, scale: 0.8 }
                          : {
                              opacity: 1,
                              scale: 1,
                              transition: reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: STAGGER * (w + d) },
                            }
                    }
                  />
                </motion.button>
              </span>
            )
          }),
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-6" style={{ paddingLeft: DAY_COL + GAP }}>
        <span role="status" className="flex items-baseline gap-1.5 whitespace-nowrap text-[10px]">
          {/* the readout swaps in place as the pointer moves: 4px rise, 2px blur, 150ms */}
          <motion.span
            key={`${readout.value}|${readout.note}`}
            className="flex items-baseline gap-1.5"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            <span className="font-medium text-foreground/90">{readout.value}</span>
            <span className="text-foreground/45">{readout.note}</span>
          </motion.span>
        </span>
        {/* pointing at a step keeps only cells of that level lit, so the legend doubles as a filter */}
        <span className="flex items-center gap-[3px]" onPointerLeave={() => setStep(null)}>
          <span className="mr-1 text-[10px] text-foreground/45">Less</span>
          {STEPS.map((s) => (
            <button
              key={s}
              type="button"
              aria-label={`Level ${s + 1} of ${STEPS.length}`}
              aria-pressed={step === s}
              onPointerEnter={() => setStep(s)}
              onFocus={() => setStep(s)}
              onBlur={() => setStep(null)}
              className="h-[11px] w-[11px] rounded-[3px] outline-none transition-transform duration-150"
              style={{ background: tint((s + 0.5) / STEPS.length, step === s), transform: step === s ? "scale(1.25)" : undefined }}
            />
          ))}
          <span className="ml-1 text-[10px] text-foreground/45">More</span>
        </span>
      </div>
    </div>
  )
}
