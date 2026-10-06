"use client"

import { useCallback, useId, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

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
   · `targets[n].color` still wins when it is passed; the default targets no longer set it
   Motion (2026-10-01): the entrance waits until the chart is in view, then the history sweeps
   in left to right through a clip, the now dot lands and the fan sweeps out to the targets;
   new prices or targets glide the line, the projections, the dots and the gridlines there
   2026-10-02 audit: the price axis sat on the left with bare figures, the header was one
   crowded line, the readout blurred in on every scrubbed week and the crosshair eased behind
   the pointer. Now the axis is on the right in dollars, and the three targets are its named
   references ("$232" at /90 with "High" at /45 after it), still buttons for the keyboard and
   touch, while the hue stays on their dots. The header is the library's three tiers: the
   title (a new `title` prop) at /45 with the symbol (a new `symbol` prop) at /90, the price
   as the 26px headline with its decimals at /35, and a sub line with the move in its hue
   then who set it at /45. The readout swaps only when the mode changes (rest, scrub, a
   target), the crosshair follows the pointer with no easing, gridlines are solid at 5%,
   axis text is 9px at /45, and the width is 560 like the other price charts.
   Formulas:
   · move against now = (target or scrubbed price − price now) ÷ price now × 100
   · gridlines        = round steps of 1, 2, 2.5 or 5 × a power of ten, at most four, over
                        the domain of the history and the targets padded by 6% */

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

const W = 560
const H = 236
/** the price axis on the right holds a named reference like "$232 High" */
const PAD = { l: 8, r: 76, t: 16, b: 28 }

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
  /** the name in the header's label row */
  title?: string
  /** the symbol on the right of the label row */
  symbol?: string
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
  title = "Price target",
  symbol = "AAPL",
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
  /* the entrance plays once, when a third of the chart is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const play = !!reduced || seen
  const histClipId = `${uid}-hist`

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
  /** an axis figure: whole dollars when the value is whole */
  const axisUsd = (p: number) => `$${Number.isInteger(p) ? p : p.toFixed(2)}`

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
          note: `${geo.proj[hotT].key.toLowerCase()} target of ${geo.proj[hotT].analysts} analysts`,
        }
      : scrub !== null
        ? { price: hist[scrub], move: null, hue: GREEN, note: when(scrub) }
        : { price: mean.price, move: pct(mean.price), hue: mean.color, note: `${mean.key.toLowerCase()} of ${mean.analysts} analysts` }
  /* the readout swaps only on a change of mode: rest, scrub or a target */
  const mode = hotT !== null ? `target-${hotT}` : scrub !== null ? "scrub" : "rest"
  const [headWhole, headCents] = fmt(head.price).split(".")

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
  /** a change of data glides between the two states */
  const morph = still ?? { duration: 0.35, ease: EASE }
  const fanW = geo.endX - geo.nowX + 40

  return (
    <div ref={rootRef} className={cn("w-[560px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}>
      {/* the header, three tiers (spec 14.1): title and symbol, the price, the move and who set it */}
      <div className="mb-3 flex items-baseline justify-between text-[12px]">
        <span className="truncate text-foreground/45">{title}</span>
        <span className="shrink-0 pl-3 font-medium text-foreground/90">{symbol}</span>
      </div>
      <div role="status">
        {/* the readout swaps in place (4px, 2px blur) only when the mode changes; scrubbing
            from week to week follows the pointer at once */}
        <motion.div
          key={mode}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          <p className="m-0 text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
            {headWhole}
            <span className="text-foreground/35">.{headCents}</span>
          </p>
          <p className="mb-0 mt-2 flex items-baseline gap-[7px] text-[12px] font-medium">
            {head.move !== null && <span style={{ color: ink(head.hue) }}>{signedPct(head.move)}</span>}
            <span className="font-normal text-foreground/45">{head.note}</span>
          </p>
        </motion.div>
      </div>

      <div className="relative mt-4" onPointerMove={onMove} onPointerLeave={onLeave}>
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
            {/* the history sweeps in left to right through this clip, a few px past now for the round cap */}
            <clipPath id={histClipId}>
              <motion.rect
                x={PAD.l - 4}
                y={0}
                height={H}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: play ? geo.nowX - PAD.l + 8 : 0 }}
                transition={still ?? { duration: 0.6, ease: EASE }}
              />
            </clipPath>
            {/* the fan reveals left to right through this clip, so the dashed projections draw as lines */}
            <clipPath id={clipId}>
              <motion.rect
                x={geo.nowX}
                y={0}
                height={H}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: play ? fanW : 0 }}
                transition={still ?? { duration: 0.4, ease: EASE, delay: 0.45 }}
              />
            </clipPath>
          </defs>

          {/* solid gridlines and the price axis on the right, in dollars; a figure next to a
              target's named reference steps aside for it */}
          {grid.out.map((v) => (
            <g key={v}>
              <motion.line
                x1={PAD.l}
                x2={geo.endX}
                stroke="var(--foreground)"
                strokeOpacity={0.05}
                strokeWidth={1}
                initial={false}
                animate={{ y1: y(v), y2: y(v) }}
                transition={morph}
              />
              <motion.text
                x={geo.endX + 12}
                fontSize={9}
                fill="var(--foreground)"
                fillOpacity={0.45}
                initial={false}
                animate={{ attrY: y(v) + 3, opacity: geo.proj.some((p) => Math.abs(p.ty - y(v)) < 12) ? 0 : 1 }}
                transition={morph}
              >
                ${grid.step >= 1 ? Math.round(v) : v.toFixed(1)}
              </motion.text>
            </g>
          ))}

          {/* the date axis: history, now, horizon */}
          {[
            { x: geo.hx(0), t: dates.start, a: "start" as const },
            { x: geo.hx(26), t: dates.mid, a: "middle" as const },
            { x: geo.nowX, t: "Now", a: "middle" as const },
            { x: geo.endX, t: dates.horizon, a: "middle" as const },
          ].map((d) => (
            <text key={d.t} x={d.x} y={H - 8} textAnchor={d.a} fontSize={9} fill="var(--foreground)" fillOpacity={0.45}>
              {d.t}
            </text>
          ))}

          {/* the now marker */}
          <line x1={geo.nowX} y1={PAD.t} x2={geo.nowX} y2={H - PAD.b} stroke={`url(#${fadeId})`} strokeWidth={1} strokeDasharray="3 3" />

          {/* history sweeps in to now; a new history glides into place */}
          <motion.path
            fill="none"
            stroke="var(--foreground)"
            strokeOpacity={0.9}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath={`url(#${histClipId})`}
            initial={false}
            animate={{ d: geo.line }}
            transition={morph}
          />

          {/* projections */}
          <g clipPath={`url(#${clipId})`} pointerEvents="none">
            {geo.proj.map((p, i) => {
              const on = hotT === i
              const dim = hotT !== null && !on
              return (
                <g key={p.key} style={{ opacity: dim ? 0.35 : 1, transition: reduced ? "none" : "opacity 160ms" }}>
                  <motion.path
                    fill="none"
                    initial={false}
                    animate={{ d: p.d }}
                    transition={morph}
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
                  <motion.circle
                    cx={geo.endX}
                    r={on ? 4 : 3}
                    fill={p.color}
                    fillOpacity={on ? 1 : p.strength}
                    style={{ transition: reduced ? undefined : "r 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
                    initial={false}
                    animate={{ cy: p.ty }}
                    transition={morph}
                  />
                </g>
              )
            })}
          </g>

          {/* the now dot lands as the history arrives */}
          <motion.circle
            cx={geo.nowX}
            r={3}
            fill="var(--foreground)"
            initial={reduced ? false : { opacity: 0, cy: geo.nowY }}
            animate={{ opacity: play ? 1 : 0, cy: geo.nowY }}
            transition={still ?? { opacity: { duration: 0.2, ease: EASE, delay: 0.45 }, cy: morph }}
          />

          {/* the scrub crosshair sits on the pointed week with no easing, so it never trails the hand */}
          {scrub !== null && (
            <g pointerEvents="none">
              <line x1={geo.hx(scrub)} x2={geo.hx(scrub)} y1={PAD.t} y2={H - PAD.b} stroke={`url(#${fadeId})`} strokeWidth={1} />
              <circle cx={geo.hx(scrub)} cy={y(hist[scrub])} r={3} fill="var(--foreground)" stroke="var(--background)" strokeWidth={1.5} />
            </g>
          )}
        </svg>

        {/* the targets as the axis's named references (spec 14.7): the price at /90 and the
            name at /45, real buttons so the keyboard and touch reach them */}
        {geo.proj.map((p, i) => {
          const on = hotT === i
          const dim = hotT !== null && !on
          return (
            <motion.div
              key={p.key}
              className="absolute"
              style={{ left: `${((geo.endX + 8) / W) * 100}%` }}
              initial={reduced ? false : { opacity: 0, top: `${(p.ty / H) * 100}%` }}
              animate={{ opacity: play ? 1 : 0, top: `${(p.ty / H) * 100}%` }}
              transition={still ?? { opacity: { duration: 0.2, ease: EASE, delay: 0.65 + i * 0.035 }, top: morph }}
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
                className="block -translate-y-1/2 whitespace-nowrap rounded-full px-1 py-0.5 text-[9px] leading-none outline-none transition-opacity duration-200 focus-visible:bg-foreground/[0.06]"
                style={{ opacity: dim ? 0.35 : 1 }}
              >
                <span className="font-medium text-foreground/90">{axisUsd(p.price)}</span>
                <span className="text-foreground/45"> {p.key}</span>
              </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
