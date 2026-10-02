"use client"

import { useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Gantt Mini, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: a two-week sprint as a strip: who works on what, from when to when,
   and where today falls.
   Read first: the line for today, and the bars it crosses. Those are the strongest ink.
   The pointer: point at a task, or tab to it, and the rest of the plan steps back and its
   bar comes to full strength; its dates, its length and its owner are read out to screen
   readers. Nothing floats.
   Lab sketch: src/components/lab/GanttMini.tsx. Kept: 14 days, a row per task, bars that
   draw in from the left, the weekend tint, the today line, one task read at a time.
   Changed: no card, header band or floating tooltip; bars were green, blue and grey by
   state, each lane now has its own hue and the state is its strength (full while active or
   pointed at); the today line is ink; owners are roles. The state of a task was typed
   beside its dates and could contradict them; it is worked out from the dates and today.
   One sample task sat wholly on a weekend; the plan now runs on working days.
   Since 2026-10-01 the "6 tasks · 3 done · 2 active · 1 upcoming" line is for screen
   readers only, and the rows are 40 tall (were 28) with 8px bars (were 6).
   Formulas:
   · last day of a task = start + span − 1
   · state              = done when the last day is before today, upcoming when the start
                          is after today, otherwise active
   · date of day d      = the sprint's first day + d (Mon Jul 20, so day 9 is Jul 29)
   · done, active, upcoming = count of tasks in each state (sample: 3, 2, 1)
   Motion (2026-10-01): the bars draw in from their start day once the strip is a third in
   view, 30ms apart over 500ms (650ms in all); reduced motion shows them drawn. No data
   changes here, so nothing else moves. */

const EASE = [0.16, 1, 0.3, 1] as const
/* each lane takes its own hue so the tasks are told apart (colour pass, 2026-09-30), in the
   house categorical order; the state stays the strength of that hue. Past six, one "other" ink */
const LANES = ["var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-amber)", "var(--chart-2)", "var(--chart-4)"]

const ROW_H = 40
/** bar thickness; a pill, so its radius is half of this */
const BAR_H = 8
const LABEL_W = 104
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export type GanttState = "done" | "active" | "upcoming"

export interface GanttTask {
  name: string
  /** day offset from the first day of the sprint */
  start: number
  /** length in days */
  span: number
  /** the role that owns the task */
  owner: string
}

export interface GanttMiniProps {
  tasks?: GanttTask[]
  /** the sprint's name, read to assistive tech only */
  title?: string
  /** length of the sprint in days */
  days?: number
  /** day offset of today */
  today?: number
  /** the first day of the sprint; it must be a Monday for the weekend tint to fall right */
  startMonth?: number
  startDay?: number
  className?: string
}

const DEFAULT_TASKS: GanttTask[] = [
  { name: "Design pass", start: 0, span: 3, owner: "Design lead" },
  { name: "API wiring", start: 2, span: 3, owner: "Backend engineer" },
  { name: "Schema migration", start: 7, span: 2, owner: "Data engineer" },
  { name: "Dashboard build", start: 7, span: 4, owner: "Frontend engineer" },
  { name: "QA run", start: 9, span: 3, owner: "QA analyst" },
  { name: "Release prep", start: 11, span: 1, owner: "Release manager" },
]

const STRENGTH: Record<GanttState, number> = { done: 45, active: 100, upcoming: 24 }
const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`
/** lane i at a state's strength; the seventh lane on is one quiet ink */
const laneFill = (i: number, pct: number) => (LANES[i] ? `color-mix(in srgb, ${LANES[i]} ${pct}%, transparent)` : ink(22))

const stateOf = (t: GanttTask, today: number): GanttState => (t.start + t.span - 1 < today ? "done" : t.start > today ? "upcoming" : "active")

/** the date of day d, walking the months of a common year */
function dateOf(d: number, month: number, day: number) {
  let m = month - 1
  let n = day + d
  while (n > MONTH_DAYS[m % 12]) {
    n -= MONTH_DAYS[m % 12]
    m++
  }
  return `${MONTHS[m % 12]} ${n}`
}

/**
 * A sprint strip in the Linear register: a quiet day grid, bars that draw in from the
 * left and a hairline for today. Pointing at a task steps the rest back and reads its
 * dates and owner above the plan.
 */
export function GanttMini({ tasks = DEFAULT_TASKS, title = "Sprint 14", days = 14, today = 9, startMonth = 7, startDay = 20, className }: GanttMiniProps) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<number | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  /* the draw waits until the strip is a third in view, then plays once */
  const play = useInView(boxRef, { once: true, amount: 0.3 }) || !!reduced

  const date = (d: number) => dateOf(d, startMonth, startDay)
  const states = tasks.map((t) => stateOf(t, today))
  const count = (s: GanttState) => states.filter((x) => x === s).length
  const shown = hot === null ? null : tasks[hot]
  const left = (d: number) => `${(d / days) * 100}%`
  /** Saturdays, where the first day is a Monday */
  const weekends = Array.from({ length: Math.ceil(days / 7) }, (_, w) => w * 7 + 5).filter((d) => d < days)
  const weeks = Array.from({ length: Math.ceil(days / 7) }, (_, w) => w * 7)

  return (
    <div
      className={cn("w-full max-w-[520px] tabular-nums", className)}
      role="group"
      aria-label={`${title}, ${tasks.length} tasks, ${count("done")} done, ${count("active")} active, ${count("upcoming")} upcoming, today is ${date(today)}`}
    >
      {/* the readout is for screen readers only (2026-10-01): the counts line read as clutter above
          the plan; the pointed task is still announced */}
      <span role="status" className="sr-only">
        {shown
          ? `${shown.name}, ${shown.span === 1 ? date(shown.start) : `${date(shown.start)} to ${date(shown.start + shown.span - 1)}`}, ${shown.span} ${shown.span === 1 ? "day" : "days"}, ${shown.owner}`
          : `${tasks.length} tasks, ${count("done")} done, ${count("active")} active, ${count("upcoming")} upcoming`}
      </span>

      <div ref={boxRef} className="relative" onPointerLeave={() => setHot(null)}>
        {/* the day grid sits behind the rows, over the track only */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_W }}>
          {weekends.map((d) => (
            <span key={d} className="absolute inset-y-0 bg-foreground/[0.03]" style={{ left: left(d), width: left(Math.min(2, days - d)) }} />
          ))}
          {Array.from({ length: days - 1 }, (_, i) => (
            <span key={i} className="absolute inset-y-0 w-px bg-foreground/[0.05]" style={{ left: left(i + 1) }} />
          ))}
          <span className="absolute inset-y-0 w-px" style={{ left: `calc(${left(today + 0.5)} - 0.5px)`, background: ink(45) }} />
        </div>

        {tasks.map((t, i) => {
          const on = hot === i
          const state = states[i]
          return (
            <button
              key={t.name}
              type="button"
              aria-label={`${t.name}, ${state}, ${date(t.start)} to ${date(t.start + t.span - 1)}, ${t.span} ${t.span === 1 ? "day" : "days"}, ${t.owner}`}
              onPointerEnter={() => setHot(i)}
              onFocus={() => setHot(i)}
              onBlur={() => setHot(null)}
              className="relative flex w-full items-center text-left outline-none transition-opacity duration-200 focus-visible:bg-foreground/[0.04] motion-reduce:transition-none"
              style={{ height: ROW_H, opacity: hot !== null && !on ? 0.4 : 1 }}
            >
              <span className={cn("shrink-0 truncate pr-2 text-[11px]", state === "done" ? "text-foreground/45" : "text-foreground/90")} style={{ width: LABEL_W }}>
                {t.name}
              </span>
              <span className="relative block h-full flex-1">
                <motion.span
                  aria-hidden
                  className="absolute top-1/2 block origin-left -translate-y-1/2 rounded-full"
                  style={{ height: BAR_H, left: left(t.start), width: left(t.span), background: laneFill(i, on ? 100 : STRENGTH[state]), transition: reduced ? "none" : "background 150ms" }}
                  initial={reduced ? false : { scaleX: 0 }}
                  animate={{ scaleX: play ? 1 : 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: Math.min(i, 9) * 0.03 }}
                />
              </span>
            </button>
          )
        })}
      </div>

      <div aria-hidden className="relative mt-1.5 h-3 text-[9px] text-foreground/35" style={{ marginLeft: LABEL_W }}>
        {weeks.map((d) => (
          <span key={d} className="absolute top-0" style={{ left: left(d) }}>
            {date(d)}
          </span>
        ))}
        <span className="absolute top-0 -translate-x-1/2 font-medium text-foreground/70" style={{ left: left(today + 0.5) }}>
          {date(today)}
        </span>
      </div>
    </div>
  )
}
