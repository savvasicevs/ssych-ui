"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { AxisTag } from "@/components/ui/chart-overlay"

/* Range Navigator, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the line is ink, not blue. CHANGED DEFAULT: `color` now defaults to the foreground at
     90% (it was var(--chart-1)); pass a colour to get the old look. The accent is only on
     the point being pointed at
   · the readout is plain text beside the title: the last price of the window and the
     window's signed change at rest, the pointed price and its date while you scrub. The
     bordered card that floated over the chart is gone
   · the window on the mini-map is a faint fill with two ink grips, no outline; the history
     outside it is the same line at a lower strength, not a veil of the page colour
   · the detail line is 1.8px and draws in once; it no longer flickers on every pan
   · both charts name themselves to a screen reader, and the window can be moved from the
     keyboard: arrows pan, shift + arrows pan by ten, + and − zoom
   Motion (2026-10-01): once the chart is in view the detail line and its fill sweep in left
   to right through one clip (0.9s); a new series glides both lines into place; panning and
   zooming the window stay 1:1 with the pointer, a tween there would trail the grip
   2026-10-02 audit: the title was an instruction ("drag to navigate") and the one figure
   was 11px. The header is now the library's three tiers: the name at /45 with the symbol
   (a new `symbol` prop) at /90, the window's close as the 26px headline, and under it the
   window's change in its hue then the window's dates at /45. Pointing the detail chart
   puts a dot in the line's own ink and an outlined tag on the price axis, and the header
   reads that day: its price, the change from the window's first day to it, and its date.
   The two end dates under the map went, since the header says them once. The window on the
   map is the control thumb's fill and its grips are the slider handle, a 2 by 10 bar in
   ink that no longer turns the accent while held. Axis figures are 9px at /45.
   Formulas:
   · window change  = (close of the window's last day − close of its first day) ÷ first × 100
   · pointed change = (pointed close − close of the window's first day) ÷ first × 100
   · price ticks    = the window's min and max padded by a tenth of their range, cut in four
   2026-10-02 round 2: his notes, more roundness and a window that clearly reads as a
   container you can grab. The map now lies in its own lane, the surface step (7%) with a
   14px corner; the window is a raised block on it (white in light, 12% in dark) with a 1px
   ink edge at 14% (28% under the pointer or held), a 12px corner (14 = 12 + the 2px gap)
   so it stands off the lane. Its grips sit inside it, 6px in from each
   edge, as 2 by 12 bars, and the cursor turns to a closed hand while it is held. The lines
   have round caps. Focus on the map is an inset 1px ink ring on the lane's own edge. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
/** the map's lane: the surface step (spec 14.8) */
const LANE_FILL = "color-mix(in srgb, var(--foreground) 7%, var(--background))"
/** the window: the raised step on the lane, white in light, 12% in dark (spec 14.8) */
const RAISED_FILL = "fill-background dark:fill-[color-mix(in_srgb,var(--foreground)_12%,var(--background))]"
/** the lane's corner, and the window's: 14 = 12 + the 2px gap between them */
const LANE_R = 14
const WIN_R = 12
const WIN_GAP = 2
const INK = "color-mix(in srgb, var(--foreground) 90%, transparent)"

const W = 560 // component width: both charts share one coordinate space
const MAIN_H = 168
const NAV_H = 46
const PAD = { l: 8, r: 54, t: 12, b: 8 }
const PLOT_W = W - PAD.l - PAD.r
/** Fractions down the plot where the price axis puts a tick. */
const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1]
const DAY_MS = 86_400_000

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Deterministic price walk: same series every render. */
function walk(len: number, seed = 5) {
  let s = seed
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
  const out: number[] = []
  let v = 120
  for (let i = 0; i < len; i++) {
    v += (rnd() - 0.48) * 3 + Math.sin(i / 22) * 0.6
    out.push(v)
  }
  return out
}

const DEFAULT_VALUES = walk(240)
/** Fixed anchor day so the date axis never drifts between server and client. */
const DEFAULT_END_DATE = new Date(Date.UTC(2026, 6, 30))

export interface RangeNavigatorProps {
  /** The name in the header's label row. */
  title?: string
  /** The symbol on the right of the label row. */
  symbol?: string
  /** The series, oldest → newest. Defaults to a deterministic sample walk. */
  values?: number[]
  /** Date of the last sample; every earlier point steps back one day. */
  endDate?: Date
  /** How many trailing points the window opens on. */
  initialWindow?: number
  /** Narrowest the window can be pulled, in points. */
  minWindow?: number
  /** The one series colour. Defaults to ink. */
  color?: string
  /** Number formatting for the price axis and the readout. */
  locale?: string
  currency?: string
  /** Fires with the point range whenever the window is panned or zoomed. */
  onWindowChange?: (range: { start: number; end: number }) => void
  className?: string
}

/**
 * Focus and context: a detail chart over a compressed map of the whole history. Drag the
 * window to pan, pull a grip to zoom, and the detail chart re-windows as you go. Pointing
 * at the detail chart drops a rule on the nearest real point, tags its price on the axis
 * and reads it in the header. The price ticks and the two end dates come from the current window.
 */
export function RangeNavigator({
  title = "Price history",
  symbol = "NVDA",
  values,
  endDate = DEFAULT_END_DATE,
  initialWindow = 72,
  minWindow = 12,
  color = INK,
  locale = "en-US",
  currency = "USD",
  onWindowChange,
  className,
}: RangeNavigatorProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const series = values?.length ? values : DEFAULT_VALUES
  const len = series.length

  const [win, setWin] = useState({
    start: clamp(len - 1 - initialWindow, 0, Math.max(0, len - 1 - minWindow)),
    end: len - 1,
  })
  /** Hovered index WITHIN the window slice, not the full series. */
  const [hover, setHover] = useState<number | null>(null)
  /** which part of the mini-map is under the pointer or held */
  const [grip, setGrip] = useState<"move" | "left" | "right" | null>(null)
  /** the window is held (the cursor closes) */
  const [held, setHeld] = useState(false)
  /** the map has keyboard focus: its lane's edge brightens */
  const [focusRing, setFocusRing] = useState(false)
  const navRef = useRef<SVGSVGElement>(null)
  const mainRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ mode: "move" | "left" | "right"; startIdx: number; s: number; e: number } | null>(null)
  /* the entrance plays once, when a third of the chart is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const play = !!reduced || seen
  /* a new series glides; a moved window follows the hand at once */
  const lastWin = useRef(win)
  const windowMoved = lastWin.current !== win
  useEffect(() => {
    lastWin.current = win
  }, [win])
  const morph = reduced || windowMoved ? { duration: 0 } : { duration: 0.35, ease: EASE }

  /** Currency with a true minus (U+2212). */
  const money = useMemo(() => {
    const fmt = (precision: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      })
    const cache = new Map<number, Intl.NumberFormat>()
    return (n: number, precision = 2) => {
      if (!cache.has(precision)) cache.set(precision, fmt(precision))
      return (n < 0 ? "−" : "") + cache.get(precision)!.format(Math.abs(n))
    }
  }, [locale, currency])

  const last = endDate.getTime()
  const dayAt = (i: number) => new Date(last - (len - 1 - i) * DAY_MS)
  const fmtDay = (i: number, withYear = false) =>
    dayAt(i).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: withYear ? "2-digit" : undefined,
      timeZone: "UTC",
    })

  const pxToIdx = (clientX: number) => {
    const r = navRef.current?.getBoundingClientRect()
    if (!r) return 0
    return ((clientX - r.left) / r.width) * (len - 1)
  }

  // The mini-map captures the pointer on press, so the pull keeps tracking when the
  // pointer leaves it, and it works in any document (an iframe never forwards its
  // pointer events to the parent window).
  const onNavMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const delta = Math.round(pxToIdx(e.clientX) - d.startIdx)
    if (d.mode === "move") {
      const width = d.e - d.s
      const start = clamp(d.s + delta, 0, len - 1 - width)
      setWin({ start, end: start + width })
    } else if (d.mode === "left") {
      setWin({ start: clamp(d.s + delta, 0, d.e - minWindow), end: d.e })
    } else {
      setWin({ start: d.s, end: clamp(d.e + delta, d.s + minWindow, len - 1) })
    }
  }
  const endDrag = (e: React.PointerEvent) => {
    drag.current = null
    setGrip(null)
    setHeld(false)
    if (navRef.current?.hasPointerCapture(e.pointerId)) navRef.current.releasePointerCapture(e.pointerId)
  }

  useEffect(() => {
    onWindowChange?.(win)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.start, win.end])

  const startDrag = (mode: "move" | "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navRef.current?.setPointerCapture(e.pointerId)
    drag.current = { mode, startIdx: pxToIdx(e.clientX), s: win.start, e: win.end }
    setGrip(mode)
    setHeld(true)
  }
  const point = (mode: "move" | "left" | "right" | null) => () => {
    if (!drag.current) setGrip(mode)
  }

  /** the same moves from the keyboard: pan with the arrows, zoom with + and − */
  const onNavKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1
    const width = win.end - win.start
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const start = clamp(win.start + (e.key === "ArrowLeft" ? -step : step), 0, len - 1 - width)
      setWin({ start, end: start + width })
    } else if (e.key === "+" || e.key === "=") {
      setWin({ start: clamp(win.start + step, 0, win.end - minWindow), end: win.end })
    } else if (e.key === "-" || e.key === "−") {
      setWin({ start: clamp(win.start - step, 0, win.end - minWindow), end: win.end })
    } else if (e.key === "Home") {
      setWin({ start: 0, end: width })
    } else if (e.key === "End") {
      setWin({ start: len - 1 - width, end: len - 1 })
    } else return
    e.preventDefault()
  }

  // Detail-chart geometry over the selected window.
  const detail = useMemo(() => {
    const slice = series.slice(win.start, win.end + 1)
    const lo = Math.min(...slice)
    const hi = Math.max(...slice)
    const pad = (hi - lo) * 0.1 || 1
    const min = lo - pad
    const max = hi + pad
    const n = slice.length
    const x = (i: number) => PAD.l + (i / Math.max(1, n - 1)) * PLOT_W
    const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (MAIN_H - PAD.t - PAD.b)
    const line = slice.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    const area = `${line} L${x(n - 1).toFixed(1)},${MAIN_H - PAD.b} L${x(0).toFixed(1)},${MAIN_H - PAD.b} Z`
    // Tight windows span a couple of dollars: keep the cents so ticks stay distinct.
    const axisPrecision = max - min >= 6 ? 0 : 2
    return { line, area, min, max, slice, n, x, y, axisPrecision }
  }, [win, series])

  // The rule on the detail chart: pointer x snaps to the nearest real point.
  const onMainMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = mainRef.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    setHover(clamp(Math.round(((px - PAD.l) / PLOT_W) * (detail.n - 1)), 0, detail.n - 1))
  }
  const hv =
    hover != null && hover < detail.n
      ? { i: hover, v: detail.slice[hover], x: detail.x(hover), y: detail.y(detail.slice[hover]) }
      : null

  // Mini-map geometry over the full series.
  const nav = useMemo(() => {
    const lo = Math.min(...series)
    const hi = Math.max(...series)
    const nx = (i: number) => PAD.l + (i / Math.max(1, len - 1)) * PLOT_W
    const ny = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (NAV_H - 8)
    const line = series.map((v, i) => `${i === 0 ? "M" : "L"}${nx(i).toFixed(1)},${ny(v).toFixed(1)}`).join(" ")
    return { line, nx }
  }, [series, len])

  const wx0 = nav.nx(win.start)
  const wx1 = nav.nx(win.end)
  // End labels track the window; the year only appears when the window straddles one.
  const crossesYear = dayAt(win.start).getUTCFullYear() !== dayAt(win.end).getUTCFullYear()

  /** the window's own move: (last − first) / first, in percent */
  const first = series[win.start]
  const close = series[win.end]
  const change = first ? ((close - first) / Math.abs(first)) * 100 : 0
  const signed = (pct: number) => `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`
  const changeText = signed(change)
  /* the header reads the pointed day while scrubbing, the window's close at rest */
  const shownPrice = hv ? hv.v : close
  const shownChange = hv && first ? ((hv.v - first) / Math.abs(first)) * 100 : change
  const [headWhole, headDecimals] = (() => {
    const t = money(shownPrice)
    const at = t.lastIndexOf(".")
    return at < 0 ? [t, ""] : [t.slice(0, at), t.slice(at)]
  })()
  const span = `${fmtDay(win.start, crossesYear)} to ${fmtDay(win.end, crossesYear)}`

  return (
    <div ref={rootRef} className={cn("w-[560px] tabular-nums", className)}>
      {/* the header, three tiers (spec 14.1): name and symbol, the price, the move and its window */}
      <div className="mb-3 flex items-baseline justify-between text-[12px]">
        <span className="truncate text-foreground/45">{title}</span>
        <span className="shrink-0 pl-3 font-medium text-foreground/90">{symbol}</span>
      </div>
      {/* going between the window's close and the pointed day, the readout crosses over
          (4px, 2px blur, 150ms); while scrubbing it follows the pointer in place */}
      <div role="status">
        <motion.div
          key={hv ? "scrub" : "rest"}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          <p className="m-0 text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
            {headWhole}
            <span className="text-foreground/35">{headDecimals}</span>
          </p>
          <p className="mb-0 mt-2 flex items-baseline gap-[7px] text-[12px] font-medium" style={{ color: shownChange >= 0 ? GREEN : RED }}>
            <span>{signed(shownChange)}</span>
            <span className="font-normal text-foreground/45">{hv ? fmtDay(win.start + hv.i, crossesYear) : span}</span>
          </p>
        </motion.div>
      </div>

      {/* detail chart */}
      <svg
        ref={mainRef}
        width={W}
        height={MAIN_H}
        viewBox={`0 0 ${W} ${MAIN_H}`}
        className="mt-4 block cursor-crosshair touch-none"
        onPointerMove={onMainMove}
        onPointerLeave={() => setHover(null)}
        onPointerCancel={() => setHover(null)}
        role="img"
        aria-label={`Price from ${span}: ${money(close)} at the end, ${changeText} over the window`}
      >
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.1" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          {/* the line and its fill sweep in left to right, a few px wide of the plot for the round caps */}
          <clipPath id={`${uid}-reveal`}>
            <motion.rect
              x={0}
              y={0}
              height={MAIN_H}
              initial={reduced ? false : { width: 0 }}
              animate={{ width: play ? W - PAD.r + 4 : 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
            />
          </clipPath>
        </defs>

        {/* price axis: ticks derived from the windowed min and max */}
        {AXIS_TICKS.map((f) => {
          const ty = PAD.t + f * (MAIN_H - PAD.t - PAD.b)
          return (
            <g key={f}>
              {f > 0 && f < 1 && (
                <line x1={PAD.l} y1={ty} x2={W - PAD.r} y2={ty} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} />
              )}
              <text
                x={W - PAD.r + 8}
                y={ty + (f === 0 ? 4 : f === 1 ? 0 : 3)}
                fontSize={9}
                fill="var(--foreground)"
                fillOpacity={0.45}
                /* a figure under the pointed tag fades aside for it */
                style={{ opacity: hv && Math.abs(hv.y - ty) < 12 ? 0 : 1, transition: "opacity 150ms" }}
              >
                {money(detail.max - f * (detail.max - detail.min), detail.axisPrecision)}
              </text>
            </g>
          )
        })}

        <g clipPath={`url(#${uid}-reveal)`}>
          <motion.path fill={`url(#${uid}-fill)`} initial={false} animate={{ d: detail.area }} transition={morph} />
          <motion.path
            fill="none"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ d: detail.line }}
            transition={morph}
          />
        </g>

        {hv && (
          <g pointerEvents="none">
            <line x1={hv.x} y1={PAD.t} x2={hv.x} y2={MAIN_H - PAD.b} stroke="var(--foreground)" strokeOpacity={0.22} strokeWidth={1} />
            <circle cx={hv.x} cy={hv.y} r={3} fill={color} stroke="var(--background)" strokeWidth={1.5} />
            <AxisTag x={W - PAD.r + 4} y={hv.y} width={PAD.r - 6} color={color}>
              {money(hv.v, detail.axisPrecision)}
            </AxisTag>
          </g>
        )}
      </svg>

      {/* mini-map: the whole history, with the window drawn over it */}
      <div
        tabIndex={0}
        role="slider"
        aria-label="Window over the price history. Arrow keys pan, plus and minus zoom"
        aria-valuemin={0}
        aria-valuemax={len - 1}
        aria-valuenow={win.start}
        aria-valuetext={span}
        onKeyDown={onNavKey}
        onFocus={(e) => setFocusRing(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFocusRing(false)}
        className="mt-2 outline-none"
      >
        <svg
          ref={navRef}
          width={W}
          height={NAV_H}
          viewBox={`0 0 ${W} ${NAV_H}`}
          className="block touch-none select-none"
          style={held ? { cursor: grip === "move" ? "grabbing" : "ew-resize" } : undefined}
          onPointerMove={onNavMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={point(null)}
          role="img"
          aria-label={`Whole history, ${len} days. Window: ${span}`}
        >
          <defs>
            <clipPath id={`${uid}-win`}>
              <rect x={wx0} y={WIN_GAP} width={Math.max(0, wx1 - wx0)} height={NAV_H - WIN_GAP * 2} rx={WIN_R} />
            </clipPath>
          </defs>
          {/* the lane the whole history lies in, 2px wider than the plot each side so the
              window keeps the same gap at its ends as above and below; keyboard focus rings
              the lane's own edge, inset, in ink */}
          <rect
            x={PAD.l - WIN_GAP}
            y={0}
            width={PLOT_W + WIN_GAP * 2}
            height={NAV_H}
            rx={LANE_R}
            fill={LANE_FILL}
          />
          {focusRing && (
            <rect
              x={PAD.l - WIN_GAP + 0.5}
              y={0.5}
              width={PLOT_W + WIN_GAP * 2 - 1}
              height={NAV_H - 1}
              rx={LANE_R - 0.5}
              fill="none"
              stroke="var(--foreground)"
              strokeOpacity={0.3}
              strokeWidth={1}
              pointerEvents="none"
            />
          )}
          {/* the history outside the window is the same line, a step back */}
          <motion.path
            fill="none"
            stroke="var(--foreground)"
            strokeOpacity={0.2}
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ d: nav.line }}
            transition={morph}
          />
          {/* the window itself, a raised block on the lane: grab anywhere inside to pan */}
          <rect
            x={wx0}
            y={WIN_GAP}
            width={Math.max(0, wx1 - wx0)}
            height={NAV_H - WIN_GAP * 2}
            rx={WIN_R}
            className={RAISED_FILL}
            stroke="var(--foreground)"
            strokeOpacity={grip === "move" || grip === "left" || grip === "right" ? 0.28 : 0.14}
            strokeWidth={1}
            onPointerDown={startDrag("move")}
            onPointerEnter={point("move")}
            style={{ cursor: held ? "grabbing" : "grab", transition: "stroke-opacity 150ms ease-out" }}
          />
          <motion.path
            fill="none"
            stroke="var(--foreground)"
            strokeOpacity={0.9}
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath={`url(#${uid}-win)`}
            pointerEvents="none"
            initial={false}
            animate={{ d: nav.line }}
            transition={morph}
          />
          {/* grips: pull to zoom; each handle sits inside the window, 6px in from its edge */}
          {[
            { x: wx0, mode: "left" as const, hx: wx0 + 6 },
            { x: wx1, mode: "right" as const, hx: wx1 - 6 },
          ].map(({ x, mode, hx }) => (
            <g key={mode} onPointerDown={startDrag(mode)} onPointerEnter={point(mode)} style={{ cursor: "ew-resize" }}>
              <rect x={mode === "left" ? x - 6 : x - 10} y={0} width={16} height={NAV_H} fill="transparent" />
              {/* the handle: a 2 by 12 bar in ink, a step stronger under the pointer */}
              <rect
                x={hx - 1}
                y={NAV_H / 2 - 6}
                width={2}
                height={12}
                rx={1}
                fill="var(--foreground)"
                fillOpacity={grip === mode ? 0.9 : 0.5}
                pointerEvents="none"
                style={{ transition: "fill-opacity 150ms ease-out" }}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
