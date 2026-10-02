"use client"

import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Flow Bars, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: money in and out by the day. Thin signed bars off a zero line, twelve
   weeks to a page.
   Read first: the net for the window, in the line above the plot.
   The pointer: moving over the plot reads one day. Dragging sums a run of days, and that
   run stays until the next press. Left and right arrows walk the days, Escape lets go.
   The two arrows under the plot page the window back and forward through time.
   Sketch: lab/FlowBars. Kept: 84 signed bars to a page over a seeded series of three
   pages, the zero axis, the hover reading, drag to sum a window, the pager.
   Changed: inflow is green and outflow red (it was ink and amber); the reading is a line
   of text above the plot, not a box floating over the bars; the brushed window is an
   ink band, not blue; the pager buttons lost their outlines.
   Fixed in the sample numbers: the sketch's headline, 40.02B, came from nowhere while the
   bars were in thousands, so the headline is now the net of the bars on the page; the
   four quarter names under the plot never changed with the page, so the axis now carries
   the dates of the days drawn. The unit is millions of dollars throughout.
   Formulas:
   · net of a window = the sum of its daily flows
   · days in = the count of days with a flow of zero or more
   · axis top = the first step at or above the largest flow, either sign, over the whole
     series, so the scale holds still from page to page
   · bar height = |flow| ÷ axis top × half the plot
   Motion (2026-10-01): once the plot first comes into view the bars grow off the zero line,
   inflows up and outflows down, left to right under one 300ms stagger, done by about 750ms.
   A page turn tweens every bar from the old day's flow to the new one in 350ms, crossing the
   zero line when the sign flips, and the dates under the plot cross-fade. Each bar is drawn
   at half the plot and scaled to its flow, so all of it is CSS transitions on transform.
   Reduced motion draws every state at once. */

const EASE = [0.16, 1, 0.3, 1] as const
const EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)"
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export interface FlowBarsProps {
  /** one signed flow for each day, oldest first */
  data?: number[]
  /** one label for each day */
  labels?: string[]
  /** days drawn at once */
  perPage?: number
  title?: string
  /** written after every figure */
  unit?: string
  className?: string
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
/** a day of a 365-day year as "Mar 25"; 0 is Jan 1 */
const dayLabel = (d: number) => {
  let m = 0
  let r = d
  while (m < 11 && r >= DAYS_IN[m]) {
    r -= DAYS_IN[m]
    m++
  }
  return `${MONTHS[m]} ${r + 1}`
}

const N = 252
/** 252 days of net flow in millions of dollars, Jan 1 to Sep 9 2025, seeded */
const DEFAULT_DATA: number[] = (() => {
  let s = 29
  const out: number[] = []
  for (let i = 0; i < N; i++) {
    s = (s * 48271) % 2147483647
    const r = s / 2147483647 - 0.485
    const spike = i % 67 === 0 ? 2.6 : i % 41 === 0 ? 1.8 : 1
    out.push(Number((r * 9 * spike).toFixed(1)))
  }
  return out
})()
const DEFAULT_LABELS = Array.from({ length: N }, (_, i) => dayLabel(i))

const W = 480
const H = 170
const PAD = { l: 0, r: 40, t: 8, b: 20 }
const PLOT_W = W - PAD.l - PAD.r
const PLOT_H = H - PAD.t - PAD.b

const niceStep = (raw: number) => {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)))
  const n = raw / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow
}
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`

/**
 * Daily net flows as thin signed bars: green above the zero line, red below. Hover reads
 * a day, a drag sums a run of days, the arrows page through time.
 */
export function FlowBars({
  data = DEFAULT_DATA,
  labels = DEFAULT_LABELS,
  perPage = 84,
  title = "Daily net flows",
  unit = "M",
  className,
}: FlowBarsProps) {
  const reduced = useReducedMotion()
  const size = Math.max(1, Math.min(perPage, data.length))
  const pages = Math.max(1, Math.ceil(data.length / size))
  const [page, setPage] = useState(pages - 1)
  const [hover, setHover] = useState<number | null>(null)
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null)
  const dragging = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)
  /* the bars grow off the zero line once, when the plot is first on screen; later changes tween */
  const seen = useInView(svgRef, { once: true, amount: 0.3 })
  const shown = seen || !!reduced
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    if (!seen) return
    const t = setTimeout(() => setGrown(true), 800)
    return () => clearTimeout(t)
  }, [seen])

  /* pages are counted back from the newest day, so the last page is always full */
  const at = Math.min(page, pages - 1)
  const end = data.length - (pages - 1 - at) * size
  const from = Math.max(0, end - size)
  const days = data.slice(from, end)
  const n = days.length
  const label = (i: number) => labels[from + i] ?? `day ${from + i + 1}`

  const peak = Math.max(1e-6, ...data.map((v) => Math.abs(v)))
  const step = niceStep(peak / 2)
  const top = Math.ceil(peak / step) * step
  const ticks: number[] = []
  for (let v = -top; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  const zero = PAD.t + PLOT_H / 2
  const scale = PLOT_H / 2 / top
  const slot = PLOT_W / n

  const brush = sel ? { lo: Math.min(sel.a, sel.b), hi: Math.max(sel.a, sel.b) } : null
  const sum = (lo: number, hi: number) => days.slice(lo, hi + 1).reduce((a, b) => a + b, 0)
  const net = sum(0, n - 1)
  const daysIn = days.filter((v) => v >= 0).length

  const idxAt = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    return Math.max(0, Math.min(n - 1, Math.floor((px - PAD.l) / slot)))
  }
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    const i = idxAt(e)
    dragging.current = true
    setHover(null)
    setSel({ a: i, b: i })
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const i = idxAt(e)
    if (dragging.current) setSel((s) => (s ? { ...s, b: i } : { a: i, b: i }))
    else setHover(i)
  }
  const endDrag = () => {
    dragging.current = false
    /* a press with no drag clears the window */
    setSel((s) => (s && s.a === s.b ? null : s))
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0
    if (d) {
      e.preventDefault()
      setHover((h) => Math.max(0, Math.min(n - 1, (h ?? (d > 0 ? -1 : n)) + d)))
    } else if (e.key === "Escape") {
      setHover(null)
      setSel(null)
    }
  }
  const turn = (d: number) => {
    setGrown(true)
    setPage(Math.max(0, Math.min(pages - 1, at + d)))
    setHover(null)
    setSel(null)
  }

  const reading = (v: number) => (
    <span className="font-medium" style={{ color: v >= 0 ? GREEN : RED }}>
      {signed(v)}
      {unit}
    </span>
  )
  const axis = [...new Set([0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1])]
  const mode = brush && brush.hi > brush.lo ? "brush" : hover !== null ? "hover" : "rest"
  /* 84 bars share one 300ms stagger, so the last starts by 300ms */
  const stagger = Math.min(0.02, 0.3 / Math.max(1, n))
  const half = PLOT_H / 2

  return (
    <div role="group" aria-label={title} className={cn("w-[480px] max-w-full tabular-nums", className)}>
      {/* no visible title (2026-10-01): the net line says what the bars are */}
      <div className="flex items-baseline gap-4">
        <span role="status" className="whitespace-nowrap text-[10.5px] text-foreground/45">
          {/* the line cross-fades when it changes kind or page; within a kind the figures follow at once */}
          <motion.span
            key={`${mode}-${at}`}
            className="inline-block"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
          {brush && brush.hi > brush.lo ? (
            <>
              <span className="font-medium text-foreground/90">
                {label(brush.lo)} to {label(brush.hi)}
              </span>{" "}
              · {brush.hi - brush.lo + 1} days · net {reading(sum(brush.lo, brush.hi))}
            </>
          ) : hover !== null ? (
            <>
              <span className="font-medium text-foreground/90">{label(hover)}</span> · {reading(days[hover])}
            </>
          ) : (
            <>
              {label(0)} to {label(n - 1)} · {daysIn} of {n} days in · net {reading(net)}
            </>
          )}
          </motion.span>
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 block w-full cursor-crosshair touch-none select-none overflow-visible outline-none"
        role="img"
        tabIndex={0}
        aria-label={`${title}, ${label(0)} to ${label(n - 1)}: net ${signed(net)}${unit} over ${n} days, ${daysIn} of them in`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerLeave={() => {
          setHover(null)
          if (dragging.current) endDrag()
        }}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
      >
        {brush && brush.hi > brush.lo && (
          <rect
            x={PAD.l + brush.lo * slot}
            y={PAD.t}
            width={(brush.hi - brush.lo + 1) * slot}
            height={PLOT_H}
            rx={2}
            fill="var(--foreground)"
            fillOpacity={0.06}
          />
        )}

        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              y1={zero - v * scale}
              x2={W - PAD.r}
              y2={zero - v * scale}
              stroke="var(--foreground)"
              strokeOpacity={v === 0 ? 0.14 : 0.05}
              strokeWidth={1}
              strokeDasharray={v === 0 ? undefined : "2 4"}
            />
            <text x={W - PAD.r + 6} y={zero - v * scale + 3} fontSize={9} fill="var(--foreground)" fillOpacity={0.35}>
              {v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)}${unit}`}
            </text>
          </g>
        ))}

        {/* every bar is the upper half of the plot scaled about the zero line: a positive scale is
            an inflow, a negative one folds it under the line as an outflow, so a page turn can
            tween one day's flow into another's. ry is divided by the scale so the corner lands at
            0.8 after it; SVG clamps it to half the bar just as before */}
        <g>
          {days.map((v, i) => {
            const up = v >= 0
            const h = Math.max(1, Math.abs(v) * scale)
            const k = ((up ? 1 : -1) * h) / half
            const lit = brush && brush.hi > brush.lo ? i >= brush.lo && i <= brush.hi : hover === null || hover === i
            return (
              <rect
                key={i}
                x={PAD.l + i * slot + slot * 0.2}
                y={zero - half}
                width={Math.max(1.4, slot * 0.6)}
                height={half}
                rx={0.8}
                ry={0.8 / Math.abs(k)}
                opacity={lit ? 1 : 0.35}
                style={{
                  fill: up ? GREEN : RED,
                  transformOrigin: `0px ${zero}px`,
                  transform: `scaleY(${shown ? k.toFixed(4) : 0})`,
                  transition: reduced
                    ? "none"
                    : `transform ${grown ? 0.35 : 0.45}s ${EASE_CSS} ${grown ? 0 : (i * stagger).toFixed(3)}s, fill 200ms, opacity 140ms`,
                }}
              />
            )
          })}
        </g>

        {hover !== null && !(brush && brush.hi > brush.lo) && (
          <line
            x1={PAD.l + hover * slot + slot / 2}
            y1={PAD.t}
            x2={PAD.l + hover * slot + slot / 2}
            y2={PAD.t + PLOT_H}
            stroke="var(--foreground)"
            strokeOpacity={0.18}
            strokeWidth={1}
            pointerEvents="none"
          />
        )}

        {/* the dates cross-fade on a page turn */}
        {axis.map((i, k) => (
          <motion.text
            key={`${i}-${label(i)}`}
            x={PAD.l + i * slot + (k === 0 ? 0 : k === axis.length - 1 ? slot : slot / 2)}
            y={H - 5}
            textAnchor={k === 0 ? "start" : k === axis.length - 1 ? "end" : "middle"}
            fontSize={9}
            fill="var(--foreground)"
            fillOpacity={0.35}
            initial={reduced || !grown ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            {label(i)}
          </motion.text>
        ))}
      </svg>

      <div className="mt-1 flex items-center justify-center gap-2">
        <button
          type="button"
          aria-label="Earlier days"
          onClick={() => turn(-1)}
          disabled={at === 0}
          className="grid h-7 w-7 place-items-center rounded-full text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M6.5 1.5L3 5l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="w-[72px] text-center text-[10.5px] text-foreground/45">
          page {at + 1} of {pages}
        </span>
        <button
          type="button"
          aria-label="Later days"
          onClick={() => turn(1)}
          disabled={at === pages - 1}
          className="grid h-7 w-7 place-items-center rounded-full text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M3.5 1.5L7 5 3.5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
