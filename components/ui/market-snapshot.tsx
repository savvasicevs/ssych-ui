"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const UP = "var(--chart-up)"
const DOWN = "var(--chart-down)"

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y", "All"] as const
type Period = (typeof PERIODS)[number]
const DEFAULT_VALUES = [178.52, 176.84, 180.15, 181.42, 179.96, 184.22, 187.61, 190.04, 188.72, 194.85, 202.14, 198.93, 211.75, 224.68, 219.42, 236.18, 248.06, 243.44, 268.31, 284.12, 276.88, 301.45]

/** window each period button represents, in days — drives the scrub date */
const WINDOW_DAYS: Record<Period, number> = { "1D": 1, "1W": 7, "1M": 30, "3M": 90, YTD: 210, "1Y": 365, All: 660 }
/** what the move line says the move is measured over, at rest */
const WINDOW_LABEL: Record<Period, string> = { "1D": "past day", "1W": "past week", "1M": "past month", "3M": "past 3 months", YTD: "year to date", "1Y": "past year", All: "all time" }

const VB_W = 100
const VB_H = 40
const PAD_Y = 6
const PULL_AT = 64
const PULL_MAX = 96
const PULL_HOLD = 56
const HOLD_MS = 1000
const DOTS = 6
/** the tab pill and the sheet's settle share one curve: a quick glide with a small landing overshoot */
const SETTLE = "cubic-bezier(0.34, 1.16, 0.5, 1)"
/** the scrub dot's grow, springy and short */
const TIP_EASE = "cubic-bezier(0.28, 1.4, 0.36, 1)"

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Catmull-Rom through the samples, written as cubic Béziers, so the line reads as one smooth stroke */
function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return ""
  let d = `M${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(2)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(2)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(2)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Phase = "idle" | "pull" | "work" | "settle"

export interface MarketSnapshotProps {
  /** ticker shown top-right */
  symbol?: string
  /** company name above the price */
  name?: string
  /** full price series, oldest → latest (period buttons slice it) */
  values?: number[]
  /** footer-right caption */
  exchange?: string
  /** footer-left caption */
  updatedAt?: string
  className?: string
}

/**
 * Market snapshot card: the price over one smooth, period-sliced line. Scrubbing
 * moves a ring along the line with a faint guide, and the price, the move and the
 * date all read that point. The period tabs slide one pill between them. Pull the
 * card down to refresh: a ring of dots gathers as the sheet stretches, spins while
 * it holds, and a new latest price lands on the end of the series. The move is
 * (price − the period's first price), and the percent is that over the first price.
 */
export function MarketSnapshot({
  symbol = "AMZN",
  name = "Amazon.com Inc.",
  values = DEFAULT_VALUES,
  exchange = "NASDAQ · USD",
  updatedAt = "Updated 1:54 PM",
  className,
}: MarketSnapshotProps) {
  const reduced = useReducedMotion() ?? false
  const [period, setPeriod] = useState<Period>("All")
  const [hover, setHover] = useState<number | null>(null)
  /** prices a refresh has added to the end of the series */
  const [extra, setExtra] = useState<number[]>([])
  const [pull, setPull] = useState(0)
  const [phase, setPhase] = useState<Phase>("idle")
  const plotRef = useRef<HTMLSpanElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; axis: "none" | "x" | "y" } | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const series = useMemo(() => [...values, ...extra], [values, extra])
  const periodIndex = PERIODS.indexOf(period)
  const factor = Math.max(7, Math.round(series.length * ((periodIndex + 1) / PERIODS.length)))
  const data = useMemo(() => series.slice(-factor), [series, factor])

  const plot = useMemo(() => {
    const lo = Math.min(...data)
    const hi = Math.max(...data)
    const pts = data.map((v, i) => ({ x: (i / Math.max(1, data.length - 1)) * VB_W, y: 4 + (1 - (v - lo) / (hi - lo || 1)) * (VB_H - 8) }))
    return { pts, d: smoothPath(pts) }
  }, [data])

  const at = hover ?? data.length - 1
  const price = data[at]
  const move = price - data[0]
  const pct = (move / data[0]) * 100
  const lineHue = data[data.length - 1] >= data[0] ? UP : DOWN
  const [whole, cents] = money(price).split(".")

  // date under the pointer, counted back from a fixed "now" so every render reads the same
  const stamp = (i: number) => {
    const end = new Date(2026, 6, 29, 16, 0)
    const backDays = ((data.length - 1 - i) / Math.max(1, data.length - 1)) * WINDOW_DAYS[period]
    const d = new Date(end.getTime() - backDays * 86400000)
    return period === "1D"
      ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: period === "All" || period === "1Y" ? "2-digit" : undefined })
  }
  const when = hover == null ? WINDOW_LABEL[period] : stamp(hover)

  const scrubTo = (clientX: number) => {
    const r = plotRef.current?.getBoundingClientRect()
    if (!r) return
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((clientX - r.left) / r.width) * (data.length - 1)))))
  }

  const settle = () => {
    setPhase("settle")
    setPull(0)
    timers.current.push(window.setTimeout(() => setPhase("idle"), 480))
  }
  const refresh = () => {
    if (phase === "work") return
    setHover(null)
    setPhase("work")
    setPull(PULL_HOLD)
    timers.current.push(
      window.setTimeout(() => {
        // one new latest price, a small seeded step from the current one
        setExtra((xs) => {
          const lastPrice = xs.length ? xs[xs.length - 1] : values[values.length - 1]
          return [...xs, Math.round(lastPrice * (1 + (mulberry32(700 + xs.length)() - 0.45) * 0.02) * 100) / 100]
        })
        settle()
      }, reduced ? 0 : HOLD_MS),
    )
  }

  // pull: a vertical drag on the sheet. Pointer capture, not window listeners, so it holds in any document.
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (phase === "work" || (e.target as HTMLElement).closest("button")) return
    if (e.pointerType === "mouse" && e.button !== 0) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: "none" }
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (d.axis === "none" && Math.hypot(dx, dy) > 6) {
      d.axis = dy > 0 && Math.abs(dy) > Math.abs(dx) ? "y" : "x"
      if (d.axis === "y") {
        e.currentTarget.setPointerCapture(e.pointerId)
        setHover(null)
        setPhase("pull")
      }
    }
    if (d.axis === "y") setPull(PULL_MAX * (1 - Math.exp(-Math.max(0, dy) / 120)))
    else if (d.axis === "x" && e.pointerType !== "mouse") scrubTo(e.clientX)
  }
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId) return
    if (d.axis === "x" && e.pointerType !== "mouse") setHover(null)
    if (d.axis !== "y") return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (pull >= PULL_AT) refresh()
    else settle()
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return
    e.preventDefault()
    refresh()
  }

  const progress = phase === "work" ? 1 : Math.min(1, pull / PULL_AT)
  const point = plot.pts[at]

  return (
    <div className={cn("relative w-full max-w-[340px] overflow-hidden rounded-[26px]", className)} style={{ background: "var(--card)" }}>
      {/* the refresh ring, behind the sheet: it gathers with the pull and spins while the sheet holds */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[30px] z-[1] -ml-[30px] -mt-[30px] grid h-[60px] w-[60px] place-items-center"
        style={{ opacity: progress, scale: 0.82 + progress * 0.18 }}
      >
        <span className="grid place-items-center" style={{ rotate: phase === "work" ? "0deg" : `${pull * 2.4}deg` }}>
          <motion.span
            className="relative block h-6 w-6"
            animate={phase === "work" && !reduced ? { rotate: 360 } : { rotate: 0 }}
            transition={phase === "work" && !reduced ? { duration: 0.9, ease: "linear", repeat: Infinity } : { duration: 0 }}
          >
            {Array.from({ length: DOTS }, (_, k) => {
              const a = (k / DOTS) * Math.PI * 2
              return (
                <span
                  key={k}
                  className="absolute left-1/2 top-1/2 -ml-[2px] -mt-[2px] h-1 w-1 rounded-full"
                  style={{ background: "color-mix(in srgb, var(--foreground) 34%, transparent)", translate: `${(Math.cos(a) * 9).toFixed(2)}px ${(Math.sin(a) * 9).toFixed(2)}px` }}
                />
              )
            })}
          </motion.span>
        </span>
      </div>

      {/* the sheet: drag it down to refresh, or focus it and press Enter */}
      <div
        tabIndex={0}
        role="group"
        aria-label={`${name} snapshot. Pull down or press Enter to refresh.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="relative z-[2] select-none rounded-[26px] px-3 pb-3 pt-[20px] outline-none touch-pan-x focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--foreground)_45%,transparent)]"
        style={{
          background: "var(--card)",
          transform: `translateY(${pull.toFixed(1)}px)`,
          transition: phase === "pull" || reduced ? "none" : `transform 0.48s ${SETTLE}`,
        }}
      >
        <div className="mb-3 flex items-baseline justify-between text-[12px]">
          <span className="truncate text-foreground/45">{name}</span>
          <span className="shrink-0 pl-3 font-medium text-foreground/85">{symbol}</span>
        </div>
        <p className="m-0 text-[33px] font-medium leading-none tracking-[-0.03em] tabular-nums text-foreground">
          <span className="mr-[2px]">$</span>
          {whole}
          <span className="text-[24px] opacity-[0.34]">.{cents}</span>
        </p>
        <p className="mt-[9px] mb-0 flex items-baseline gap-[7px] text-[12.5px] font-medium tabular-nums" style={{ color: move >= 0 ? UP : DOWN }}>
          <span>
            {move >= 0 ? "+" : "−"}
            {money(Math.abs(move))} · {Math.abs(pct).toFixed(1)}%
          </span>
          <span className="text-foreground/40">{when}</span>
        </p>

        <span
          ref={plotRef}
          className="relative mt-[22px] mb-[6px] block cursor-crosshair touch-pan-y"
          style={{ color: lineHue, paddingBlock: PAD_Y }}
          onPointerMove={(e) => e.pointerType === "mouse" && phase !== "pull" && scrubTo(e.clientX)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            className="block h-[92px] w-full overflow-visible"
            role="img"
            aria-label={`${name} price ${money(price)} dollars, ${move >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)} percent over the ${WINDOW_LABEL[period]}`}
          >
            <path d={plot.d} fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* the guide and the ring are HTML over the stretched SVG, so they keep their shape */}
          <i
            aria-hidden
            className="pointer-events-none absolute w-px -ml-[0.5px] bg-current transition-opacity duration-[140ms]"
            style={{ top: PAD_Y, bottom: PAD_Y, left: `${point.x}%`, opacity: hover == null ? 0 : 0.28 }}
          />
          <i
            aria-hidden
            className="pointer-events-none absolute -ml-[4.5px] -mt-[4.5px] h-[9px] w-[9px] rounded-full"
            style={{
              left: `${point.x}%`,
              top: `calc(${PAD_Y}px + (100% - ${PAD_Y * 2}px) * ${(point.y / VB_H).toFixed(4)})`,
              background: "var(--card)",
              boxShadow: "0 0 0 2px currentColor",
              scale: hover == null ? 1 : 1.18,
              transition: reduced ? "none" : `scale 0.16s ${TIP_EASE}`,
            }}
          />
        </span>

        <div className="relative mt-4 flex gap-1" role="group" aria-label="Period">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full bg-foreground/[0.07]"
            style={{
              width: `calc((100% - ${(PERIODS.length - 1) * 4}px) / ${PERIODS.length})`,
              transform: `translateX(calc(${periodIndex} * (100% + 4px)))`,
              transition: reduced ? "none" : `transform 0.38s ${SETTLE}`,
            }}
          />
          {PERIODS.map((item) => {
            const on = item === period
            return (
              <button
                key={item}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPeriod(item)
                  setHover(null)
                }}
                className={cn(
                  "relative z-[1] h-7 flex-1 rounded-full text-[11.5px] font-medium tracking-[0.01em] transition-[color,transform] duration-200 active:scale-[0.94]",
                  on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90",
                )}
              >
                {item}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex items-center justify-between px-1 text-[10px] tabular-nums text-foreground/35">
          <span>{updatedAt}</span>
          <span>{exchange}</span>
        </div>
      </div>
    </div>
  )
}
