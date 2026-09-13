"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
/* the house layout spring: the dot and card are physical objects, so they settle */
const SPRING = { type: "spring", stiffness: 400, damping: 32 } as const
const GREEN = "var(--chart-up)"
const AMBER = "var(--chart-amber)"
const BLUE = "var(--chart-1)"

/** A hue as text: in the light theme its lightness is capped so small numbers reach AA
 *  while the chroma stays; in dark it is native (`--ink-l` flips per theme on the root). */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

/** e.g. "Mon, Jul 15", the scrub read-out's date. */
const fmtDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })

export interface PriceTarget {
  key: string
  price: number
  analysts: number
  /** Any CSS color; the projection, its dot and its label take it. */
  color?: string
}

const W = 520
const H = 236
const PAD = { l: 30, r: 104, t: 16, b: 28 }
const CARD_W = 132

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
  className?: string
}

const DEFAULT_TARGETS: [PriceTarget, PriceTarget, PriceTarget] = [
  { key: "High", price: 232, analysts: 9, color: GREEN },
  { key: "Mean", price: 205, analysts: 34, color: BLUE },
  { key: "Low", price: 168, analysts: 6, color: AMBER },
]

/**
 * Analyst price targets: a year of history draws to now, then three dashed
 * projections fan out to the High / Mean / Low targets. In the fan the nearest
 * projection owns the pointer, so the card walks from High to Mean to Low
 * instead of dropping out, and the hot projection draws itself solid while the
 * headline takes its price. Scrubbing the history glides the crosshair and a
 * card with the date and price beside the point. The now dot sends a slow ring
 * outward as the live-price signal.
 */
export function PriceTargetFan({
  label = "Price target, 12 months",
  current = 178.52,
  targets = DEFAULT_TARGETS,
  dates = { start: "Jul 2025", mid: "Jan 2026", horizon: "Jul 2027" },
  className,
}: PriceTargetFanProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const clipId = `${uid}-fan`
  const fadeId = `${uid}-fade`
  const svgRef = useRef<SVGSVGElement>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [hotT, setHotT] = useState<number | null>(null)
  /* "today" anchors the weekly history to real dates; read after mount so the
     server and a viewer on another day render the same HTML first */
  const [today, setToday] = useState<Date | null>(null)
  useEffect(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    setToday(d)
  }, [])

  const hist = useMemo(() => buildHistory(current), [current])
  /* the domain follows the data, so any history and targets fill the height */
  const yLo = Math.min(...hist, ...targets.map((t) => t.price))
  const yHi = Math.max(...hist, ...targets.map((t) => t.price))
  const yPad = Math.max((yHi - yLo) * 0.06, 0.5)
  const yMin = yLo - yPad
  const yMax = yHi + yPad
  const y = useCallback((v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b), [yMin, yMax])
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
      const color = t.color ?? [GREEN, BLUE, AMBER][i]
      return { ...t, color, ty, d: `M${nowX},${nowY} Q${cx},${cy} ${endX},${ty}`, cx, cy }
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

  /* a hovered target wins over the scrub; the card sits on whichever side keeps it in view */
  const overlay = (() => {
    if (hotT !== null) {
      const p = geo.proj[hotT]
      return {
        px: geo.endX,
        py: p.ty,
        title: `${p.key} target · ${dates.horizon}`,
        rows: [
          { label: "Price", value: fmt(p.price) },
          { label: "Analysts", value: String(p.analysts) },
        ],
        derived: { label: "vs now", value: `${signedPct(pct(p.price))}`, color: p.color },
      }
    }
    if (scrub !== null) {
      /* the last history point is today; each earlier one is a week back */
      const ago = hist.length - 1 - scrub
      let title = ago === 0 ? "Today" : `${ago}w ago`
      if (today) {
        const d = new Date(today)
        d.setDate(d.getDate() - ago * 7)
        title = fmtDate.format(d)
      }
      return { px: geo.hx(scrub), py: y(hist[scrub]), title, rows: [{ label: "Price", value: fmt(hist[scrub]) }], derived: null }
    }
    return null
  })()

  const mean = targets[1]
  /* whichever target is hot owns the headline; the mean holds it otherwise */
  const head = hotT !== null ? geo.proj[hotT] : { key: mean.key, price: mean.price, color: undefined as string | undefined }
  const headPct = pct(head.price)
  /* round-numbered gridlines derived from the domain, at most four of them */
  const grid = useMemo(() => {
    const span = yMax - yMin
    const mag = 10 ** Math.floor(Math.log10(span / 3.2))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= 4.2) ?? 10 * mag
    const out: number[] = []
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) out.push(v)
    return { step, out }
  }, [yMin, yMax])
  const cardX = overlay
    ? overlay.px < W / 2
      ? Math.min(W - CARD_W - 4, overlay.px + 14)
      : Math.max(4, overlay.px - CARD_W - 14)
    : 0
  /* the clamp knows the card's height: title, a row per metric, the derived row under its hairline */
  const cardH = overlay ? 34 + overlay.rows.length * 17 + (overlay.derived ? 24 : 0) : 0
  const cardY = overlay ? Math.max(2, Math.min(H - cardH, overlay.py - 18)) : 0
  const still = reduced ? { duration: 0 } : undefined

  return (
    <div className={cn("w-[520px] [--ink-l:0.5] dark:[--ink-l:1]", className)}>
      {/* headline: the hot target's price, the mean's when nothing is hot */}
      <div className="mb-1 flex items-baseline gap-2 px-1">
        <span className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground/90">{fmt(head.price)}</span>
        <span className="text-[12px] font-medium tabular-nums" style={{ color: ink(head.color ?? (headPct >= 0 ? GREEN : AMBER)) }}>
          {signedPct(headPct)}
        </span>
        <span className="text-[10px] text-foreground/35">{head.key} target</span>
      </div>

      <div className="relative mx-auto w-[520px]">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block cursor-crosshair touch-none"
          role="img"
          aria-label={`${label}: mean ${fmt(mean.price)}, now ${fmt(current)}`}
          onPointerMove={onMove}
          onPointerLeave={() => {
            setScrub(null)
            setHotT(null)
          }}
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
                transition={still ?? { duration: 0.8, ease: EASE, delay: 0.85 }}
              />
            </clipPath>
          </defs>

          {/* gridlines and the left price axis */}
          {grid.out.map((v) => (
            <g key={v}>
              <line x1={PAD.l} y1={y(v)} x2={geo.endX} y2={y(v)} stroke="var(--foreground)" strokeOpacity={0.05} strokeDasharray="2 5" />
              <text x={PAD.l - 7} y={y(v) + 3} textAnchor="end" fontSize={8.5} fill="var(--foreground)" fillOpacity={0.3} className="tabular-nums">
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
            <text key={d.t} x={d.x} y={H - 8} textAnchor={d.a} fontSize={8.5} fill="var(--foreground)" fillOpacity={0.3}>
              {d.t}
            </text>
          ))}

          {/* the now marker */}
          <line x1={geo.nowX} y1={PAD.t} x2={geo.nowX} y2={H - PAD.b} stroke={`url(#${fadeId})`} strokeWidth={1} strokeDasharray="3 3" />

          {/* history draws itself to now */}
          <motion.path
            d={geo.line}
            fill="none"
            stroke="color-mix(in srgb, var(--foreground) 78%, transparent)"
            strokeWidth={1.5}
            strokeLinecap="round"
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={still ?? { duration: 0.9, ease: EASE }}
          />

          {/* projections and target labels */}
          <g clipPath={`url(#${clipId})`}>
            {geo.proj.map((p, i) => {
              const on = hotT === i
              const dim = hotT !== null && !on
              return (
                <motion.g
                  key={p.key}
                  role="button"
                  tabIndex={0}
                  aria-label={`${p.key} target ${fmt(p.price)}, ${p.analysts} analysts`}
                  className="outline-none"
                  animate={{ opacity: dim ? 0.26 : 1 }}
                  transition={still ?? { duration: 0.25, ease: EASE }}
                  onFocus={() => setHotT(i)}
                  onBlur={() => setHotT(null)}
                  /* a tap toggles on touch, where hover never fires */
                  onPointerDown={(e) => {
                    if (e.pointerType === "touch") setHotT(on ? null : i)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") (e.currentTarget as SVGGElement).blur()
                  }}
                >
                  <path d={p.d} fill="none" stroke="transparent" strokeWidth={16} />
                  <path d={p.d} fill="none" stroke={p.color} strokeWidth={on ? 2.2 : 1.4} strokeOpacity={on ? 1 : 0.7} strokeDasharray="2 4" strokeLinecap="round" />
                  {/* the hot projection draws itself solid over the dashes, base to target */}
                  {on && (
                    <motion.path
                      d={p.d}
                      fill="none"
                      stroke={p.color}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      initial={{ pathLength: reduced ? 1 : 0 }}
                      animate={{ pathLength: 1 }}
                      transition={still ?? { duration: 0.35, ease: EASE }}
                    />
                  )}
                  {/* the radius eases through CSS: motion writes `r` as undefined on first paint */}
                  <circle cx={geo.endX} cy={p.ty} r={on ? 4.5 : 3.2} fill="var(--surface, var(--card))" stroke={p.color} strokeWidth={1.6} style={{ transition: reduced ? undefined : "r 200ms cubic-bezier(0.16, 1, 0.3, 1)" }} />
                  <text x={geo.endX + 10} y={p.ty + 3.5} fontSize={10.5} fontWeight={600} fill={ink(p.color)} className="tabular-nums">
                    {p.price}
                  </text>
                </motion.g>
              )
            })}
          </g>

          {/* the now dot lands as the history arrives */}
          <motion.circle
            cx={geo.nowX}
            cy={geo.nowY}
            r={3.2}
            fill="var(--foreground)"
            initial={{ opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={still ?? { ...SPRING, delay: 0.85 }}
            style={{ transformOrigin: `${geo.nowX}px ${geo.nowY}px` }}
          />
          {/* the live tail: a ring leaves the now dot every few seconds */}
          {!reduced && (
            <motion.circle
              cx={geo.nowX}
              cy={geo.nowY}
              r={3.2}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={1}
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: [0.45, 0], scale: [1, 2.8] }}
              transition={{ duration: 2.2, ease: EASE, repeat: Number.POSITIVE_INFINITY, repeatDelay: 1.6, delay: 1.6 }}
              style={{ transformOrigin: `${geo.nowX}px ${geo.nowY}px` }}
            />
          )}

          {/* the scrub crosshair glides along the history instead of stepping, so a slow drag reads as one read-out */}
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
                r={3.2}
                fill="var(--foreground)"
                stroke="var(--surface, var(--card))"
                strokeWidth={1.5}
                initial={false}
                animate={{ cx: geo.hx(scrub), cy: y(hist[scrub]) }}
                transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE }}
              />
            </g>
          )}
        </svg>

        {/* the value card glides between points; one metric per row, the derived move under a hairline */}
        {overlay && (
          <motion.div
            role="status"
            className="pointer-events-none absolute left-0 top-0 z-10 rounded-lg border border-foreground/[0.05] px-2.5 py-2 text-[10px] tabular-nums"
            style={{ width: CARD_W, background: "var(--card)", boxShadow: "0 8px 24px var(--card-shadow, rgba(0,0,0,0.35))" }}
            initial={reduced ? false : { opacity: 0, x: cardX, y: cardY }}
            animate={{ opacity: 1, x: cardX, y: cardY }}
            transition={reduced ? { duration: 0 } : { x: { duration: 0.2, ease: EASE }, y: { duration: 0.2, ease: EASE }, opacity: { duration: 0.15 } }}
          >
            <div className="text-[9px] text-foreground/45">{overlay.title}</div>
            <div className="mt-1 flex flex-col gap-0.5">
              {overlay.rows.map((m) => (
                <div key={m.label} className="flex items-center justify-between gap-3">
                  <span className="text-foreground/55">{m.label}</span>
                  <span className="font-semibold text-foreground/85">{m.value}</span>
                </div>
              ))}
            </div>
            {overlay.derived ? (
              <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-foreground/[0.04] pt-1.5">
                <span className="text-foreground/55">{overlay.derived.label}</span>
                <span className="font-semibold" style={{ color: ink(overlay.derived.color) }}>
                  {overlay.derived.value}
                </span>
              </div>
            ) : null}
          </motion.div>
        )}
      </div>
    </div>
  )
}

/** "+14.8%" with the typographic minus. */
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`
