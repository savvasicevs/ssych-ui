"use client"

import { useMemo, useRef, useState } from "react"
import { useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { ChartCard } from "@/components/ui/chart-overlay"

/* Uptime Bars, written new through ssych-component (2026-09-29).
   What it is for: ninety days of one service, a bar a day, so a bad day is found by eye.
   Read first: the uptime percent for the window.
   The pointer: scrub the bars (or focus them and use the arrow keys). The pointed day stays
   full and the rest dim; a card by the bar reads that day's uptime, the time lost, and the
   incident with its severity. The headline keeps the window.
   Reference: browsable "uptime" (90 Day Uptime Bars, Uptime Status Page, Status Page). Only
   the index descriptions were read, no source. Idea taken: one thin bar per day with the
   day's record behind the pointer. Colour: a clean day is quiet ink at 20% and turns green
   only under the pointer, so at rest only the incident days carry colour; a minor incident
   is degraded, amber; a major or critical one is red, deeper the worse it was.
   Formulas:
   · day uptime     = (1440 − minutes down that day) / 1440
   · window uptime  = 1 − Σ minutes down / (days × 1440)
                      sample: 1 − 205 / (90 × 1440) = 99.84%
   · incidents      = count of days that carry an incident (sample: 6)
   · time down      = Σ minutes down (sample: 6 + 41 + 4 + 118 + 9 + 27 = 205 min = 3 h 25 min)
   Motion (2026-10-01): the bars grow from the floor once the strip is a third in view, left
   to right with the stagger spread over 360ms and 400ms a bar (760ms in all), as CSS
   transitions so ninety bars cost no script per frame; reduced motion shows them standing.
   No data changes here, so nothing else moves.
   2026-10-02 audit: the header is the three tiers now: the service at /45 with the window
   (90 days) at /90 in a 12px label row, the window uptime as the 26px headline with its
   decimals at /35, and a 12px sub line with the time down in red and the incident count
   at /45. A pointed day no longer overwrites the headline: it opens a ChartCard by the bar
   (the date as heading, Uptime, Down and Severity rows, the incident named under them),
   so the joined "title · severity · time" line is gone. Clean days moved from 45% green to
   ink at 20%, green under the pointer, so the doc comment and the bars agree. Axis text is
   9px /45. */

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

const SEVERITY_NAME: Record<UptimeSeverity, string> = { minor: "Minor", major: "Major", critical: "Critical" }
/** severity: degraded is amber, down is red, and the red deepens with how bad it was */
const SEVERITY: Record<UptimeSeverity, string> = {
  minor: AMBER,
  major: `color-mix(in srgb, ${RED} 68%, transparent)`,
  critical: RED,
}
const barFill = (d: UptimeDay, on: boolean) =>
  d.incident ? SEVERITY[d.incident.severity] : on ? GREEN : undefined
/* the grey days come from a class so light and dark can differ (his call, 2026-10-02:
   lighter on light): 11% ink in light, 20% in dark */
const IDLE_BAR = "fill-[color-mix(in_srgb,var(--foreground)_11%,transparent)] dark:fill-[color-mix(in_srgb,var(--foreground)_20%,transparent)]"

const W = 460
const H = 40

/**
 * Ninety days of uptime as thin bars. A clean day is quiet ink and a day with an incident
 * is amber or red, deeper the worse it was. Scrubbing reads any day in a card by its bar.
 */
export function UptimeBars({ days = DEFAULT_DAYS, title = "API uptime", className }: UptimeBarsProps) {
  const reduced = useReducedMotion()
  const boxRef = useRef<HTMLDivElement>(null)
  /* the bars wait until the strip is a third in view, then grow once */
  const play = useInView(boxRef, { once: true, amount: 0.3 }) || !!reduced
  const [hot, setHot] = useState<number | null>(null)

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
    setHot(clamp(Math.floor(((e.clientX - r.left) / r.width) * n)))
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setHot((h) => clamp((h ?? n) - 1))
    else if (e.key === "ArrowRight") setHot((h) => clamp((h ?? -1) + 1))
    else if (e.key === "Escape") setHot(null)
    else return
    e.preventDefault()
  }

  const day = hot === null ? undefined : days[hot]
  const [whole, decimals] = stats.uptime.toFixed(2).split(".")
  const first = days[0]
  const last = days[n - 1]
  /* month starts that sit clear of both ends get a tick of their own */
  const ticks = days
    .map((d, i) => ({ d, i }))
    .filter(({ d, i }) => d.date.endsWith("-01") && i > 8 && i < n - 9)

  return (
    <div className={cn("w-[460px] max-w-full tabular-nums", className)}>
      {/* the three tiers (spec 14.1); the headline always reads the window, a pointed day
          reads in the card by its bar */}
      <div>
        <div className="mb-3 flex items-baseline justify-between text-[12px]">
          <span className="text-foreground/45">{title}</span>
          <span className="font-medium text-foreground/90">{n} days</span>
        </div>
        <div className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
          {whole}
          <span className="text-foreground/35">.{decimals}%</span>
        </div>
        <div className="mt-2 text-[12px] font-medium">
          <span style={{ color: stats.down ? RED : GREEN }}>{stats.down ? `${span(stats.down)} down` : "No time down"}</span>
          <span className="font-normal text-foreground/45">
            {" "}
            in {stats.incidents} incident{stats.incidents === 1 ? "" : "s"}
          </span>
        </div>
      </div>

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
                  className={barFill(d, on) ? undefined : IDLE_BAR}
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
        {/* the pointed day reads in the library popover by its bar (spec 13.5, 14.6) */}
        <ChartCard
          open={!!day}
          x={hot === null ? 0 : `${((hot + 0.5) / Math.max(1, n)) * 100}%`}
          y={H + 6}
          flip={hot !== null && (hot + 0.5) / Math.max(1, n) > 0.6}
          width={176}
          heading={day ? dayLabel(day.date) : ""}
          rows={
            day
              ? [
                  { label: "Uptime", value: `${dayUptime(day).toFixed(2)}%` },
                  { label: "Down", value: span(downOf(day)) },
                  day.incident
                    ? { label: "Severity", value: SEVERITY_NAME[day.incident.severity], color: SEVERITY[day.incident.severity] }
                    : { label: "Incident", value: "None" },
                ]
              : []
          }
          footer={day?.incident ? <span className="text-foreground/90">{day.incident.title}</span> : undefined}
        />
      </div>

      <div className="relative mt-1.5 h-3 text-[9px] text-foreground/45" aria-hidden>
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
