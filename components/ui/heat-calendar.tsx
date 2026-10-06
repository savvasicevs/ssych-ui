"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { LiveFigure } from "@/components/ui/live-figure"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { cn } from "@/lib/utils"

/* Heat Calendar, rebuilt through the ssych-component skill (2026-09-29).
   It now sits beside returns-calendar: the same 3px gaps and 3px corners, the same tint of
   one hue by magnitude.
   What changed against the version before it (in git history), and why:
   · no ring on every cell (107 inner shadows) and no floating card with a shadow
   · the hue is ink by default, not blue: a count has no direction, so it is one ink at
     many strengths
   · magnitude is continuous, as in returns-calendar, not five alpha steps
   · day names on the left
   PROPS CHANGED:
   · `color` takes any CSS colour and defaults to the foreground token (it was a hex
     string with a blue default). A hex still works
   · `endDate` defaults to a fixed day, not to the day of viewing, so the sample is the
     same on every render. Pass `endDate` for a live calendar
   Motion (2026-10-01): the cells settle in on the diagonal once the grid is in view (it
   played on mount, off screen too), over about 0.7s
   2026-10-02 audit: nothing sums the grid at rest; the grid is 440 wide, the width of
   Returns Calendar; the pointed cell's ring is ink, since a count has no hue.
   2026-10-02 round 2: his idea, a transaction calendar. It now reads a real account, an
   operating account (••4821) with its daily card, ACH and wire activity: busy weekdays,
   quiet weekends, a vendor run on the first business day of the month and payroll on the
   15th and the last business day. Each cell is a day, tinted by the money moved that day.
   The header is the library's three tiers: the account at /45 with its number at /90, the
   selected day's amount at 26px with its cents at /35, then the day's transaction count
   and its date. There is one selected box at a time and it starts on the last day: a
   click selects another, pointing previews a day in the header, and nothing else lights
   up or dims (the row and column crosshair and the span selection are gone, and so is the
   Less/More legend, since the header reads any day exactly). A SegmentedControl in the
   header picks the time frame, 3M, 6M or 1Y (13, 26 or 52 weeks); the grid always fills
   the same 440 by 145 box, so switching never changes the size: the rows keep their 16px
   height and the columns share the width (cells are 29, 13 or 6px wide). Arrow keys walk
   the days (one focusable cell, the selected one), Enter selects, Escape goes back to the
   last day. New props: `transactions`, `account`, `accountNumber`, `currency`, `locale`,
   `defaultRange`, `onRangeChange`, `onSelectDay`. Old props still work: `values` with
   `maxCount` gives counts only (the headline is then the count), and `weeks`, when passed,
   fixes the window, hides the time frame switch and draws square cells.
   Formulas:
   · a day's count and amount come from `transactions` (one entry per day, oldest first,
     the last on endDate); with `values` a day's count = round(intensity × maxCount)
   · a cell's strength = √(the day's amount ÷ the largest day's amount in the window), or
     √(count ÷ the largest count) with no amounts; its tint = 7 + strength × 58 percent of
     `color`
   · the sample day: weekdays 24 to 47 transactions (9 more on Mondays) at an average of
     $1,800 to $4,200; weekends 0 to 6 card payments of $60 to $400; payroll adds 46 to 53
     transactions and $418,000 to $454,000; the first business day adds 6 and $86,000 to
     $98,000 */

const EASE = [0.16, 1, 0.3, 1] as const
/** the pointed cell's ring: ink, since a count has no direction (the selected ring is full ink) */
const HOVER_RING = "inset 0 0 0 1.5px color-mix(in srgb, var(--foreground) 55%, transparent)"
const SELECTED_RING = "inset 0 0 0 1.5px var(--foreground)"

type Range = "3M" | "6M" | "1Y"
const RANGES: Range[] = ["3M", "6M", "1Y"]
const RANGE_WEEKS: Record<Range, number> = { "3M": 13, "6M": 26, "1Y": 52 }
const RANGE_WORDS: Record<Range, string> = { "3M": "3 months", "6M": "6 months", "1Y": "year" }

/** the grid: a day column, then the weeks sharing the rest of the 440px width */
const WIDTH = 440
const DAY_COL = 24
const MONTH_ROW = 12
/** rows keep one height in every time frame, so the box never changes size */
const ROW_H = 16
const ROW_GAP = 3

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name, d) => ({ name, d }))

/** The last day of the sample grid, the last business day of September 2026 (a payroll day). */
const DEFAULT_END = new Date(2026, 8, 30)

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
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const fmtDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })
const fmtMonth = new Intl.DateTimeFormat("en-US", { month: "short" })
const fmtRange = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

export interface TransactionDay {
  /** transactions that day */
  count: number
  /** money moved that day, in `currency` */
  amount: number
}

/* ---- the sample account: same date, same day, in every time frame ---- */

/** a stable 0..1 from an integer (an integer hash, so neighbouring days do not correlate) */
const hash = (n: number) => {
  let t = (n * 2654435761) >>> 0
  t ^= t >>> 15
  t = Math.imul(t, 2246822519) >>> 0
  t ^= t >>> 13
  t = Math.imul(t, 3266489917) >>> 0
  t ^= t >>> 16
  return (t >>> 0) / 4294967296
}
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6
/** the last business day on or before a day of a month */
const lastBizOnOrBefore = (y: number, m: number, day: number) => {
  let d = new Date(y, m, day)
  while (isWeekend(d)) d = addDays(d, -1)
  return d
}
const firstBiz = (y: number, m: number) => {
  let d = new Date(y, m, 1)
  while (isWeekend(d)) d = addDays(d, 1)
  return d
}
const cents = (v: number) => Math.round(v * 100) / 100

function sampleDay(date: Date): TransactionDay {
  const k = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
  const r1 = hash(k)
  const r2 = hash(k + 7919)
  const r3 = hash(k + 104729)
  if (isWeekend(date)) {
    const count = Math.floor(r1 * 7)
    return { count, amount: cents(count * (60 + r2 * 340)) }
  }
  const y = date.getFullYear()
  const m = date.getMonth()
  let count = 24 + Math.floor(r1 * 24) + (date.getDay() === 1 ? 9 : 0)
  let amount = count * (1800 + r2 * 2400)
  const lastDay = new Date(y, m + 1, 0).getDate()
  if (sameDay(date, lastBizOnOrBefore(y, m, 15)) || sameDay(date, lastBizOnOrBefore(y, m, lastDay))) {
    count += 46 + Math.floor(r3 * 8)
    amount += 418_000 + r3 * 36_000
  }
  if (sameDay(date, firstBiz(y, m))) {
    count += 6
    amount += 86_000 + r3 * 12_000
  }
  return { count, amount: cents(amount) }
}

type Cell = { w: number; d: number }

/** arrow keys walk the days: a week sideways, a day up or down */
const KEY_STEP: Record<string, number | undefined> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }

/**
 * A transaction calendar: one cell per day, tinted by the money that moved, with month and
 * day names so a date is found without a legend. The header reads the selected day (the
 * last one to start), pointing previews another, a click selects it. A switch in the header
 * picks 3, 6 or 12 months in the same box.
 */
export function HeatCalendar({
  unit = "transactions",
  weeks,
  maxCount = 14,
  values,
  transactions,
  endDate = DEFAULT_END,
  color = "var(--foreground)",
  account,
  accountNumber,
  currency = "USD",
  locale = "en-US",
  defaultRange = "3M",
  onRangeChange,
  onSelectDay,
  className,
}: {
  /** Noun after every count, e.g. "transactions", "payments". */
  unit?: string
  /** Fixes the window to this many weeks and hides the time frame switch (cells then go square). */
  weeks?: number
  /** With `values`: the count a cell at intensity 1.0 represents; a cell reads `intensity × maxCount`. */
  maxCount?: number
  /** `values[week][day]` intensities in 0..1 (7 days per week), counts only. `transactions` wins when both are given. */
  values?: number[][]
  /** One entry per day, oldest first, the last on `endDate`. Defaults to a sample operating account. */
  transactions?: TransactionDay[]
  /** Last day of the grid; the grid ends on that day's week. Defaults to a fixed sample day. */
  endDate?: Date
  /** The single hue, any CSS colour; magnitude is how much of it is mixed in. */
  color?: string
  /** the account's name, on the label row's left; defaults to the sample's, and with `values`
   *  alone (a plain activity grid) there is no label row unless one is passed */
  account?: string
  /** the account's masked number, on the label row's right */
  accountNumber?: string
  currency?: string
  locale?: string
  /** the time frame it opens on */
  defaultRange?: Range
  onRangeChange?: (range: Range) => void
  /** fires when a day is selected */
  onSelectDay?: (day: { date: Date; count: number; amount?: number }) => void
  className?: string
}) {
  const reduced = useReducedMotion()
  /* a plain activity grid (`values` alone) names no account unless asked to */
  const plain = !!values && !transactions
  const acct = account ?? (plain ? undefined : "Operating account")
  const acctNo = accountNumber ?? (plain ? undefined : "••4821")
  const [range, setRange] = useState<Range>(defaultRange)
  const fixedWeeks = weeks != null && weeks > 0
  const nWeeks = fixedWeeks ? Math.round(weeks) : RANGE_WEEKS[range]
  const colGap = nWeeks > 40 ? 2 : 3
  const [hover, setHover] = useState<Cell | null>(null)
  const [selected, setSelected] = useState<Cell | null>(null)
  /* the entrance plays once, when a third of the grid is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const play = !!reduced || seen
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!play) return
    const t = setTimeout(() => setSettled(true), reduced ? 0 : 760)
    return () => clearTimeout(t)
  }, [reduced, play])
  const stagger = 0.4 / (nWeeks + 6)

  const end = useMemo(() => startOfDay(endDate), [endDate])
  const start = useMemo(() => addDays(mondayOf(end), -(nWeeks - 1) * 7), [end, nWeeks])
  const dateOf = (c: Cell) => addDays(start, c.w * 7 + c.d)
  const future = (c: Cell) => dateOf(c) > end
  const lastCell: Cell = { w: nWeeks - 1, d: (end.getDay() + 6) % 7 }

  /* every day of the window: from `transactions`, from `values`, or the sample account */
  const days = useMemo(() => {
    const total = nWeeks * 7
    const out: { count: number; amount?: number }[] = []
    const lastIdx = (nWeeks - 1) * 7 + ((end.getDay() + 6) % 7)
    for (let i = 0; i < total; i++) {
      const w = Math.floor(i / 7)
      const d = i % 7
      if (transactions) {
        const t = transactions[transactions.length - 1 - (lastIdx - i)]
        out.push(t ? { count: t.count, amount: t.amount } : { count: 0, amount: 0 })
      } else if (values) {
        const v = Math.min(1, Math.max(0, values[w]?.[d] ?? 0))
        out.push({ count: Math.round(v * maxCount) })
      } else {
        out.push(sampleDay(addDays(start, i)))
      }
    }
    return out
  }, [nWeeks, end, start, transactions, values, maxCount])
  const hasAmount = days.some((x) => x.amount != null)
  const dayAt = (c: Cell) => days[c.w * 7 + c.d] ?? { count: 0 }

  /** the largest day in the window, the top of the tint */
  let peak = 0
  for (let i = 0; i < days.length; i++) {
    if (future({ w: Math.floor(i / 7), d: i % 7 })) continue
    peak = Math.max(peak, hasAmount ? (days[i].amount ?? 0) : days[i].count)
  }
  const strength = (c: Cell) => {
    const x = dayAt(c)
    return Math.sqrt((hasAmount ? (x.amount ?? 0) : x.count) / (peak || 1))
  }
  /** magnitude → how much of the one hue is mixed in, never a second colour */
  const tint = (s: number) => `color-mix(in srgb, ${color} ${Math.round(7 + s * 58)}%, transparent)`

  const money = useMemo(() => new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }), [locale, currency])
  const countText = (n: number) => `${n.toLocaleString(locale)} ${n === 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit}`

  /* one label per month at its first column; the leading label yields if the next month
     starts within two columns, so two labels never overlap */
  const cols = useMemo(() => {
    const list = Array.from({ length: nWeeks }, (_, w) => {
      const date = addDays(start, w * 7)
      const m = date.getMonth()
      const fresh = w === 0 || addDays(start, (w - 1) * 7).getMonth() !== m
      return { id: `w${w}`, w, m, label: fresh ? fmtMonth.format(date) : null }
    })
    if (list[0] && (list[1]?.label || list[2]?.label)) list[0].label = null
    if (nWeeks > 40) for (let w = 1; w < list.length; w++) if (list[w].label && list.slice(Math.max(0, w - 3), w).some((c) => c.label)) list[w].label = null
    return list
  }, [start, nWeeks])

  /* one selected box at a time; it starts on the last day, and a new time frame resets it */
  const sel = selected && !future(selected) && selected.w < nWeeks ? selected : lastCell
  const tip = hover ?? sel
  const tipDay = dayAt(tip)
  const idx = (c: Cell) => c.w * 7 + c.d

  const select = (c: Cell) => {
    setSelected(c)
    const x = dayAt(c)
    onSelectDay?.({ date: dateOf(c), count: x.count, amount: x.amount })
  }
  const focusCell = (c: Cell) => {
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-i="${idx(c)}"]`)
    el?.focus()
  }
  const onKey = (e: React.KeyboardEvent, c: Cell) => {
    const step = KEY_STEP[e.key]
    if (step != null) {
      e.preventDefault()
      const i = Math.max(0, Math.min(idx(lastCell), idx(c) + step))
      focusCell({ w: Math.floor(i / 7), d: i % 7 })
    } else if (e.key === "Escape") {
      setSelected(null)
      focusCell(lastCell)
    }
  }

  const [headWhole, headCents] = (() => {
    if (!hasAmount) return [countText(tipDay.count), ""]
    const t = money.format(tipDay.amount ?? 0)
    const at = t.lastIndexOf(".")
    return at < 0 ? [t, ""] : [t.slice(0, at), t.slice(at)]
  })()

  let total = 0
  let totalAmount = 0
  for (let i = 0; i < days.length; i++) {
    if (future({ w: Math.floor(i / 7), d: i % 7 })) continue
    total += days[i].count
    totalAmount += days[i].amount ?? 0
  }

  return (
    <div
      ref={rootRef}
      className={cn("w-[440px] max-w-full tabular-nums", className)}
      role="group"
      aria-label={`${acct ? `${acct}, ` : ""}${unit} per day, ${fmtRange.format(start)} to ${fmtRange.format(end)}: ${countText(total)}${hasAmount ? `, ${money.format(totalAmount)} in total` : ""}`}
    >
      {/* the header, three tiers (spec 14.1): the account, the selected day's amount, its count and date */}
      {(acct || acctNo) && (
        <div className="mb-3 flex items-baseline justify-between text-[12px]">
          <span className="truncate text-foreground/45">{acct}</span>
          {acctNo && <span className="shrink-0 pl-3 font-medium text-foreground/90">{acctNo}</span>}
        </div>
      )}
      <div className="mb-4 flex items-end justify-between gap-4">
        <div role="status" className="min-w-0">
          {/* the figures swap when the pointed or selected day changes (LiveFigure) */}
          <LiveFigure intent={`${idx(tip)}-${range}`}>
            <p className="m-0 whitespace-nowrap text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
              {headWhole}
              {headCents && <span className="text-foreground/35">{headCents}</span>}
            </p>
            <p className="mb-0 mt-2 flex items-baseline gap-[7px] whitespace-nowrap text-[12px]">
              {hasAmount && <span className="font-medium text-foreground/60">{countText(tipDay.count)}</span>}
              <span className="text-foreground/45">{fmtDay.format(dateOf(tip))}</span>
            </p>
          </LiveFigure>
        </div>
        {!fixedWeeks && (
          <SegmentedControl
            options={RANGES}
            value={range}
            onChange={(v) => {
              setRange(v as Range)
              setSelected(null)
              setHover(null)
              onRangeChange?.(v as Range)
            }}
            label="Time frame"
            className="shrink-0"
          />
        )}
      </div>

      {/* the time frame crossfades the grid in place; its box keeps one size */}
      <motion.div
        key={fixedWeeks ? "fixed" : range}
        ref={gridRef}
        className="relative grid"
        initial={settled && !reduced ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: EASE }}
        style={{
          width: WIDTH,
          maxWidth: "100%",
          gridTemplateColumns: `${DAY_COL}px repeat(${nWeeks}, minmax(0, 1fr))`,
          gridTemplateRows: fixedWeeks ? `${MONTH_ROW}px repeat(7, auto)` : `${MONTH_ROW}px repeat(7, ${ROW_H}px)`,
          columnGap: colGap,
          rowGap: ROW_GAP,
        }}
        onPointerLeave={() => setHover(null)}
        role="group"
        aria-label={`${unit} by day over the ${fixedWeeks ? `${nWeeks} weeks` : RANGE_WORDS[range]}. Arrow keys move between days, Enter selects`}
      >
        {cols.map((c) =>
          c.label ? (
            <span
              key={c.id}
              className="whitespace-nowrap text-[9px] leading-none text-foreground/45"
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
              className="flex items-center justify-end pr-1 text-[9px] leading-none text-foreground/45"
              style={{ gridColumn: 1, gridRow: d + 2 }}
            >
              {name}
            </span>
          ) : null,
        )}

        {cols.map(({ id, w }) =>
          DAYS.map(({ name, d }) => {
            const c = { w, d }
            if (future(c)) return null
            const x = dayAt(c)
            const on = hover?.w === w && hover?.d === d
            const isSel = sel.w === w && sel.d === d
            const label = `${hasAmount ? `${money.format(x.amount ?? 0)}, ` : ""}${countText(x.count)} on ${fmtDay.format(dateOf(c))}`
            return (
              <span
                key={`${id}-${name}`}
                className="relative block"
                style={{ gridColumn: w + 2, gridRow: d + 2, aspectRatio: fixedWeeks ? "1" : undefined, zIndex: on || isSel ? 1 : 0 }}
              >
                {/* the hit area is the cell plus half the gap on every side, so a fast pointer
                    never falls through; the visual inside takes no pointer events */}
                <button
                  type="button"
                  data-i={idx(c)}
                  tabIndex={isSel ? 0 : -1}
                  aria-label={label}
                  aria-pressed={isSel}
                  onPointerEnter={() => setHover(c)}
                  onFocus={() => setHover(c)}
                  onBlur={() => setHover(null)}
                  onClick={() => select(c)}
                  onKeyDown={(e) => onKey(e, c)}
                  className="absolute block cursor-pointer outline-none"
                  style={{ inset: -colGap / 2 }}
                >
                  <motion.span
                    className="pointer-events-none absolute block"
                    style={{
                      inset: colGap / 2,
                      borderRadius: nWeeks > 40 ? 2 : 3,
                      background: tint(strength(c)),
                      boxShadow: isSel ? SELECTED_RING : on ? HOVER_RING : "none",
                      transition: "box-shadow 150ms",
                    }}
                    /* cells settle in on a diagonal delay, the first time the grid is seen */
                    initial={reduced || settled ? false : { opacity: 0, scale: 0.8 }}
                    animate={
                      !play
                        ? { opacity: 0, scale: 0.8 }
                        : {
                            opacity: 1,
                            scale: 1,
                            transition: reduced || settled ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: stagger * (w + d) },
                          }
                    }
                  />
                </button>
              </span>
            )
          }),
        )}
      </motion.div>
    </div>
  )
}
