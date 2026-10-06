"use client"

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { SEGMENT_OFF, SURFACE, THUMB, TRACK } from "@/components/ui/control-classes"
import { LiveFigure } from "@/components/ui/live-figure"

/* Simple Chart, the compact boxed member of the Price card family (with Market Snapshot).
   2026-10-02 audit: redesigned. It was a near copy of Market Snapshot (the same pull to
   refresh, ring, header, line and pills) that never printed what it showed, so as a
   variant it swapped nothing but the period set. It now answers the same question with a
   different look at the same 340px width:
   · a box: the surface step (7% foreground into the background), radius 24 with a 10px
     padding, so 24 = 14 (the switcher's half height) + 10; the text sits 16px in
   · the three tier header: the name at /45 with the symbol at /90 beside it, the window
     switcher (1H 4H 1D) on the label row's right in the control material (TRACK, THUMB,
     SEGMENT_OFF), the price at 26px with its cents at /35, the move in its hue and the
     window at /45
   · under it a low 64px area sparkline that runs to the box's edges: a 1.8px line over a
     gradient fill at 0.16
   · scrubbing reads into the header in place; the readout swaps (4px, 2px blur) only when
     a scrub starts or ends or the window changes, never on each step. Arrow keys scrub
     the line when it has focus, Escape lets go
   · no pull to refresh and no ring: Market Snapshot keeps that gesture, and the duplicated
     code is gone. The aria-label says price, not balance
   Props are unchanged.
   Formulas:
   · a window's open = last ÷ (1 + change × the window's share of the day ÷ 100)
   · the walk is de-trended so it opens at that open and closes on `last` exactly
   · move = the pointed value (or last) − the open; percent = move ÷ open × 100
   Motion: the line wipes in from the left once, 850ms, when the box first comes into
   view; a window switch morphs the line point for point in 380ms (every walk is 60
   samples). Reduced motion draws every state at once. */

const UP = "var(--chart-up)"
const DOWN = "var(--chart-down)"
const EASE = [0.16, 1, 0.3, 1] as const
const EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)"

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const N = 60
/** the plot is drawn in a 100 × 40 box stretched to the block; the stroke stays 1.8px */
const VB_W = 100
const VB_H = 40
/** where the line ends, so the end dot sits inside the box */
/* the line runs to the box's right edge (his call, 2026-10-02: "no padding on the right, it
   seems like there is just a gap there"); the end dot steps in instead of the line stopping short */
const END_X = 100
/** the band's height in layout pixels */
const BAND = 64

const WINDOWS = [
  { key: "1H", label: "past hour", minutes: 60, share: 0.2 },
  { key: "4H", label: "past 4 hours", minutes: 240, share: 0.45 },
  { key: "1D", label: "today", minutes: 1440, share: 1 },
] as const
type WindowKey = (typeof WINDOWS)[number]["key"]

/** a fixed "now" so every render agrees; scrub times count back from it */
const NOW_MIN = 17 * 60 + 24

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
const clock = (m: number) => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
}

/**
 * The compact asset price in a box: one number over a low area sparkline. Scrubbing the
 * line moves a dot along it, and the number, the move and the time read that point;
 * leaving settles them back to the latest. The window switch (1H, 4H, 1D) sits in the
 * label row.
 */
export function SimpleChart({
  name = "Ethereum",
  symbol = "ETH",
  last = 3050,
  change = 1.4,
  className,
}: {
  name?: string
  symbol?: string
  /** the live price; the line ends here */
  last?: number
  /** the day's move in percent; a window's line opens at last ÷ (1 + its share of the move) */
  change?: number
  className?: string
}) {
  const reduced = useReducedMotion() ?? false
  const uid = useId()
  const [win, setWin] = useState<WindowKey>("1D")
  const [hover, setHover] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const seen = useInView(plotRef, { once: true, amount: 0.3 })
  const shown = seen || reduced

  const winIndex = WINDOWS.findIndex((o) => o.key === win)
  const w = WINDOWS[winIndex]

  const series = useMemo(() => {
    const rand = mulberry32(41 + winIndex * 13)
    const open = last / (1 + (change * w.share) / 100)
    const steps: number[] = []
    let v = 0
    for (let i = 0; i < N; i++) {
      steps.push(v)
      v += (rand() - 0.5) * last * 0.006
    }
    // two passes of a 7-sample mean: the walk keeps its shape but loses the tick-level jitter
    const soft = [0, 1].reduce((arr) => arr.map((_, i) => {
      const lo = Math.max(0, i - 3)
      const hi = Math.min(arr.length - 1, i + 3)
      let sum = 0
      for (let k = lo; k <= hi; k++) sum += arr[k]
      return sum / (hi - lo + 1)
    }), steps)
    // de-trended after smoothing, so the line still opens at `open` and closes on `last` exactly
    const drift = soft[N - 1] - soft[0]
    const vals = soft.map((s, i) => open + (s - soft[0] - (drift * i) / (N - 1)) + ((last - open) * i) / (N - 1))
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    /* the line keeps to the band's upper part so the fill under it has room to fade, and runs
       edge to edge; the end dot is held 4px inside the box below, so it is never clipped */
    const pts = vals.map((val, i) => ({ x: (i / (N - 1)) * END_X, y: 4 + (1 - (val - lo) / (hi - lo || 1)) * (VB_H - 14), val }))
    const d = smoothPath(pts)
    return { open, pts, d, area: `${d} L${END_X} ${VB_H} L0 ${VB_H} Z` }
  }, [last, change, w.share, winIndex])

  const at = hover ?? N - 1
  const point = series.pts[at]
  const move = point.val - series.open
  const pct = (move / (series.open || 1)) * 100
  const lineHue = last >= series.open ? UP : DOWN
  const when = hover == null ? w.label : clock(NOW_MIN - (1 - hover / (N - 1)) * w.minutes)
  const [whole, cents] = money(point.val).split(".")

  const scrubTo = (clientX: number) => {
    const r = plotRef.current?.getBoundingClientRect()
    if (!r) return
    setHover(Math.max(0, Math.min(N - 1, Math.round(((clientX - r.left) / ((r.width * END_X) / VB_W)) * (N - 1)))))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      setHover((h) => Math.max(0, Math.min(N - 1, (h ?? N - 1) + (e.key === "ArrowLeft" ? -step : step))))
    } else if (e.key === "Escape") setHover(null)
  }

  return (
    <div
      role="group"
      aria-label={`${name} (${symbol}) price, ${move >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)} percent over the ${w.label}`}
      className={cn("w-[340px] max-w-full overflow-hidden rounded-[24px] p-[10px] tabular-nums", SURFACE, className)}
    >
      {/* the label row: the name and its symbol, the window switch on the right */}
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-1.5 pl-1.5 text-[12px]">
          <span className="truncate text-foreground/45">{name}</span>
          <span className="shrink-0 font-medium text-foreground/90">{symbol}</span>
        </span>
        <div className={cn("relative flex shrink-0 gap-0.5", TRACK)} role="group" aria-label="Window">
          <span
            aria-hidden
            className={cn("absolute inset-y-0.5 left-0.5 w-9 rounded-full", THUMB)}
            style={{
              transform: `translateX(${winIndex * 38}px)`,
              transition: reduced ? "none" : `transform 250ms cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          />
          {WINDOWS.map((o) => {
            const on = o.key === win
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={on}
                aria-label={`Show ${o.label}`}
                onClick={() => {
                  setWin(o.key)
                  setHover(null)
                }}
                className={cn(
                  "relative z-[1] h-7 w-9 rounded-full text-[11.5px] font-medium outline-none transition-[color,scale] duration-200 active:scale-[0.97] focus-visible:text-foreground/90 motion-reduce:active:scale-100",
                  on ? "text-foreground/90" : SEGMENT_OFF,
                )}
              >
                {o.key}
              </button>
            )
          })}
        </div>
      </div>

      {/* the readout: it swaps only when a scrub starts or ends or the window changes */}
      <div role="status" className="px-1.5 pt-2">
        <LiveFigure intent={`${win}-${hover == null ? "live" : "scrub"}`}>
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
        </LiveFigure>
      </div>

      {/* the sparkline runs to the box's edges; arrow keys scrub it when it has focus */}
      <div
        ref={plotRef}
        tabIndex={0}
        role="slider"
        aria-label={`${symbol} price over the ${w.label}`}
        aria-valuemin={0}
        aria-valuemax={N - 1}
        aria-valuenow={at}
        aria-valuetext={`$${money(point.val)} at ${when}`}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        onPointerMove={(e) => scrubTo(e.clientX)}
        onPointerDown={(e) => scrubTo(e.clientX)}
        onPointerLeave={() => setHover(null)}
        className="relative -mx-[10px] -mb-[10px] mt-4 block cursor-crosshair touch-pan-y outline-none focus-visible:bg-foreground/[0.03]"
        style={{ color: lineHue, height: BAND, transition: reduced ? undefined : "color 200ms" }}
      >
        <motion.div
          className="h-full"
          initial={reduced ? false : { clipPath: "inset(-10% 100% -10% 0%)" }}
          animate={{ clipPath: shown ? "inset(-10% 0% -10% 0%)" : "inset(-10% 100% -10% 0%)" }}
          transition={reduced ? { duration: 0 } : { duration: 0.85, ease: EASE }}
        >
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="block h-full w-full overflow-visible" aria-hidden>
            <defs>
              <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.16} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <motion.path
              initial={false}
              animate={{ d: series.area }}
              transition={reduced ? { duration: 0 } : { duration: 0.38, ease: EASE }}
              fill={`url(#${uid}-fill)`}
            />
            <motion.path
              initial={false}
              animate={{ d: series.d }}
              transition={reduced ? { duration: 0 } : { duration: 0.38, ease: EASE }}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </motion.div>
        {/* the guide and the dot are HTML over the stretched SVG, so they keep their shape */}
        <i
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -ml-[0.5px] w-px bg-foreground transition-opacity duration-150"
          style={{ left: `${point.x}%`, opacity: hover == null ? 0 : 0.18 }}
        />
        <i
          aria-hidden
          className="pointer-events-none absolute -ml-[3.5px] -mt-[3.5px] h-[7px] w-[7px] rounded-full bg-current"
          style={{
            left: `min(${point.x}%, calc(100% - 4px))`,
            top: `${((point.y / VB_H) * 100).toFixed(3)}%`,
            scale: hover == null ? 1 : 1.3,
            opacity: shown ? 1 : 0,
            transition: reduced ? "none" : `scale 160ms ${EASE_CSS}, opacity 250ms ${EASE_CSS} 350ms`,
          }}
        />
      </div>
    </div>
  )
}
