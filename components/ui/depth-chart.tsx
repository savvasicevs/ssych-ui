"use client"

import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Depth Chart, written new through ssych-component (2026-09-29).
   What it is for: seeing how much size rests on each side of the mid, and how far the
   price has to travel to walk through a given amount of it.
   Read first: the mid price in the middle of the line above the chart.
   The pointer: scrub across the chart. The distance from the mid is mirrored, so both
   sides answer at once: the run inside that distance stays lit, the rest dims, and the
   line above reads the size resting down to the bid price and up to the ask price. The
   arrow keys do the same; the pills set how far from the mid the chart reaches.
   Sketch used: src/components/lab/DepthChartPro.tsx. Kept: the level shape (price, size),
   levels summed outward from the mid into a staircase that runs flat to the edge, the
   window set as a distance from the mid, and the mirrored readout. Changed: it is drawn in
   SVG, not on a canvas; the zoom is a row of pills, not the wheel; the readout is plain
   text above the chart, not labels floating on it; the feed is left to the caller.
   Reference ("depth chart" on browsable, listings only, no code read): the idea that the
   crosshair reports the size resting up to a price, not the size at it.
   Formulas:
   · mid          (best bid + best ask) ÷ 2
   · window       mid × reach ÷ 100 either side of the mid
   · bid depth    Σ size of bids priced at or above mid − distance
   · ask depth    Σ size of asks priced at or below mid + distance
   · distance     |pointer price − mid|, snapped to the tick, shown as distance ÷ mid × 100
   · at rest      distance is the whole window, so the figures are everything drawn
   · height       depth ÷ (the larger side's depth in the window × 1.15)
   Motion (2026-10-01): once the chart first comes into view one clip opens both staircases
   outward from the mid, 800ms (it was a 400ms dash draw on mount). A new reach zooms: the
   window and the height scale ease from the old values to the new ones in 380ms (the window
   on a log scale, so the zoom reads even), and every frame between is a true redraw of the
   book at that window, levels entering and leaving at the edges. It writes four path
   attributes per frame, no React state. The size gridlines and the price labels cross-fade.
   Reduced motion draws every state at once. */

const EASE = [0.16, 1, 0.3, 1] as const
const TAB_EASE = [0.22, 1, 0.36, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export interface DepthLevel {
  price: number
  /** size resting at this price, in the base unit */
  size: number
}

export interface DepthChartProps {
  symbol?: string
  /** the unit sizes are counted in */
  unit?: string
  bids?: DepthLevel[]
  asks?: DepthLevel[]
  /** the smallest price step of the market */
  tick?: number
  /** how far from the mid the chart can reach, in percent; the last is the opening one */
  reaches?: number[]
  priceDp?: number
  sizeDp?: number
  className?: string
}

const TICK = 0.5
/** 67,412.5 counted in half-dollar ticks */
const MID_TICKS = 134825

/** A seeded book: 60 levels a side across about one percent of the price, with a few walls. */
const DEFAULT_BOOK: { bids: DepthLevel[]; asks: DepthLevel[] } = (() => {
  let seed = 13482
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const side = (dir: 1 | -1) => {
    const out: DepthLevel[] = []
    let t = MID_TICKS + dir
    for (let i = 0; i < 60; i++) {
      const wall = rnd() < 0.08 ? 4.5 : 1
      out.push({ price: t * TICK, size: Math.round((0.2 + rnd() * 2.2) * wall * 1000) / 1000 })
      t += dir * (2 + Math.floor(rnd() * 40))
    }
    return out
  }
  return { bids: side(-1), asks: side(1) }
})()

const DEFAULT_REACHES = [0.25, 0.5, 1]

const W = 480
const H = 200
const PAD = { t: 8, b: 20 }
const FLOOR = H - PAD.b

const num = (n: number, dp: number) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
/** a round step for the size gridlines: 1, 2 or 5 times a power of ten */
const nice = (raw: number) => {
  if (!(raw > 0)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / p
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p
}
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

type Step = { price: number; depth: number }

/** running depth of one side, from the touch outward */
function steps(levels: DepthLevel[]): Step[] {
  let depth = 0
  return levels.map((l) => {
    depth += l.size
    return { price: l.price, depth }
  })
}

/** Both staircases and their fills for a window `half` either side of the mid, scaled so
 *  `top` is the full height. The rest state is drawn with it, and so is every zoom frame. */
function drawBook(bids: DepthLevel[], asks: DepthLevel[], mid: number, half: number, top: number) {
  const lo = mid - half
  const hi = mid + half
  const x = (p: number) => ((p - lo) / (hi - lo)) * W
  const y = (v: number) => PAD.t + (1 - v / top) * (FLOOR - PAD.t)
  const stair = (pts: Step[], edge: number) => {
    if (!pts.length) return ""
    let d = `M ${x(pts[0].price).toFixed(1)} ${y(0).toFixed(1)}`
    let prev = 0
    for (const p of pts) {
      d += ` L ${x(p.price).toFixed(1)} ${y(prev).toFixed(1)} L ${x(p.price).toFixed(1)} ${y(p.depth).toFixed(1)}`
      prev = p.depth
    }
    return `${d} L ${x(edge).toFixed(1)} ${y(prev).toFixed(1)}`
  }
  const bidLine = stair(steps(bids.filter((l) => l.price >= lo)), lo)
  const askLine = stair(steps(asks.filter((l) => l.price <= hi)), hi)
  return {
    bidLine,
    askLine,
    bidArea: bidLine ? `${bidLine} L ${x(lo).toFixed(1)} ${y(0).toFixed(1)} Z` : "",
    askArea: askLine ? `${askLine} L ${x(hi).toFixed(1)} ${y(0).toFixed(1)} Z` : "",
  }
}

/**
 * Two staircases either side of the mid: bids climbing to the left, asks to the right,
 * each step the size resting from the touch out to that price. Scrubbing reads both sides
 * at the same distance from the mid, in the line above the chart.
 */
export function DepthChart({
  symbol = "BTC-USD",
  unit = "BTC",
  bids = DEFAULT_BOOK.bids,
  asks = DEFAULT_BOOK.asks,
  tick = TICK,
  reaches = DEFAULT_REACHES,
  priceDp = 1,
  sizeDp = 2,
  className,
}: DepthChartProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const boxRef = useRef<HTMLDivElement>(null)
  const [reach, setReach] = useState(reaches[reaches.length - 1] ?? 1)
  /** distance from the mid being pointed at, in price; null at rest */
  const [dist, setDist] = useState<number | null>(null)

  const book = useMemo(() => {
    const b = [...bids].sort((x, y) => y.price - x.price)
    const a = [...asks].sort((x, y) => x.price - y.price)
    const mid = ((b[0]?.price ?? 0) + (a[0]?.price ?? 0)) / 2
    const half = Math.max(tick, (mid * reach) / 100)
    const lo = mid - half
    const hi = mid + half
    const bidSteps = steps(b.filter((l) => l.price >= lo))
    const askSteps = steps(a.filter((l) => l.price <= hi))
    const top = Math.max(bidSteps[bidSteps.length - 1]?.depth ?? 0, askSteps[askSteps.length - 1]?.depth ?? 0, 1e-9) * 1.15
    return { b, a, mid, half, lo, hi, bidSteps, askSteps, top }
  }, [bids, asks, reach, tick])
  const { b: sortedBids, a: sortedAsks, mid, half, lo, hi, bidSteps, askSteps, top } = book

  const x = (p: number) => ((p - lo) / (hi - lo)) * W
  const y = (v: number) => PAD.t + (1 - v / top) * (FLOOR - PAD.t)

  const { bidLine, askLine, bidArea, askArea } = useMemo(() => drawBook(sortedBids, sortedAsks, mid, half, top), [sortedBids, sortedAsks, mid, half, top])

  /* the entrance waits until the chart is on screen */
  const seen = useInView(boxRef, { once: true, amount: 0.3 })
  const shown = seen || !!reduced

  /* the zoom: the four live paths are redrawn at every window between the old reach and the
     new one. React renders the end state; this effect paints over it before the browser does,
     and lands on the same strings */
  const bidLineRef = useRef<SVGPathElement>(null)
  const askLineRef = useRef<SVGPathElement>(null)
  const bidAreaRef = useRef<SVGPathElement>(null)
  const askAreaRef = useRef<SVGPathElement>(null)
  const drawn = useRef({ half, top })
  useLayoutEffect(() => {
    const paint = (h: number, t: number) => {
      const g = drawBook(sortedBids, sortedAsks, mid, h, t)
      bidLineRef.current?.setAttribute("d", g.bidLine)
      askLineRef.current?.setAttribute("d", g.askLine)
      bidAreaRef.current?.setAttribute("d", g.bidArea)
      askAreaRef.current?.setAttribute("d", g.askArea)
      drawn.current = { half: h, top: t }
    }
    const from = drawn.current
    if (reduced || (from.half === half && from.top === top) || !(from.half > 0)) {
      paint(half, top)
      return
    }
    paint(from.half, from.top)
    const run = animate(0, 1, {
      duration: 0.38,
      ease: EASE,
      onUpdate: (k) => paint(from.half * Math.pow(half / from.half, k), from.top + (top - from.top) * k),
      onComplete: () => paint(half, top),
    })
    return () => run.stop()
  }, [sortedBids, sortedAsks, mid, half, top, reduced])

  /* the reading: at rest the distance is the whole window */
  const d = dist ?? half
  const bidPrice = mid - d
  const askPrice = mid + d
  const bidDepth = bidSteps.reduce((s, p) => (p.price >= bidPrice ? p.depth : s), 0)
  const askDepth = askSteps.reduce((s, p) => (p.price <= askPrice ? p.depth : s), 0)
  const pct = mid > 0 ? (d / mid) * 100 : 0

  const snap = (v: number) => clamp(Math.round(v / tick) * tick, 0, half)
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const price = lo + clamp((e.clientX - r.left) / r.width, 0, 1) * (hi - lo)
    setDist(snap(Math.abs(price - mid)))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") return setDist(null)
    const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0
    if (!dir) return
    e.preventDefault()
    setDist((v) => snap((v ?? half / 2) + dir * (half / 40)))
  }

  const crossFade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: reduced ? { duration: 0 } : { duration: 0.25, ease: EASE },
  }
  const gridStep = nice(top / 3.2)
  const grid = [1, 2, 3].map((k) => k * gridStep).filter((v) => v < top)
  const axis = [0, 0.25, 0.5, 0.75, 1].map((k) => lo + k * (hi - lo))

  const curves = (live: boolean) => (
    <>
      {bidArea && <path ref={live ? bidAreaRef : undefined} d={bidArea} fill={`url(#${uid}-bid)`} />}
      {askArea && <path ref={live ? askAreaRef : undefined} d={askArea} fill={`url(#${uid}-ask)`} />}
      {bidLine && <path ref={live ? bidLineRef : undefined} d={bidLine} fill="none" stroke={GREEN} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />}
      {askLine && <path ref={live ? askLineRef : undefined} d={askLine} fill="none" stroke={RED} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />}
    </>
  )

  return (
    <div role="group" aria-label={`${symbol} depth`} className={cn("w-[480px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}>
      {/* no visible title (2026-10-01): the readout says what it is; the reach sits in the top corner */}
      <div className="mb-3 flex items-center justify-end">
        <div role="radiogroup" aria-label="Reach from the mid" className="flex items-center">
          {reaches.map((r) => {
            const on = r === reach
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setReach(r)
                  setDist(null)
                }}
                className={cn(
                  "relative h-7 rounded-full px-2.5 text-[11px] outline-none transition-colors duration-200",
                  on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90",
                )}
              >
                {on &&
                  (reduced ? (
                    <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
                  ) : (
                    <motion.span
                      aria-hidden
                      layoutId={`${uid}-reach`}
                      className="absolute inset-0 rounded-full bg-foreground/[0.08]"
                      transition={{ duration: 0.25, ease: TAB_EASE }}
                    />
                  ))}
                <span className="relative">±{r}%</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* the readout cross-fades when the scrub starts or ends and when the reach changes; while
          scrubbing the figures follow at once */}
      <div role="status">
      <motion.div
        key={`${reach}-${dist === null ? "rest" : "scrub"}`}
        className="mb-2 grid grid-cols-3 items-end"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.15, ease: EASE }}
      >
        <div className="flex flex-col">
          <span className="text-[10.5px] font-medium" style={{ color: ink(GREEN) }}>
            Bids
          </span>
          <span className="mt-0.5 text-[13px] font-semibold text-foreground/90">
            {num(bidDepth, sizeDp)} {unit}
          </span>
          <span className="text-[10px] text-foreground/45">down to {num(bidPrice, priceDp)}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10.5px] text-foreground/45">Mid</span>
          <span className="mt-0.5 text-[13px] font-semibold text-foreground/90">{num(mid, priceDp)}</span>
          <span className="text-[10px] text-foreground/45">±{pct.toFixed(2)}% from it</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10.5px] font-medium" style={{ color: ink(RED) }}>
            Asks
          </span>
          <span className="mt-0.5 text-[13px] font-semibold text-foreground/90">
            {num(askDepth, sizeDp)} {unit}
          </span>
          <span className="text-[10px] text-foreground/45">up to {num(askPrice, priceDp)}</span>
        </div>
      </motion.div>
      </div>

      <div
        ref={boxRef}
        role="slider"
        tabIndex={0}
        aria-label="Distance from the mid price"
        aria-valuemin={0}
        aria-valuemax={Number(reach.toFixed(2))}
        aria-valuenow={Number(pct.toFixed(2))}
        aria-valuetext={`${pct.toFixed(2)}% from the mid: ${num(bidDepth, sizeDp)} ${unit} of bids, ${num(askDepth, sizeDp)} ${unit} of asks`}
        className="relative cursor-crosshair touch-none outline-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setDist(null)}
        onBlur={() => setDist(null)}
        onKeyDown={onKey}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full overflow-visible"
          role="img"
          aria-label={`${symbol} depth within ${reach}% of the mid ${num(mid, priceDp)}: ${num(bidSteps[bidSteps.length - 1]?.depth ?? 0, sizeDp)} ${unit} of bids, ${num(askSteps[askSteps.length - 1]?.depth ?? 0, sizeDp)} ${unit} of asks`}
        >
          <defs>
            <linearGradient id={`${uid}-bid`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity="0.3" />
              <stop offset="100%" stopColor={GREEN} stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id={`${uid}-ask`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RED} stopOpacity="0.3" />
              <stop offset="100%" stopColor={RED} stopOpacity="0.03" />
            </linearGradient>
            {/* the entrance: one clip opens from the mid outward, once */}
            <clipPath id={`${uid}-wipe`}>
              <motion.rect
                y={-4}
                height={H + 8}
                initial={reduced ? { attrX: -4, width: W + 8 } : { attrX: W / 2, width: 0 }}
                animate={shown ? { attrX: -4, width: W + 8 } : { attrX: W / 2, width: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.8, ease: EASE }}
              />
            </clipPath>
            <clipPath id={`${uid}-run`}>
              <rect x={x(bidPrice)} y={0} width={Math.max(0, x(askPrice) - x(bidPrice))} height={FLOOR} />
            </clipPath>
          </defs>

          {/* a new reach cross-fades the size gridlines */}
          <AnimatePresence initial={false}>
            <motion.g key={`g${reach}`} {...crossFade}>
              {grid.map((v) => (
                <g key={v}>
                  <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth="1" />
                  <text x={W / 2 + 5} y={y(v) - 3} fontSize={9} fill="var(--foreground)" fillOpacity={0.35}>
                    {num(v, v < 10 && gridStep < 1 ? 1 : 0)}
                  </text>
                </g>
              ))}
            </motion.g>
          </AnimatePresence>
          <line x1={0} x2={W} y1={FLOOR} y2={FLOOR} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth="1" />
          <line x1={W / 2} x2={W / 2} y1={PAD.t} y2={FLOOR} stroke="var(--foreground)" strokeOpacity={0.16} strokeWidth="1" strokeDasharray="2 4" />

          {/* the whole book, dimmed while a run is being read */}
          <g clipPath={`url(#${uid}-wipe)`}>
            <g style={{ opacity: dist === null ? 1 : 0.35, transition: reduced ? "none" : "opacity 160ms" }}>{curves(true)}</g>
          </g>
          {/* the run inside the distance, at full strength */}
          {dist !== null && (
            <g clipPath={`url(#${uid}-run)`} pointerEvents="none">
              {curves(false)}
            </g>
          )}

          {dist !== null && (
            <g pointerEvents="none">
              <line x1={x(bidPrice)} x2={x(bidPrice)} y1={PAD.t} y2={FLOOR} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth="1" />
              <line x1={x(askPrice)} x2={x(askPrice)} y1={PAD.t} y2={FLOOR} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth="1" />
              <circle cx={x(bidPrice)} cy={y(bidDepth)} r="2.8" fill={GREEN} stroke="var(--background)" strokeWidth="1.5" />
              <circle cx={x(askPrice)} cy={y(askDepth)} r="2.8" fill={RED} stroke="var(--background)" strokeWidth="1.5" />
            </g>
          )}

          {/* and the price labels */}
          <AnimatePresence initial={false}>
            <motion.g key={`a${reach}`} {...crossFade}>
              {axis.map((p, i) => (
                <text
                  key={i}
                  x={i === 0 ? 0 : i === axis.length - 1 ? W : x(p)}
                  y={H - 5}
                  fontSize={9}
                  textAnchor={i === 0 ? "start" : i === axis.length - 1 ? "end" : "middle"}
                  fill="var(--foreground)"
                  fillOpacity={0.35}
                >
                  {num(p, priceDp)}
                </text>
              ))}
            </motion.g>
          </AnimatePresence>
        </svg>
      </div>
    </div>
  )
}
