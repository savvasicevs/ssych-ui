"use client"

import { useCallback, useId, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Price Target Fan, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · a target is green when it is above the price now and red when it is below. It was
     green, blue and amber by position. The mean is drawn at full strength, the high and
     the low at a lower one
   · the floating card with its outline and shadow is gone: the headline is the readout.
     It holds the mean target at rest, the pointed target with its analysts, or the
     scrubbed price with its date
   · the target figures on the right are real buttons, reachable by keyboard and touch
   · the ring that left the now dot every few seconds is gone: the chart draws in once
   · lines are 2px or less, every figure is tabular
   PROPS CHANGED:
   · added `asOf` (optional): the day the history ends on. With it the scrub reads real
     dates; without it the scrub reads weeks back from now. The original read the clock
     of the viewer, which made the sample differ from day to day
   · `targets[n].color` still wins when it is passed; the default targets no longer set it */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

/** A hue as text: in the light theme its lightness is capped so small numbers reach AA
 *  while the chroma stays; in dark it is native (`--ink-l` flips per theme on the root). */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

/** e.g. "Mon, Jul 15", the scrub read-out's date. */
const fmtDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })

/** "+14.8%" with the typographic minus. */
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`

export interface PriceTarget {
  key: string
  price: number
  analysts: number
  /** Any CSS color; the projection, its dot and its label take it. Defaults to the direction against the price now. */
  color?: string
}

const W = 520
const H = 236
const PAD = { l: 30, r: 104, t: 16, b: 28 }

// deterministic weekly history ending exactly at `current` (Lehmer LCG)
function buildHistory(current: number): number[] {
  let s = 17
  let v = 150
  const out: number[] = []
  for (let i = 0; i < 52; i++) {
    s = (s * 16807) % 2147483647
    v = v + (s / 2147483647 - 0.44) * 4.2
    out.push(v)
  }
  const lo = Math.min(...out)
  const hi = Math.max(...out)
  const scaled = out.map((x) => 158 + ((x - lo) / (hi - lo)) * 26)
  const shift = current - scaled[scaled.length - 1]
  return scaled.map((x) => x + shift)
}

export interface PriceTargetFanProps {
  /** accessible name of the chart */
  label?: string
  /** last traded price; the history walks to this point */
  current?: number
  /** High / Mean / Low analyst targets, in that order */
  targets?: [PriceTarget, PriceTarget, PriceTarget]
  /** axis labels, oldest to horizon */
  dates?: { start: string; mid: string; horizon: string }
  /** the day the history ends on; the scrub reads dates from it, weeks back without it */
  asOf?: Date
  className?: string
}

const DEFAULT_TARGETS: [PriceTarget, PriceTarget, PriceTarget] = [
  { key: "High", price: 232, analysts: 9 },
  { key: "Mean", price: 205, analysts: 34 },
  { key: "Low", price: 168, analysts: 6 },
]

/**
 * Analyst price targets: a year of history draws to now, then three dashed projections
 * fan out to the high, mean and low targets. In the fan the nearest projection owns the
 * pointer, so the readout walks from high to mean to low, and the pointed projection
 * draws itself solid while the headline takes its price. Scrubbing the history moves a
 * crosshair and puts that week's price and date in the headline.
 */
export function PriceTargetFan({
  label = "Price target, 12 months",
  current = 178.52,
  targets = DEFAULT_TARGETS,
  dates = { start: "Jul 2025", mid: "Jan 2026", horizon: "Jul 2027" },
  asOf,
  className,
}: PriceTargetFanProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const clipId = `${uid}-fan`
  const fadeId = `${uid}-fade`
  const svgRef = useRef<SVGSVGElement>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [hotT, setHotT] = useState<number | null>(null)

  const hist = useMemo(() => buildHistory(current), [current])
  /* the domain follows the data, so any history and targets fill the height */
  const yLo = Math.min(...hist, ...targets.map((t) => t.price))
  const yHi = Math.max(...hist, ...targets.map((t) => t.price))
  const yPad = Math.max((yHi - yLo) * 0.06, 0.5)
  const yMin = yLo - yPad
  const yMax = yHi + yPad
  const y = useCallback((v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b), [yMin, yMax])
  /** (price − now) ÷ now */
  const pct = (p: number) => ((p - current) / current) * 100
  const fmt = (p: number) => `$${p.toFixed(2)}`

  const geo = useMemo(() => {
    const histW = (W - PAD.l - PAD.r) * 0.56
    const hx = (i: number) => PAD.l + (i / (hist.length - 1)) * histW
    const nowX = hx(hist.length - 1)
    const nowY = y(current)
    const endX = W - PAD.r
    const line = hist.map((v, i) => `${i === 0 ? "M" : "L"}${hx(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    const proj = targets.map((t, i) => {
      const ty = y(t.price)
      const cx = nowX + (endX - nowX) * 0.5
      const cy = nowY + (ty - nowY) * 0.15
      const color = t.color ?? (t.price >= current ? GREEN : RED)
      /* the mean is the consensus, so it is the strong line; the two ends step back */
      return { ...t, color, strength: i === 1 ? 1 : 0.6, ty, d: `M${nowX},${nowY} Q${cx},${cy} ${endX},${ty}`, cx, cy }
    })
    return { hx, nowX, nowY, endX, line, proj }
  }, [hist, targets, current, y])

  const onMove = (e: React.PointerEvent) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    if (px > geo.nowX + 6) {
      /* in the fan the nearest projection owns the pointer; right after now the
         three curves still overlap, and picking one there would be a guess */
      const py = ((e.clientY - r.top) / r.height) * H
      const t = Math.min(1, (px - geo.nowX) / (geo.endX - geo.nowX))
      const ys = geo.proj.map((p) => (1 - t) * (1 - t) * geo.nowY + 2 * (1 - t) * t * p.cy + t * t * p.ty)
      let nearest = 0
      let best = Number.POSITIVE_INFINITY
      ys.forEach((cy, i) => {
        const d = Math.abs(py - cy)
        if (d < best) {
          best = d
          nearest = i
        }
      })
      const spread = Math.max(...ys) - Math.min(...ys)
      setHotT(spread < 24 ? null : nearest)
      setScrub(null)
      return
    }
    setHotT(null)
    const histW = geo.nowX - PAD.l
    setScrub(Math.max(0, Math.min(hist.length - 1, Math.round(((px - PAD.l) / histW) * (hist.length - 1)))))
  }
  const onLeave = () => {
    setScrub(null)
    setHotT(null)
  }

  /** the last history point is now; each earlier one is a week back */
  const when = (i: number) => {
    const ago = hist.length - 1 - i
    if (asOf) {
      const d = new Date(asOf)
      d.setDate(d.getDate() - ago * 7)
      return fmtDate.format(d)
    }
    return ago === 0 ? "Now" : `${ago} ${ago === 1 ? "week" : "weeks"} ago`
  }

  const mean = geo.proj[1]
  /* a pointed target wins over the scrub; the mean holds the headline otherwise */
  const head =
    hotT !== null
      ? {
          price: geo.proj[hotT].price,
          move: pct(geo.proj[hotT].price),
          hue: geo.proj[hotT].color,
          note: `${geo.proj[hotT].key} target, ${dates.horizon}, ${geo.proj[hotT].analysts} analysts`,
        }
      : scrub !== null
        ? { price: hist[scrub], move: null, hue: GREEN, note: when(scrub) }
        : { price: mean.price, move: pct(mean.price), hue: mean.color, note: `${mean.key} target` }

  /* round-numbered gridlines derived from the domain, at most four of them */
  const grid = useMemo(() => {
    const span = yMax - yMin
    const mag = 10 ** Math.floor(Math.log10(span / 3.2))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 4.2) ?? 10 * mag
    const out: number[] = []
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) out.push(v)
    return { step, out }
  }, [yMin, yMax])
  const still = reduced ? { duration: 0 } : undefined

  return (
    <div className={cn("w-[520px] tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}>
      {/* the headline is the readout: the pointed target, the scrubbed week, or the mean */}
      <div role="status" className="mb-1 flex items-baseline gap-2 px-1">
        {/* the readout swaps in place: a 4px rise through a 2px blur */}
        <motion.span
          key={`${head.price}-${head.note}`}
          className="flex items-baseline gap-2"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">{fmt(head.price)}</span>
          {head.move !== null && (
            <span className="text-[12px] font-medium" style={{ color: ink(head.hue) }}>
              {signedPct(head.move)}
            </span>
          )}
          <span className="text-[10px] text-foreground/45">{head.note}</span>
        </motion.span>
      </div>

      <div className="relative mx-auto w-[520px]" onPointerMove={onMove} onPointerLeave={onLeave}>
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block cursor-crosshair touch-none"
          role="img"
          aria-label={`${label}: mean target ${fmt(mean.price)}, ${signedPct(pct(mean.price))} against ${fmt(current)} now`}
        >
          <defs>
            {/* both vertical guides fade out toward the top so they read as markers, not walls */}
            <linearGradient id={fadeId} gradientUnits="userSpaceOnUse" x1={0} y1={PAD.t} x2={0} y2={H - PAD.b}>
              <stop offset="0" stopColor="var(--foreground)" stopOpacity={0} />
              <stop offset="0.45" stopColor="var(--foreground)" stopOpacity={0.16} />
              <stop offset="1" stopColor="var(--foreground)" stopOpacity={0.16} />
            </linearGradient>
            {/* the fan reveals left to right through this clip, so the dashed projections draw as lines */}
            <clipPath id={clipId}>
              <motion.rect
                x={geo.nowX}
                y={0}
                height={H}
                initial={{ width: reduced ? geo.endX - geo.nowX + 40 : 0 }}
                animate={{ width: geo.endX - geo.nowX + 40 }}
                transition={still ?? { duration: 0.35, ease: EASE, delay: 0.3 }}
              />
            </clipPath>
          </defs>

          {/* gridlines and the left price axis */}
          {grid.out.map((v) => (
            <g key={v}>
              <line x1={PAD.l} y1={y(v)} x2={geo.endX} y2={y(v)} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} strokeDasharray="2 5" />
              <text x={PAD.l - 7} y={y(v) + 3} textAnchor="end" fontSize={8.5} fill="var(--foreground)" fillOpacity={0.35}>
                {grid.step >= 1 ? Math.round(v) : v.toFixed(1)}
              </text>
            </g>
          ))}

          {/* the date axis: history, now, horizon */}
          {[
            { x: geo.hx(0), t: dates.start, a: "start" as const },
            { x: geo.hx(26), t: dates.mid, a: "middle" as const },
            { x: geo.nowX, t: "Now", a: "middle" as const },
            { x: geo.endX, t: dates.horizon, a: "middle" as const },
          ].map((d) => (
            <text key={d.t} x={d.x} y={H - 8} textAnchor={d.a} fontSize={8.5} fill="var(--foreground)" fillOpacity={0.35}>
              {d.t}
            </text>
          ))}

          {/* the now marker */}
          <line x1={geo.nowX} y1={PAD.t} x2={geo.nowX} y2={H - PAD.b} stroke={`url(#${fadeId})`} strokeWidth={1} strokeDasharray="3 3" />

          {/* history draws itself to now */}
          <motion.path
            d={geo.line}
            fill="none"
            stroke="var(--foreground)"
            strokeOpacity={0.9}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={still ?? { duration: 0.4, ease: EASE }}
          />

          {/* projections */}
          <g clipPath={`url(#${clipId})`} pointerEvents="none">
            {geo.proj.map((p, i) => {
              const on = hotT === i
              const dim = hotT !== null && !on
              return (
                <g key={p.key} style={{ opacity: dim ? 0.35 : 1, transition: reduced ? "none" : "opacity 160ms" }}>
                  <path
                    d={p.d}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={on ? 2 : 1.4}
                    strokeOpacity={on ? 1 : p.strength}
                    strokeDasharray="2 4"
                    strokeLinecap="round"
                  />
                  {/* the pointed projection draws itself solid over the dashes, base to target */}
                  {on && (
                    <motion.path
                      d={p.d}
                      fill="none"
                      stroke={p.color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      initial={{ pathLength: reduced ? 1 : 0 }}
                      animate={{ pathLength: 1 }}
                      transition={still ?? { duration: 0.3, ease: EASE }}
                    />
                  )}
                  {/* the radius eases through CSS, as a plain attribute */}
                  <circle
                    cx={geo.endX}
                    cy={p.ty}
                    r={on ? 4 : 3}
                    fill={p.color}
                    fillOpacity={on ? 1 : p.strength}
                    style={{ transition: reduced ? undefined : "r 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                  />
                </g>
              )
            })}
          </g>

          {/* the now dot lands as the history arrives */}
          <motion.circle
            cx={geo.nowX}
            cy={geo.nowY}
            r={3}
            fill="var(--foreground)"
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={still ?? { duration: 0.2, ease: EASE, delay: 0.3 }}
          />

          {/* the scrub crosshair glides along the history, so a slow drag reads as one readout */}
          {scrub !== null && (
            <g pointerEvents="none">
              <motion.line
                x1={geo.hx(scrub)}
                x2={geo.hx(scrub)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke={`url(#${fadeId})`}
                strokeWidth={1}
                initial={false}
                animate={{ x1: geo.hx(scrub), x2: geo.hx(scrub) }}
                transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE }}
              />
              <motion.circle
                cx={geo.hx(scrub)}
                cy={y(hist[scrub])}
                r={3}
                fill="var(--foreground)"
                initial={false}
                animate={{ cx: geo.hx(scrub), cy: y(hist[scrub]) }}
                transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE }}
              />
            </g>
          )}
        </svg>

        {/* the target figures: real buttons beside the end of each projection */}
        {geo.proj.map((p, i) => {
          const on = hotT === i
          const dim = hotT !== null && !on
          return (
            <motion.div
              key={p.key}
              className="absolute"
              style={{ left: `${((geo.endX + 7) / W) * 100}%`, top: `${(p.ty / H) * 100}%` }}
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: 1 }}
              transition={still ?? { duration: 0.2, ease: EASE, delay: 0.5 + i * 0.035 }}
            >
              <button
                type="button"
                aria-label={`${p.key} target ${fmt(p.price)}, ${signedPct(pct(p.price))}, ${p.analysts} analysts`}
                aria-pressed={on}
                onFocus={() => {
                  setScrub(null)
                  setHotT(i)
                }}
                onBlur={() => setHotT(null)}
                /* a tap toggles on touch, where hover never fires */
                onPointerDown={(e) => {
                  if (e.pointerType === "touch") setHotT(on ? null : i)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.currentTarget.blur()
                }}
                className="block -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold leading-none outline-none transition-opacity duration-200 focus-visible:bg-foreground/[0.06]"
                style={{ color: ink(p.color), opacity: dim ? 0.35 : 1 }}
              >
                {p.price}
              </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
