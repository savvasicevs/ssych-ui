"use client"

import { useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Uptime Bars, written new through ssych-component (2026-09-29).
   What it is for: ninety days of one service, a bar a day, so a bad day is found by eye.
   Read first: the uptime percent for the window.
   The pointer: scrub the bars (or focus them and use the arrow keys). The pointed day stays
   full and the rest dim; the headline becomes that day's uptime with its date, and the line
   under it names the incident, its severity and the time lost. Nothing floats.
   Reference: browsable "uptime" (90 Day Uptime Bars, Uptime Status Page, Status Page). Only
   the index descriptions were read, no source. Idea taken: one thin bar per day with the
   day's record behind the pointer. Colour (2026-09-30, direction): a clean day is healthy,
   so it is green, quiet at rest and full under the pointer; a minor incident is degraded,
   amber; a major or critical one is red, deeper the worse it was.
   Formulas:
   · day uptime     = (1440 − minutes down that day) / 1440
   · window uptime  = 1 − Σ minutes down / (days × 1440)
                      sample: 1 − 205 / (90 × 1440) = 99.84%
   · incidents      = count of days that carry an incident (sample: 6)
   · time down      = Σ minutes down (sample: 6 + 41 + 4 + 118 + 9 + 27 = 205 min = 3 h 25 min)
   Motion (2026-10-01): the bars grow from the floor once the strip is a third in view, left
   to right with the stagger spread over 360ms and 400ms a bar (760ms in all), as CSS
   transitions so ninety bars cost no script per frame; reduced motion shows them standing.
   No data changes here, so nothing else moves. */

const EASE = [0.16, 1, 0.3, 1] as const
const CSS_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"
const RED = "var(--chart-down)"
const GREEN = "var(--chart-up)"
const AMBER = "var(--chart-amber)"
const DAY_MINUTES = 1440

export type UptimeSeverity = "minor" | "major" | "critical"

export interface UptimeIncident {
  title: string
  severity: UptimeSeverity
  /** minutes the service was down that day */
  downMinutes: number
}

export interface UptimeDay {
  /** ISO day, 2026-09-28 */
  date: string
  incident?: UptimeIncident
}

export interface UptimeBarsProps {
  /** oldest first, one entry per day */
  days?: UptimeDay[]
  /** the service the bars belong to, written beside the window's uptime */
  title?: string
  className?: string
}

const SAMPLE_INCIDENTS: Record<string, UptimeIncident> = {
  "2026-07-09": { title: "Elevated API error rate", severity: "minor", downMinutes: 6 },
  "2026-07-23": { title: "Webhook deliveries delayed", severity: "major", downMinutes: 41 },
  "2026-08-04": { title: "Dashboard slow to load", severity: "minor", downMinutes: 4 },
  "2026-08-19": { title: "Database failover in eu-west", severity: "critical", downMinutes: 118 },
  "2026-09-02": { title: "Token refresh failures", severity: "minor", downMinutes: 9 },
  "2026-09-17": { title: "Inference queue backlog", severity: "major", downMinutes: 27 },
}

/* 31 + 31 + 28 = 90 days, 2026-07-01 to 2026-09-28 */
const SAMPLE_MONTHS = [
  { month: 7, days: 31 },
  { month: 8, days: 31 },
  { month: 9, days: 28 },
]

const two = (v: number) => String(v).padStart(2, "0")

const DEFAULT_DAYS: UptimeDay[] = SAMPLE_MONTHS.flatMap(({ month, days }) =>
  Array.from({ length: days }, (_, d): UptimeDay => {
    const date = `2026-${two(month)}-${two(d + 1)}`
    const incident = SAMPLE_INCIDENTS[date]
    return incident ? { date, incident } : { date }
  }),
)

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "2026-08-19" reads as "Aug 19": taken from the string, so no clock is involved */
const dayLabel = (iso: string) => {
  const parts = iso.split("-")
  return `${MONTHS[Number(parts[1]) - 1] ?? ""} ${Number(parts[2])}`
}

const downOf = (d: UptimeDay | undefined) => d?.incident?.downMinutes ?? 0
const dayUptime = (d: UptimeDay | undefined) => ((DAY_MINUTES - downOf(d)) / DAY_MINUTES) * 100
const span = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`)

/** severity: degraded is amber, down is red, and the red deepens with how bad it was */
const SEVERITY: Record<UptimeSeverity, string> = {
  minor: AMBER,
  major: `color-mix(in srgb, ${RED} 68%, transparent)`,
  critical: RED,
}
const barFill = (d: UptimeDay, on: boolean) =>
  d.incident ? SEVERITY[d.incident.severity] : `color-mix(in srgb, ${GREEN} ${on ? 100 : 45}%, transparent)`

const W = 460
const H = 40

/**
 * Ninety days of uptime as thin bars. A clean day is quiet ink and a day with an incident
 * is red, deeper the worse it was. Scrubbing reads any day in place of the headline.
 */
export function UptimeBars({ days = DEFAULT_DAYS, title = "API uptime", className }: UptimeBarsProps) {
  const reduced = useReducedMotion()
  const boxRef = useRef<HTMLDivElement>(null)
  /* the bars wait until the strip is a third in view, then grow once */
  const play = useInView(boxRef, { once: true, amount: 0.3 }) || !!reduced
  const [hot, setHot] = useState<number | null>(null)
  /** the last move came from the arrow keys: the headline then changes at once */
  const viaKey = useRef(false)

  const n = days.length
  const stats = useMemo(() => {
    const down = days.reduce((s, d) => s + downOf(d), 0)
    return {
      down,
      incidents: days.filter((d) => d.incident).length,
      uptime: n ? (1 - down / (n * DAY_MINUTES)) * 100 : 100,
    }
  }, [days, n])

  const step = W / Math.max(1, n)
  const bar = Math.max(1, step - 2)
  const clamp = (i: number) => Math.max(0, Math.min(n - 1, i))

  const onMove = (e: React.PointerEvent) => {
    const el = boxRef.current
    if (!el || !n) return
    const r = el.getBoundingClientRect()
    viaKey.current = false
    setHot(clamp(Math.floor(((e.clientX - r.left) / r.width) * n)))
  }
  const onKey = (e: React.KeyboardEvent) => {
    viaKey.current = true
    if (e.key === "ArrowLeft") setHot((h) => clamp((h ?? n) - 1))
    else if (e.key === "ArrowRight") setHot((h) => clamp((h ?? -1) + 1))
    else if (e.key === "Escape") setHot(null)
    else return
    e.preventDefault()
  }

  const day = hot === null ? undefined : days[hot]
  const first = days[0]
  const last = days[n - 1]
  /* month starts that sit clear of both ends get a tick of their own */
  const ticks = days
    .map((d, i) => ({ d, i }))
    .filter(({ d, i }) => d.date.endsWith("-01") && i > 8 && i < n - 9)

  return (
    <div className={cn("w-[460px] max-w-full tabular-nums", className)}>
      {/* between the window and a scrubbed day the headline crosses over (4px, 2px blur,
          150ms); while scrubbing it follows the pointer in place, and keys change it at once */}
      <motion.div
        key={day ? "day" : "window"}
        role="status"
        initial={viaKey.current ? false : reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.15, ease: EASE }}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
            {(day ? dayUptime(day) : stats.uptime).toFixed(2)}%
          </span>
          <span className="text-[10px] text-foreground/45">{day ? dayLabel(day.date) : title}</span>
        </div>
        <div className="mt-1.5 truncate text-[10.5px] text-foreground/45">
          {day ? (
            day.incident ? (
              <>
                <span className="text-foreground/90">{day.incident.title}</span> ·{" "}
                <span style={{ color: SEVERITY[day.incident.severity] }}>{day.incident.severity}</span> · {span(day.incident.downMinutes)} down
              </>
            ) : (
              "No incident"
            )
          ) : (
            `${stats.incidents} incidents · ${span(stats.down)} down`
          )}
        </div>
      </motion.div>

      <div
        ref={boxRef}
        tabIndex={0}
        role="group"
        aria-label={`${title} by day, arrow keys move between days`}
        className="relative mt-3 cursor-crosshair touch-none rounded-[3px] outline-none focus-visible:bg-foreground/[0.04]"
        onPointerMove={onMove}
        onPointerLeave={() => setHot(null)}
        onKeyDown={onKey}
        onBlur={() => setHot(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full overflow-visible"
          role="img"
          aria-label={`${title}, ${stats.uptime.toFixed(2)}% uptime over ${n} days, ${stats.incidents} incidents, ${span(stats.down)} down`}
        >
          {days.map((d, i) => {
            const on = hot === i
            return (
              /* the group owns the dim so it never fights the entrance inside */
              <g key={d.date} style={{ opacity: hot !== null && !on ? 0.4 : 1, transition: "opacity 150ms ease-out" }}>
                {/* each bar grows from the floor once; ninety bars share a 360ms stagger */}
                <rect
                  x={i * step + 1}
                  y={0}
                  width={bar}
                  height={H}
                  rx={1}
                  fill={barFill(d, on)}
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "50% 100%",
                    transform: play ? "none" : "scaleY(0)",
                    transition: reduced ? "fill 150ms ease-out" : `fill 150ms ease-out, transform 400ms ${CSS_EASE} ${((i / Math.max(1, n)) * 0.36).toFixed(3)}s`,
                  }}
                />
              </g>
            )
          })}
        </svg>
      </div>

      <div className="relative mt-1.5 h-3 text-[9px] text-foreground/35" aria-hidden>
        {first && <span className="absolute left-0">{dayLabel(first.date)}</span>}
        {ticks.map(({ d, i }) => (
          <span key={d.date} className="absolute" style={{ left: `${(i / n) * 100}%` }}>
            {dayLabel(d.date)}
          </span>
        ))}
        {last && n > 1 && <span className="absolute right-0">{dayLabel(last.date)}</span>}
      </div>
    </div>
  )
}
