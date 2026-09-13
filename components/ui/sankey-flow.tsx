"use client"

import { useId, useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-2)"
const AMBER = "var(--chart-amber)"
const SANS = "inherit"
const TEXT = "var(--foreground)"
const TEXT_MUTED = "var(--muted-foreground)"
const CHART = {
  blue: "var(--chart-1)",
  green: "var(--chart-2)",
  amber: "var(--chart-3)",
  yellow: "var(--chart-4)",
  purple: "var(--chart-5)",
} as const

export interface FlowNode {
  id: string
  label: string
  value: number
  color: string
}

export interface SankeyFlowProps {
  /** what comes in; ribbon thickness is proportional to value */
  sources?: FlowNode[]
  /** where it goes out; the two sides must sum to the same total */
  uses?: FlowNode[]
  /** heading above the diagram */
  title?: string
  className?: string
}

const DEFAULT_SOURCES: FlowNode[] = [
  { id: "salary", label: "Salary", value: 6200, color: CHART.blue },
  { id: "rental", label: "Rental", value: 1500, color: CHART.yellow },
  { id: "divs", label: "Dividends", value: 900, color: GREEN },
  { id: "side", label: "Side work", value: 700, color: CHART.purple },
]
const DEFAULT_USES: FlowNode[] = [
  { id: "invest", label: "Investing", value: 2400, color: CHART.blue },
  { id: "rent", label: "Rent", value: 2200, color: AMBER },
  { id: "living", label: "Living", value: 1600, color: CHART.amber },
  { id: "debt", label: "Debt", value: 1100, color: CHART.purple },
  { id: "save", label: "Savings", value: 1300, color: GREEN },
  { id: "fun", label: "Fun", value: 700, color: CHART.yellow },
]

const W = 540
const H = 320
const PAD = { t: 14, b: 14, x: 4 }
const NODE_W = 11
const GAP = 9
const contentH = H - PAD.t - PAD.b

const leftX = PAD.x + 92
const rightX = W - PAD.x - 92 - NODE_W
const midX = W / 2 - NODE_W / 2

type Placed = FlowNode & { top: number; h: number; mid: number }

/** Walk both sides as partitions of the same [0, total] interval — every overlap
 *  between an inbound band and an outbound band is one real source→use strand,
 *  so nothing appears or vanishes at the hub. */
function decompose(sources: FlowNode[], uses: FlowNode[]) {
  const out: { src: string; use: string; value: number }[] = []
  let si = 0
  let ui = 0
  let sRem = sources[0].value
  let uRem = uses[0].value
  while (si < sources.length && ui < uses.length) {
    const value = Math.min(sRem, uRem)
    out.push({ src: sources[si].id, use: uses[ui].id, value })
    sRem -= value
    uRem -= value
    if (sRem <= 0) sRem = sources[++si]?.value ?? 0
    if (uRem <= 0) uRem = uses[++ui]?.value ?? 0
  }
  return out
}

/**
 * A fund-flow diagram where income pools in one hub and fans out into uses, node
 * and ribbon thickness standing for amount. Flow is conserved through the middle,
 * so every outbound strand carries its source's hue across, and hovering any node
 * follows that strand the whole way over.
 */
export function SankeyFlow({
  sources = DEFAULT_SOURCES,
  uses = DEFAULT_USES,
  title = "Monthly cash flow",
  className,
}: SankeyFlowProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const [hover, setHover] = useState<string | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const hot = pin ?? hover
  const enter = (id: string) => {
    if (!pin) setHover(id)
  }
  const toggle = (id: string) => setPin((p) => (p === id ? null : id))

  const { total, left, right, mid, inFlows, outFlows, bands, seams } = useMemo(() => {
    const total = sources.reduce((a, b) => a + b.value, 0)
    const scale = (contentH - Math.max(sources.length, uses.length) * GAP) / total

    const stack = (nodes: FlowNode[]): Placed[] => {
      const totalH = nodes.reduce((a, n) => a + n.value * scale, 0) + (nodes.length - 1) * GAP
      let y = PAD.t + (contentH - totalH) / 2
      return nodes.map((n) => {
        const h = n.value * scale
        const top = y
        y += h + GAP
        return { ...n, top, h, mid: top + h / 2 }
      })
    }

    const left = stack(sources)
    const right = stack(uses)
    const byUse = Object.fromEntries(right.map((n) => [n.id, n])) as Record<string, Placed>
    const midH = total * scale
    const midTop = PAD.t + (contentH - midH) / 2
    const mid = { top: midTop, h: midH, mid: midTop + midH / 2 }

    let inCum = 0
    const inFlows = left.map((n) => {
      const w = n.value * scale
      const y1 = midTop + inCum + w / 2
      inCum += w
      return { id: `${n.id}~mid`, src: n.id, w, y0: n.mid, y1, color: n.color }
    })

    /* a strand leaves the hub at the offset its source arrived at and lands
       stacked inside its use, so widths line up on both faces */
    let outCum = 0
    const filled: Record<string, number> = {}
    const outFlows = decompose(sources, uses).map((f, i) => {
      const use = byUse[f.use]
      const w = f.value * scale
      const y0 = midTop + outCum * scale + w / 2
      outCum += f.value
      const done = filled[f.use] ?? 0
      const y1 = use.top + done * scale + w / 2
      filled[f.use] = done + f.value
      return {
        id: `mid~${f.use}~${f.src}`,
        grad: `${uid}-f${i}`,
        src: f.src,
        use: f.use,
        w,
        y0,
        y1,
        from: left.find((n) => n.id === f.src)!.color,
        to: use.color,
      }
    })

    let bandCum = 0
    const bands = sources.map((n) => {
      const h = n.value * scale
      const y = midTop + bandCum
      bandCum += h
      return { id: n.id, y, h, color: n.color }
    })
    let seamCum = 0
    const seams = uses.slice(0, -1).map((n) => {
      seamCum += n.value * scale
      return { id: n.id, y: midTop + seamCum }
    })

    return { total, left, right, mid, inFlows, outFlows, bands, seams }
  }, [sources, uses, uid])

  /** a source and a use are on the same path when a strand joins them */
  const joined = (a: string | null, b: string) =>
    a !== null && outFlows.some((f) => (f.src === a && f.use === b) || (f.use === a && f.src === b))

  const nodeOn = (id: string) => hot === null || hot === "mid" || hot === id || joined(hot, id)
  const inOn = (l: { src: string }) => hot === null || hot === "mid" || hot === l.src || joined(hot, l.src)
  const outOn = (f: { src: string; use: string }) => hot === null || hot === "mid" || hot === f.src || hot === f.use

  const linkPath = (x0: number, y0: number, x1: number, y1: number) => {
    const xc = (x0 + x1) / 2
    return `M${x0},${y0} C${xc},${y0} ${xc},${y1} ${x1},${y1}`
  }

  return (
    <div className={cn("w-[540px] max-w-full", className)} style={{ fontFamily: SANS }}>
      <div className="mb-1 flex items-baseline justify-between px-1">
        <span className="text-[13px] font-medium" style={{ color: TEXT }}>
          {title}
        </span>
        <span className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>
          ${total.toLocaleString()} in · ${total.toLocaleString()} out
        </span>
      </div>

      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`${title}: ${sources.length} sources into ${uses.length} uses, $${total.toLocaleString()} through`}
      >
        <defs>
          {outFlows.map((f) => (
            <linearGradient key={f.grad} id={f.grad} gradientUnits="userSpaceOnUse" x1={midX + NODE_W} x2={rightX}>
              {/* holds the source hue out of the hub, then hands over to the use */}
              <stop offset="0%" stopColor={f.from} />
              <stop offset="45%" stopColor={f.from} />
              <stop offset="100%" stopColor={f.to} />
            </linearGradient>
          ))}
        </defs>

        {/* moving off a node releases the highlight */}
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="none"
          style={{ pointerEvents: "all" }}
          onMouseEnter={() => {
            if (!pin) setHover(null)
          }}
        />

        {inFlows.map((l, i) => (
          <motion.path
            key={l.id}
            d={linkPath(leftX + NODE_W, l.y0, midX, l.y1)}
            fill="none"
            stroke={l.color}
            strokeWidth={Math.max(1, l.w)}
            strokeOpacity={inOn(l) ? 0.4 : 0.07}
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.7, ease: EASE, delay: 0.12 + i * 0.02 }}
            style={{ pointerEvents: "none", transition: "stroke-opacity 0.15s" }}
          />
        ))}

        {outFlows.map((f, i) => (
          <motion.path
            key={f.id}
            d={linkPath(midX + NODE_W, f.y0, rightX, f.y1)}
            fill="none"
            stroke={`url(#${f.grad})`}
            strokeWidth={Math.max(1, f.w)}
            strokeOpacity={outOn(f) ? 0.4 : 0.07}
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.7, ease: EASE, delay: 0.2 + i * 0.02 }}
            style={{ pointerEvents: "none", transition: "stroke-opacity 0.15s" }}
          />
        ))}

        {/* the hub */}
        <g onMouseEnter={() => enter("mid")} onClick={() => toggle("mid")} style={{ cursor: "pointer" }}>
          {pin === "mid" && (
            <rect
              x={midX - 3}
              y={mid.top - 3}
              width={NODE_W + 6}
              height={mid.h + 6}
              rx={4}
              fill="none"
              stroke="color-mix(in srgb, var(--foreground) 45%, transparent)"
              strokeWidth={1}
            />
          )}
          <rect x={midX} y={mid.top} width={NODE_W} height={mid.h} rx={2} fill="color-mix(in srgb, var(--foreground) 26%, transparent)" />
          {bands.map((b) => (
            <rect
              key={b.id}
              x={midX}
              y={b.y}
              width={NODE_W}
              height={b.h}
              fill={b.color}
              opacity={nodeOn(b.id) ? 0.62 : 0.16}
              style={{ transition: "opacity 0.15s" }}
            />
          ))}
          {/* where the hub divides between uses — the outbound partition, scored in */}
          {seams.map((s) => (
            <rect key={s.id} x={midX} y={s.y - 0.5} width={NODE_W} height={1} fill="var(--background)" opacity={0.85} />
          ))}
          <rect
            x={midX + 0.5}
            y={mid.top + 0.5}
            width={NODE_W - 1}
            height={mid.h - 1}
            rx={2}
            fill="none"
            stroke="color-mix(in srgb, var(--foreground) 24%, transparent)"
            strokeWidth={1}
          />
          <text x={midX + NODE_W / 2} y={mid.top - 5} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={TEXT}>
            Cash
          </text>
        </g>

        {[...left.map((n) => ({ n, side: "l" as const })), ...right.map((n) => ({ n, side: "r" as const }))].map(({ n, side }) => {
          const x = side === "l" ? leftX : rightX
          const on = nodeOn(n.id)
          return (
            <g key={n.id} onMouseEnter={() => enter(n.id)} onClick={() => toggle(n.id)} style={{ cursor: "pointer" }}>
              {pin === n.id && (
                <rect x={x - 3} y={n.top - 3} width={NODE_W + 6} height={n.h + 6} rx={4} fill="none" stroke={n.color} strokeWidth={1} strokeOpacity={0.6} />
              )}
              <rect x={x} y={n.top} width={NODE_W} height={n.h} rx={2} fill={n.color} opacity={on ? 1 : 0.35} />
              <text
                x={side === "l" ? x - 7 : x + NODE_W + 7}
                y={n.mid - 3}
                textAnchor={side === "l" ? "end" : "start"}
                fontSize={10}
                fontWeight={500}
                fill={on ? TEXT : "color-mix(in srgb, var(--foreground) 40%, transparent)"}
              >
                {n.label}
              </text>
              <text
                x={side === "l" ? x - 7 : x + NODE_W + 7}
                y={n.mid + 9}
                textAnchor={side === "l" ? "end" : "start"}
                fontSize={9}
                fill="color-mix(in srgb, var(--foreground) 40%, transparent)"
                className="tabular-nums"
              >
                ${n.value.toLocaleString()}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
