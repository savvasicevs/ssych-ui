"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Market Snapshot, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card: the 26px rounded ground is gone, it sits on the page. Pulling still moves the
     whole block down and the ring of dots gathers in the room it leaves
   · one large size, 26px, for the price. The cents step back by ink, not by a second size
   · every figure is tabular, set once on the root
   · the line is 1.8px and draws in once on mount; the scrub mark is a plain dot, not a
     ring cut out of a card colour
   · nothing moves for longer than 400ms and nothing overshoots: the settle is 360ms and
     the period fill 250ms, both on the house ease (they were 480ms and 380ms)
   · the price and the move are a status readout, so scrubbing is read out in place
   Props are unchanged.
   Motion (2026-10-01): the line wipes in from the left once, 850ms, when the block first
   comes into view (each period used to wipe its own line in from blank). A period switch
   or a landed refresh now carries the old view into the new one in 380ms: the new line
   starts drawn at the old window's scale and position (the same prices sit where they sat)
   and eases to its own, so a longer period opens outward and a refresh slides the new
   price in from the right. The live dot rides the line's end. Reduced motion draws every
   state at once. */

const UP = "var(--chart-up)"
const DOWN = "var(--chart-down)"
const EASE = [0.16, 1, 0.3, 1] as const
const EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)"

const PERIODS = ["1D", "1W", "1M", "3M", "YTD", "1Y", "All"] as const
type Period = (typeof PERIODS)[number]
const DEFAULT_VALUES = [178.52, 176.84, 180.15, 181.42, 179.96, 184.22, 187.61, 190.04, 188.72, 194.85, 202.14, 198.93, 211.75, 224.68, 219.42, 236.18, 248.06, 243.44, 268.31, 284.12, 276.88, 301.45]

/** window each period button represents, in days; drives the scrub date */
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
const SETTLE_MS = 360
const DOTS = 6

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
 * Market snapshot: the price over one smooth, period-sliced line. Scrubbing moves a dot
 * along the line with a faint guide, and the price, the move and the date all read that
 * point. The period tabs slide one fill between them. Pull the block down to refresh: a
 * ring of dots gathers as it stretches, spins while it holds, and a new latest price lands
 * on the end of the series. The move is (price − the period's first price), and the
 * percent is that over the first price.
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
  const lineRef = useRef<SVGPathElement>(null)
  const dotRef = useRef<HTMLElement>(null)
  const seen = useInView(plotRef, { once: true, amount: 0.3 })
  const shown = seen || reduced
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
    return { pts, d: smoothPath(pts), lo, hi }
  }, [data])

  /* the view morph. A window is the last `count` prices of a series `total` long, drawn
     between `lo` and `hi`. The new line is first placed where the old view would have drawn
     the same prices, x' = sx·x + tx and y' = sy·y + ty, then eased to no transform. The stroke
     does not scale (non-scaling-stroke), so only the shape moves */
  const view = { count: data.length, total: series.length, lo: plot.lo, hi: plot.hi, values }
  const lastView = useRef(view)
  useLayoutEffect(() => {
    const a = lastView.current
    lastView.current = view
    const line = lineRef.current
    const changed = a.count !== view.count || a.total !== view.total || a.lo !== view.lo || a.hi !== view.hi
    if (reduced || !line || !changed || a.values !== view.values || typeof line.animate !== "function") return
    const r0 = a.hi - a.lo || 1
    const r1 = view.hi - view.lo || 1
    const sx = (view.count - 1) / Math.max(1, a.count - 1)
    const tx = (((view.total - view.count) - (a.total - a.count)) / Math.max(1, a.count - 1)) * VB_W
    const sy = r1 / r0
    const ty = VB_H - 4 - ((VB_H - 8) * (view.lo - a.lo + r1)) / r0 - 4 * sy
    const opts = { duration: 380, easing: EASE_CSS }
    line.animate([{ transform: `translate(${tx.toFixed(3)}px, ${ty.toFixed(3)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})` }, { transform: "none" }], opts)
    /* the dot sits on the last price; it starts where the old view drew that price. Layout
       pixels: the plot's own width, and the 92px band */
    const dot = dotRef.current
    const w = plotRef.current?.offsetWidth ?? 0
    if (!dot || !w) return
    const end = plot.pts[plot.pts.length - 1]
    const dx = ((sx * end.x + tx - end.x) / VB_W) * w
    const dy = ((sy * end.y + ty - end.y) / VB_H) * 92
    dot.animate([{ translate: `${dx.toFixed(2)}px ${dy.toFixed(2)}px` }, { translate: "0 0" }], opts)
    // the view is rebuilt every render; the layout effect only acts when its numbers move
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.count, view.total, view.lo, view.hi, view.values, reduced])

  const at = Math.min(hover ?? data.length - 1, data.length - 1)
  const price = data[at]
  const move = price - data[0]
  const pct = (move / (data[0] || 1)) * 100
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
  const when = hover == null ? WINDOW_LABEL[period] : stamp(at)

  const scrubTo = (clientX: number) => {
    const r = plotRef.current?.getBoundingClientRect()
    if (!r) return
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(((clientX - r.left) / r.width) * (data.length - 1)))))
  }

  const settle = () => {
    setPhase("settle")
    setPull(0)
    timers.current.push(window.setTimeout(() => setPhase("idle"), SETTLE_MS))
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

  // pull: a vertical drag on the block. Pointer capture, not window listeners, so it holds in any document.
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
    <div className={cn("relative w-full max-w-[340px] overflow-hidden tabular-nums", className)}>
      {/* the refresh ring: it gathers with the pull in the room the block leaves, and spins while the block holds */}
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
                  style={{ background: "color-mix(in srgb, var(--foreground) 35%, transparent)", translate: `${(Math.cos(a) * 9).toFixed(2)}px ${(Math.sin(a) * 9).toFixed(2)}px` }}
                />
              )
            })}
          </motion.span>
        </span>
      </div>

      {/* the block: drag it down to refresh, or focus it and press Enter */}
      <div
        tabIndex={0}
        role="group"
        aria-label={`${name} snapshot. Pull down or press Enter to refresh.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="relative z-[2] select-none rounded-lg px-2 pb-2 pt-3 outline-none touch-pan-x focus-visible:bg-foreground/[0.03]"
        style={{
          transform: `translateY(${pull.toFixed(1)}px)`,
          transition: phase === "pull" || reduced ? "none" : `transform ${SETTLE_MS}ms ${EASE_CSS}`,
        }}
      >
        <div className="mb-3 flex items-baseline justify-between text-[12px]">
          <span className="truncate text-foreground/45">{name}</span>
          <span className="shrink-0 pl-3 font-medium text-foreground/90">{symbol}</span>
        </div>
        <div role="status">
          {/* a period switch or a landed refresh swaps the readout in place (4px, 2px blur,
              150ms); scrubbing reads the point at once, it moves with the pointer */}
          <motion.div
            key={`${period}-${extra.length}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
          <p className="m-0 text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
            ${whole}
            <span className="text-foreground/35">.{cents}</span>
          </p>
          <p className="mb-0 mt-2 flex items-baseline gap-[7px] text-[12px] font-medium" style={{ color: move >= 0 ? UP : DOWN }}>
            <span>
              {move >= 0 ? "+" : "−"}${money(Math.abs(move))} · {move >= 0 ? "+" : "−"}
              {Math.abs(pct).toFixed(1)}%
            </span>
            <span className="font-normal text-foreground/45">{when}</span>
          </p>
          </motion.div>
        </div>

        <span
          ref={plotRef}
          className="relative mb-1.5 mt-5 block cursor-crosshair touch-pan-y"
          style={{ color: lineHue, paddingBlock: PAD_Y, transition: reduced ? undefined : "color 200ms" }}
          onPointerMove={(e) => e.pointerType === "mouse" && phase !== "pull" && scrubTo(e.clientX)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
        >
          {/* the line is stretched with a stroke that keeps its width, so it draws in by
              a wipe from the left instead of a dash, once; the view morph keeps inside it */}
          <motion.span
            className="block"
            initial={reduced ? false : { clipPath: "inset(-10% 100% -10% -2%)" }}
            animate={{ clipPath: shown ? "inset(-10% -2% -10% -2%)" : "inset(-10% 100% -10% -2%)" }}
            transition={reduced ? { duration: 0 } : { duration: 0.85, ease: EASE }}
          >
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              className="block h-[92px] w-full overflow-visible"
              role="img"
              aria-label={`${name} price ${money(price)} dollars, ${move >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)} percent over the ${WINDOW_LABEL[period]}`}
            >
              <path
                ref={lineRef}
                d={plot.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{ transformOrigin: "0 0", transformBox: "view-box" }}
              />
            </svg>
          </motion.span>
          {/* the guide and the dot are HTML over the stretched SVG, so they keep their shape */}
          <i
            aria-hidden
            className="pointer-events-none absolute -ml-[0.5px] w-px bg-foreground transition-opacity duration-150"
            style={{ top: PAD_Y, bottom: PAD_Y, left: `${point.x}%`, opacity: hover == null ? 0 : 0.28 }}
          />
          <i
            ref={dotRef}
            aria-hidden
            className="pointer-events-none absolute -ml-[3.5px] -mt-[3.5px] h-[7px] w-[7px] rounded-full bg-current"
            style={{
              left: `${point.x}%`,
              top: `calc(${PAD_Y}px + (100% - ${PAD_Y * 2}px) * ${(point.y / VB_H).toFixed(4)})`,
              scale: hover == null ? 1 : 1.3,
              /* it lights once the wipe has reached the end of the line */
              opacity: shown ? 1 : 0,
              transition: reduced ? "none" : `scale 160ms ${EASE_CSS}, opacity 250ms ${EASE_CSS} 350ms`,
            }}
          />
        </span>

        <div className="relative mt-4 flex gap-1" role="group" aria-label="Period">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full bg-foreground/[0.08]"
            style={{
              width: `calc((100% - ${(PERIODS.length - 1) * 4}px) / ${PERIODS.length})`,
              transform: `translateX(calc(${periodIndex} * (100% + 4px)))`,
              transition: reduced ? "none" : `transform 250ms ${EASE_CSS}`,
            }}
          />
          {PERIODS.map((item) => {
            const on = item === period
            return (
              <button
                key={item}
                type="button"
                aria-pressed={on}
                aria-label={`Show ${WINDOW_LABEL[item]}`}
                onClick={() => {
                  setPeriod(item)
                  setHover(null)
                }}
                className={cn(
                  "relative z-[1] h-7 flex-1 rounded-full text-[11.5px] font-medium outline-none transition-[color,scale] duration-200 active:scale-[0.97] focus-visible:text-foreground/90",
                  on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90",
                )}
              >
                {item}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex items-center justify-between px-1 text-[10px] text-foreground/35">
          <span>{updatedAt}</span>
          <span>{exchange}</span>
        </div>
      </div>
    </div>
  )
}
