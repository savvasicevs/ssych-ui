"use client"

import { useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const AMBER = "var(--chart-amber)"
const BLUE = "var(--chart-1)"

export interface PriceTarget {
  key: string
  price: number
  analysts: number
  color: string
}

const W = 520
const H = 236
const PAD = { l: 30, r: 104, t: 16, b: 28 }
const CARD_W = 120

// deterministic weekly history ending exactly at `current`
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
  /** eyebrow label above the mean target */
  label?: string
  /** last traded price — history walks to this point */
  current?: number
  /** High / Mean / Low analyst targets, in that order */
  targets?: [PriceTarget, PriceTarget, PriceTarget]
  /** axis labels, oldest → horizon */
  dates?: { start: string; mid: string; horizon: string }
  className?: string
}

const DEFAULT_TARGETS: [PriceTarget, PriceTarget, PriceTarget] = [
  { key: "High", price: 232, analysts: 9, color: GREEN },
  { key: "Mean", price: 205, analysts: 34, color: BLUE },
  { key: "Low", price: 168, analysts: 6, color: AMBER },
]

/**
 * Analyst price targets: a year of history walks to "now", then three dashed
 * projections fan out to the High / Mean / Low targets. Scrub the history or
 * hover a target and a KPI-style card flips in beside the point — value big,
 * context muted.
 */
export function PriceTargetFan({
  label = "Price target · 12mo",
  current = 178.52,
  targets = DEFAULT_TARGETS,
  dates = { start: "Jul '25", mid: "Jan '26", horizon: "Jul '27" },
  className,
}: PriceTargetFanProps) {
  const reduced = useReducedMotion()
  const svgRef = useRef<SVGSVGElement>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [hotT, setHotT] = useState<number | null>(null)

  const hist = useMemo(() => buildHistory(current), [current])
  const yMin = Math.min(150, targets[2].price - 10)
  const yMax = Math.max(250, targets[0].price + 10)
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b)
  const pct = (p: number) => ((p - current) / current) * 100
  const fmt = (p: number) => `$${p.toFixed(2)}`

  const geo = useMemo(() => {
    const histW = (W - PAD.l - PAD.r) * 0.56
    const hx = (i: number) => PAD.l + (i / (hist.length - 1)) * histW
    const nowX = hx(hist.length - 1)
    const nowY = y(current)
    const endX = W - PAD.r
    const line = hist.map((v, i) => `${i === 0 ? "M" : "L"}${hx(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    const proj = targets.map((t) => {
      const ty = y(t.price)
      const cx = nowX + (endX - nowX) * 0.5
      const cy = nowY + (ty - nowY) * 0.15
      return { ...t, ty, d: `M${nowX},${nowY} Q${cx},${cy} ${endX},${ty}`, cx, cy }
    })
    const hi = proj[0]
    const lo = proj[2]
    const band = `M${nowX},${nowY} Q${hi.cx},${hi.cy} ${endX},${hi.ty} L${endX},${lo.ty} Q${lo.cx},${lo.cy} ${nowX},${nowY} Z`
    return { hx, nowX, nowY, endX, line, proj, band }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist, targets, current])

  const onMove = (e: React.PointerEvent) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    if (px > geo.nowX + 6) {
      setScrub(null)
      return
    }
    const histW = geo.nowX - PAD.l
    setScrub(Math.max(0, Math.min(hist.length - 1, Math.round(((px - PAD.l) / histW) * (hist.length - 1)))))
  }

  // target hover wins over scrub; the card flips to the side that keeps it in view
  const overlay = (() => {
    if (hotT !== null) {
      const p = geo.proj[hotT]
      const up = p.price >= current
      return {
        px: geo.endX,
        py: p.ty,
        value: fmt(p.price),
        context: `${p.key} · ${up ? "+" : ""}${pct(p.price).toFixed(1)}% · ${p.analysts} analysts`,
        color: p.color as string | undefined,
      }
    }
    if (scrub !== null) {
      const ago = hist.length - 1 - scrub
      return {
        px: geo.hx(scrub),
        py: y(hist[scrub]),
        value: fmt(hist[scrub]),
        context: ago === 0 ? "now" : `${ago}w ago`,
        color: undefined as string | undefined,
      }
    }
    return null
  })()

  const mean = targets[1]
  const meanPct = pct(mean.price)
  const gridVals = [yMax - 10, yMax - 40, yMax - 70, yMin]

  return (
    <div className={cn("w-[520px]", className)}>
      {/* header — mean target + potential (KPI-style big number) */}
      <div className="mb-1 flex items-end justify-between px-1">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/35">{label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-foreground/90">{fmt(mean.price)}</span>
            <span className="text-[12px] font-medium tabular-nums" style={{ color: meanPct >= 0 ? GREEN : AMBER }}>
              {meanPct >= 0 ? "+" : ""}
              {meanPct.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="text-right text-[11px] tabular-nums text-muted-foreground">Now {fmt(current)}</div>
      </div>

      <div className="relative mx-auto w-[520px]">
        <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block cursor-crosshair" onPointerMove={onMove} onPointerLeave={() => setScrub(null)}>
          {/* faint gridlines + left price axis */}
          {gridVals.map((v) => (
            <g key={v}>
              <line x1={PAD.l} y1={y(v)} x2={geo.endX} y2={y(v)} stroke="color-mix(in srgb, var(--foreground) 4%, transparent)" strokeDasharray="2 5" />
              <text x={PAD.l - 7} y={y(v) + 3} textAnchor="end" fontSize={8.5} fill="color-mix(in srgb, var(--foreground) 32%, transparent)" className="tabular-nums">
                {Math.round(v)}
              </text>
            </g>
          ))}

          {/* bottom date axis — history → now → target horizon */}
          {[
            { x: geo.hx(0), t: dates.start, a: "start" as const },
            { x: geo.hx(26), t: dates.mid, a: "middle" as const },
            { x: geo.nowX, t: "Now", a: "middle" as const },
            { x: geo.endX, t: dates.horizon, a: "middle" as const },
          ].map((d) => (
            <text key={d.t} x={d.x} y={H - 8} textAnchor={d.a} fontSize={8.5} fill="color-mix(in srgb, var(--foreground) 30%, transparent)">
              {d.t}
            </text>
          ))}

          {/* projection band */}
          <motion.path
            d={geo.band}
            fill={`color-mix(in srgb, ${BLUE} 6%, transparent)`}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: hotT === null ? 1 : 0.22 }}
            transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: 0.9 }}
          />

          {/* now marker */}
          <line x1={geo.nowX} y1={PAD.t} x2={geo.nowX} y2={H - PAD.b} stroke="color-mix(in srgb, var(--foreground) 12%, transparent)" strokeWidth={1} strokeDasharray="3 3" />

          {/* history */}
          <motion.path
            d={geo.line}
            fill="none"
            stroke="color-mix(in srgb, var(--foreground) 78%, transparent)"
            strokeWidth={1.5}
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
          />

          {/* projections + target labels */}
          {geo.proj.map((p, i) => {
            const on = hotT === i
            const dim = hotT !== null && !on
            return (
              <motion.g
                key={p.key}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: dim ? 0.26 : 1 }}
                transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: 0.9 + i * 0.12 }}
                onMouseEnter={() => setHotT(i)}
                onMouseLeave={() => setHotT(null)}
                style={{ cursor: "default" }}
              >
                <path d={p.d} fill="none" stroke="transparent" strokeWidth={16} />
                <path d={p.d} fill="none" stroke={p.color} strokeWidth={on ? 2.2 : 1.4} strokeOpacity={on ? 1 : 0.7} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
                <circle cx={geo.endX} cy={p.ty} r={on ? 4 : 3.2} fill="var(--surface, var(--card))" stroke={p.color} strokeWidth={1.6} />
                <text x={geo.endX + 10} y={p.ty - 2.5} fontSize={8} fill="color-mix(in srgb, var(--foreground) 40%, transparent)">
                  {p.key}
                </text>
                <text x={geo.endX + 10} y={p.ty + 8} fontSize={10.5} fontWeight={600} fill={p.color} className="tabular-nums">
                  {p.price}
                </text>
              </motion.g>
            )
          })}

          {/* now dot */}
          <motion.circle cx={geo.nowX} cy={geo.nowY} r={3.2} fill="var(--foreground)" initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={reduced ? { duration: 0 } : { delay: 0.85 }} />

          {/* scrub crosshair */}
          {scrub !== null && (
            <g pointerEvents="none">
              <line x1={geo.hx(scrub)} y1={PAD.t} x2={geo.hx(scrub)} y2={H - PAD.b} stroke="color-mix(in srgb, var(--foreground) 22%, transparent)" strokeWidth={1} />
              <circle cx={geo.hx(scrub)} cy={y(hist[scrub])} r={3.2} fill="var(--foreground)" stroke="var(--surface, var(--card))" strokeWidth={1.5} />
            </g>
          )}
        </svg>

        {/* overlay — KPI-style card: value big, context muted */}
        {overlay && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-border px-2.5 py-1.5"
            style={{
              width: CARD_W,
              left: overlay.px < W / 2 ? Math.min(W - CARD_W - 4, overlay.px + 14) : Math.max(4, overlay.px - CARD_W - 14),
              top: Math.max(2, Math.min(H - 44, overlay.py - 18)),
              background: "linear-gradient(180deg, var(--card-raised, var(--card)) 0%, var(--surface, var(--card)) 100%)",
            }}
          >
            <div className="text-[13px] font-semibold tabular-nums" style={{ color: overlay.color ?? "var(--foreground)" }}>
              {overlay.value}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{overlay.context}</div>
          </div>
        )}
      </div>
    </div>
  )
}
