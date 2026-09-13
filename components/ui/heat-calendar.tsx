"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
/* the house lift spring: cells are physical objects, so they settle instead of easing */
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const

/** Deterministic activity field so demo renders agree (quieter weekends). */
const demoLevel = (w: number, d: number) => {
  const s = Math.sin(w * 12.9898 + d * 78.233) * 43758.5453
  const r = s - Math.floor(s)
  return d >= 5 ? Math.max(0, r - 0.55) * 1.4 : r
}

/** Sequential encoding: one hue, magnitude is its alpha, never a second color. */
const ALPHA = [0.04, 0.14, 0.3, 0.5, 0.75]

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "")
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)].join(",")
}

/** Cell size and gap; every position in the grid and the tooltip derive from these. */
const CELL = 14
const GAP = 4
const PITCH = CELL + GAP
const MONTH_ROW = 12

const DAYS = Array.from({ length: 7 }, (_, d) => ({ id: `d${d}`, d }))

/** How far a cell rises when it is the hovered one, its neighbour, or two away. */
const LIFT = [1.3, 1.08, 1.03]

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

/** Pointer devices only: touch never hovers, so the ripple stays off there. */
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
 * Weeks of activity as a sequential single-hue grid with month labels, so the
 * eye needs no legend to find a date. Columns settle in left to right. Hovering
 * a cell lifts it and its neighbours in a small ripple and glides a tooltip
 * with the date and exact count. One click anchors a span and dims the rest,
 * hovering then previews the run to the pointer with its total, a second click
 * locks it, a third clears it. Hovering a legend step keeps only that level lit.
 */
export function HeatCalendar({
  unit = "ships",
  weeks = 16,
  maxCount = 14,
  values,
  endDate,
  color = "#4790E4",
  className,
}: {
  /** Noun after every count, e.g. "ships", "commits". */
  unit?: string
  weeks?: number
  /** Count a cell at intensity 1.0 represents; a cell reads `intensity × maxCount`. */
  maxCount?: number
  /** `values[week][day]` intensities in 0..1 (7 days per week). Defaults to a deterministic demo field. */
  values?: number[][]
  /** Last day of the grid. Defaults to today; the grid ends on that day's week. */
  endDate?: Date
  /** The single hue as hex; magnitude maps to its alpha. */
  color?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const canHover = useCanHover()
  const [hover, setHover] = useState<Cell | null>(null)
  const [pinned, setPinned] = useState<Cell | null>(null)
  const [spanEnd, setSpanEnd] = useState<Cell | null>(null)
  const [step, setStep] = useState<number | null>(null)
  /* the entrance owns the cells until it has landed; the ripple takes over after */
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), reduced ? 0 : weeks * 35 + 450)
    return () => clearTimeout(t)
  }, [weeks, reduced])

  /* "today" is read after mount so the server and a viewer on another calendar
     day render the same HTML first; an explicit `endDate` is deterministic */
  const [today, setToday] = useState<Date | null>(null)
  useEffect(() => setToday(startOfDay(new Date())), [])
  const end = useMemo(() => (endDate ? startOfDay(endDate) : today), [endDate, today])
  const start = useMemo(() => (end ? addDays(mondayOf(end), -(weeks - 1) * 7) : null), [end, weeks])

  const rgb = hexToRgb(color)
  const level = (w: number, d: number) => values?.[w]?.[d] ?? demoLevel(w, d)
  const bucket = (v: number) => Math.min(4, Math.floor(v * 5))
  const fill = (b: number) => `rgba(${rgb},${ALPHA[b]})`
  const count = (v: number) => Math.round(v * maxCount)
  const dateOf = (w: number, d: number) => (start ? addDays(start, w * 7 + d) : null)
  const future = (w: number, d: number) => {
    const date = dateOf(w, d)
    return end !== null && date !== null && date > end
  }

  /* one label per month at its first column; the leading label yields if the
     next month starts within two columns, so two labels never overlap */
  const cols = useMemo(() => {
    const list = Array.from({ length: weeks }, (_, w) => {
      const date = start ? addDays(start, w * 7) : null
      const m = date ? date.getMonth() : -1
      const fresh = start !== null && date !== null && (w === 0 || addDays(start, (w - 1) * 7).getMonth() !== m)
      return { id: `w${w}`, w, m, label: fresh && date ? fmtMonth.format(date) : null }
    })
    if (list[1]?.label || list[2]?.label) list[0].label = null
    return list
  }, [start, weeks])

  /* one click anchors a span and dims everything else; hovering then previews
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

  /** the cell the grid reacts to: lift, ripple and label highlight follow the pointer */
  const hot = hover ?? spanEnd ?? pinned
  /** the cell the tooltip hangs from: a locked span keeps it on its end */
  const tip = spanEnd ?? hover ?? pinned
  const tipDate = tip ? dateOf(tip.w, tip.d) : null
  const hotMonth = hot ? (dateOf(hot.w, hot.d)?.getMonth() ?? null) : null
  /* the tooltip is one element that glides between cells; near either edge it
     hangs from the cell's outer corner instead of its center so it stays inside */
  const align = tip ? (tip.w < 3 ? "start" : tip.w > weeks - 4 ? "end" : "center") : "center"
  const tipX = tip ? tip.w * PITCH + (align === "start" ? 0 : align === "end" ? CELL : CELL / 2) : 0
  const tipY = tip ? MONTH_ROW + GAP + tip.d * PITCH : 0

  return (
    <div className={cn("w-fit", className)}>
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `repeat(${weeks}, ${CELL}px)`,
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
                hotMonth === c.m ? "text-foreground/80" : "text-foreground/30",
              )}
              style={{ gridColumn: c.w + 1, gridRow: 1 }}
            >
              {c.label}
            </span>
          ) : null,
        )}

        {cols.map(({ id, w }) =>
          DAYS.map(({ id: dayId, d }) => {
            const date = dateOf(w, d)
            if (future(w, d)) return null
            const v = level(w, d)
            const b = bucket(v)
            const i = w * 7 + d
            const on = hot?.w === w && hot?.d === d
            const isEnd = span ? i === span.lo || i === span.hi : pinned?.w === w && pinned?.d === d
            const dim = (step !== null && step !== b) || (span !== null && (i < span.lo || i > span.hi))
            /* the ripple: the hovered cell rises most, the ring around it a little, two out barely */
            const dist = hot ? Math.max(Math.abs(hot.w - w), Math.abs(hot.d - d)) : 9
            const lift = reduced ? 1 : dist === 0 ? LIFT[0] : canHover && dist < LIFT.length ? LIFT[dist] : 1
            return (
              /* the outer span owns the dim so it never fights the transforms inside */
              <span
                key={`${id}-${dayId}`}
                className="relative block h-[14px] w-[14px] transition-opacity duration-200"
                style={{ gridColumn: w + 1, gridRow: d + 2, opacity: dim ? 0.25 : 1, zIndex: lift > 1 ? LIFT.length - dist : 0 }}
              >
                {/* the hit area is the cell plus half the gap on every side, so a fast
                    pointer never falls through; the visual inside takes no pointer events,
                    so a lifted neighbour cannot steal a click either */}
                <motion.button
                  type="button"
                  aria-label={`${count(v)} ${unit}${date ? ` on ${fmtDay.format(date)}` : ""}`}
                  aria-pressed={isEnd}
                  onPointerEnter={() => setHover({ w, d })}
                  onFocus={() => setHover({ w, d })}
                  onBlur={() => setHover(null)}
                  onClick={() => select({ w, d })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") clear()
                  }}
                  className="absolute -inset-0.5 block rounded-[5px] outline-none"
                  whileTap={reduced ? undefined : { scale: 0.9, transition: LIFT_SPRING }}
                >
                  <motion.span
                    className="pointer-events-none absolute inset-0.5 block rounded-[3.5px]"
                    style={{
                      background: fill(b),
                      boxShadow: isEnd
                        ? "inset 0 0 0 1.5px var(--foreground)"
                        : on
                          ? "inset 0 0 0 1px color-mix(in srgb, var(--foreground) 40%, transparent)"
                          : "inset 0 0 0 1px color-mix(in srgb, var(--foreground) 3%, transparent)",
                      transition: "box-shadow 150ms",
                    }}
                    /* columns settle in left to right; once landed, the ripple spreads
                       out from the hovered cell by distance */
                    initial={reduced ? false : { opacity: 0 }}
                    animate={
                      settled
                        ? { opacity: 1, scale: lift, transition: { ...LIFT_SPRING, delay: Math.min(dist, 3) * 0.03 } }
                        : { opacity: 1, scale: 1, transition: reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: w * 0.035 } }
                    }
                  />
                </motion.button>
              </span>
            )
          }),
        )}

        <AnimatePresence>
          {tip && tipDate ? (
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
                {span && span.lo !== span.hi ? (
                  <>
                    <span className="font-medium text-foreground/85">
                      {spanTotal} {unit}
                    </span>
                    <span className="text-foreground/45">
                      {start ? `${fmtRange.format(addDays(start, span.lo))} – ${fmtRange.format(addDays(start, span.hi))}` : ""}
                    </span>
                    <span className="text-foreground/45">{span.hi - span.lo + 1} days</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground/85">
                      {count(level(tip.w, tip.d))} {unit}
                    </span>
                    <span className="text-foreground/45">{fmtDay.format(tipDate)}</span>
                  </>
                )}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-between gap-6">
        <span className="text-[10px] tabular-nums text-foreground/45">
          {start && end ? `${fmtRange.format(start)} – ${fmtRange.format(end)}` : " "}
        </span>
        {/* hovering a step keeps only cells of that level lit, so the legend doubles as a filter */}
        <span className="flex items-center gap-1" onPointerLeave={() => setStep(null)}>
          <span className="mr-0.5 text-[10px] text-foreground/30">less</span>
          {ALPHA.map((a, i) => (
            <span
              key={a}
              onPointerEnter={() => setStep(i)}
              className="h-[11px] w-[11px] rounded-[3px] transition-transform duration-150"
              style={{ background: fill(i), transform: step === i ? "scale(1.25)" : undefined }}
            />
          ))}
          <span className="ml-0.5 text-[10px] text-foreground/30">more</span>
        </span>
      </div>
    </div>
  )
}
