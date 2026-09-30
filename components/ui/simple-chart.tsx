"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Simple Chart, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card: the 26px rounded ground is gone, it sits on the page. Pulling still moves the
     whole block down and the ring of dots gathers in the room it leaves
   · one large size, 26px, for the price. The cents step back by ink, not by a second size
   · every figure is tabular, set once on the root
   · the line is 1.8px and draws in once on mount; the scrub mark is a plain dot, not a
     ring cut out of a card colour
   · nothing moves for longer than 400ms and nothing overshoots: the settle is 360ms and
     the window fill 250ms, both on the house ease (they were 480ms and 380ms)
   · the price and the move are a status readout, so scrubbing is read out in place
   Props are unchanged. */

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
const PAD_Y = 6
const PULL_AT = 64 // px of pull that commits a refresh
const PULL_MAX = 96 // the rubber band's ceiling
const PULL_HOLD = 56 // where the block waits while the refresh runs
const HOLD_MS = 1000
const SETTLE_MS = 360
const DOTS = 6

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

type Phase = "idle" | "pull" | "work" | "settle"

/**
 * The compact asset price: one number over one smooth line. Scrubbing the line moves a
 * dot along it with a faint guide, and the number, the move and the time all read that
 * point; leaving settles them back to live. The window tabs (1H, 4H, 1D) slide one fill
 * between them. Pull the block down to refresh: a ring of dots gathers as it stretches,
 * spins while it holds, and the block settles back on the new price. Every walk is
 * de-trended onto the two numbers it prints, so the move is (value − open) and the
 * percent is that over open.
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
  /** the day's move in percent; a window's line opens at live ÷ (1 + its share of the move) */
  change?: number
  className?: string
}) {
  const reduced = useReducedMotion() ?? false
  const [win, setWin] = useState<WindowKey>("1D")
  const [tick, setTick] = useState(0) // refreshes so far; each one steps the live price
  const [hover, setHover] = useState<number | null>(null)
  const [pull, setPull] = useState(0)
  const [phase, setPhase] = useState<Phase>("idle")
  const plotRef = useRef<HTMLSpanElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; axis: "none" | "x" | "y" } | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const winIndex = WINDOWS.findIndex((o) => o.key === win)
  const w = WINDOWS[winIndex]

  // the live price after each refresh: one small, seeded step per pull
  const live = useMemo(() => {
    let p = last
    for (let t = 1; t <= tick; t++) p *= 1 + (mulberry32(900 + t)() - 0.45) * 0.012
    return p
  }, [last, tick])

  const series = useMemo(() => {
    const rand = mulberry32(41 + winIndex * 13 + tick * 7)
    const open = live / (1 + (change * w.share) / 100)
    const steps: number[] = []
    let v = 0
    for (let i = 0; i < N; i++) {
      steps.push(v)
      v += (rand() - 0.5) * live * 0.006
    }
    // two passes of a 7-sample mean: the walk keeps its shape but loses the tick-level jitter
    const soft = [0, 1].reduce((arr) => arr.map((_, i) => {
      const lo = Math.max(0, i - 3)
      const hi = Math.min(arr.length - 1, i + 3)
      let sum = 0
      for (let k = lo; k <= hi; k++) sum += arr[k]
      return sum / (hi - lo + 1)
    }), steps)
    // de-trended after smoothing, so the line still opens at `open` and closes on `live` exactly
    const drift = soft[N - 1] - soft[0]
    const vals = soft.map((s, i) => open + (s - soft[0] - (drift * i) / (N - 1)) + ((live - open) * i) / (N - 1))
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pts = vals.map((val, i) => ({ x: (i / (N - 1)) * VB_W, y: 4 + (1 - (val - lo) / (hi - lo || 1)) * (VB_H - 8), val }))
    return { open, pts, d: smoothPath(pts) }
  }, [live, change, w.share, winIndex, tick])

  const at = hover ?? N - 1
  const point = series.pts[at]
  const move = point.val - series.open
  const pct = (move / (series.open || 1)) * 100
  const lineHue = live >= series.open ? UP : DOWN
  const when = hover == null ? w.label : clock(NOW_MIN - (1 - hover / (N - 1)) * w.minutes)
  const [whole, cents] = money(point.val).split(".")

  const scrubTo = (clientX: number) => {
    const r = plotRef.current?.getBoundingClientRect()
    if (!r) return
    setHover(Math.max(0, Math.min(N - 1, Math.round(((clientX - r.left) / r.width) * (N - 1)))))
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
        setTick((t) => t + 1)
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

  return (
    <div className={cn("relative w-full max-w-[320px] overflow-hidden tabular-nums", className)}>
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
        aria-label={`${name} balance. Pull down or press Enter to refresh.`}
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
        <motion.div
          role="status"
          /* a window switch, a refresh, or starting and ending a scrub swaps the readout in place
             (4px, 2px blur, 150ms); the scrub itself moves the figures at once */
          key={`${win}-${tick}-${hover == null ? "live" : "scrub"}`}
          initial={reduced ? { opacity: 0.4 } : { opacity: 0.4, y: 4, filter: "blur(2px)" }}
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

        <span
          ref={plotRef}
          className="relative mb-1.5 mt-5 block cursor-crosshair touch-pan-y"
          style={{ color: lineHue, paddingBlock: PAD_Y }}
          onPointerMove={(e) => e.pointerType === "mouse" && phase !== "pull" && scrubTo(e.clientX)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
        >
          {/* the line is stretched with a stroke that keeps its width, so it draws in by
              a wipe from the left instead of a dash */}
          <motion.span
            className="block"
            initial={reduced ? false : { clipPath: "inset(-10% 100% -10% -10%)" }}
            animate={{ clipPath: "inset(-10% -10% -10% -10%)" }}
            transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }}
          >
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              className="block h-[92px] w-full overflow-visible"
              role="img"
              aria-label={`${symbol} price ${money(point.val)} dollars, ${move >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)} percent over the ${w.label}`}
            >
              {/* a new window or a refresh cross-fades the line in, 200ms; the wipe above runs once on mount */}
              <motion.path
                key={`${win}-${tick}`}
                d={series.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: EASE }}
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
            aria-hidden
            className="pointer-events-none absolute -ml-[3.5px] -mt-[3.5px] h-[7px] w-[7px] rounded-full bg-current"
            style={{
              left: `${point.x}%`,
              top: `calc(${PAD_Y}px + (100% - ${PAD_Y * 2}px) * ${(point.y / VB_H).toFixed(4)})`,
              scale: hover == null ? 1 : 1.3,
              transition: reduced ? "none" : `scale 160ms ${EASE_CSS}`,
            }}
          />
        </span>

        <div className="relative mt-4 flex gap-1" role="group" aria-label="Window">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full bg-foreground/[0.08]"
            style={{
              width: `calc((100% - ${(WINDOWS.length - 1) * 4}px) / ${WINDOWS.length})`,
              transform: `translateX(calc(${winIndex} * (100% + 4px)))`,
              transition: reduced ? "none" : `transform 250ms ${EASE_CSS}`,
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
                  "relative z-[1] h-7 flex-1 rounded-full text-[11.5px] font-medium outline-none transition-[color,scale] duration-200 active:scale-[0.97] focus-visible:text-foreground/90",
                  on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90",
                )}
              >
                {o.key}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
