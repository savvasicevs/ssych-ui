"use client"

import { useId, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Sankey Flow, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · every ribbon is a filled shape between two curves. They were strokes as thick as the
     amount (up to 158px), which is why the thin-lines rule failed
   · one ink at several strengths, strongest for the largest amount on each side. It was
     blue, yellow, green, purple and amber, none of which meant a direction. The node being
     pointed at takes the one accent, and so do the strands that run through it.
     `FlowNode.color` stays in the type so callers do not change, but it is not painted
   · the readout is plain text beside the title: the total at rest, the pointed node's
     amount and its share of the total while you point
   · every node is a real button laid over the drawing, so it can be reached and pinned
     from the keyboard; Escape lets a pin go
   · the hub has no outline; ribbons fade in once, one after another
   Colour pass (2026-09-30): the sources have to be told apart as their money runs through
   the hub, so each source takes its own colour in the house order (chart 1, 5, 3, amber,
   2, 4; past six one Other) and every band and strand it feeds carries that colour. The
   uses stay ink at their strengths; the readout swaps in place and dots the source
   Motion (2026-10-01): once the diagram is in view the ribbons sweep in left to right
   through one clip, sources to hub to uses, in 0.9s (they faded in on mount, off screen
   too); the nodes and the hub are there on arrival. New amounts morph every ribbon and
   glide each node, hub band and label to its new place and depth */

const EASE = [0.16, 1, 0.3, 1] as const
/** the house order for things that must be told apart; nothing on this surface means up */
const PALETTE = ["var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-amber)", "var(--chart-2)", "var(--chart-4)"]
const OTHER = "color-mix(in srgb, var(--foreground) 22%, transparent)"
const hueAt = (i: number) => PALETTE[i] ?? OTHER
/** node strength by rank of amount, largest first; past the end they stay at the last step */
const STEPS = [90, 68, 52, 40, 30, 24]
const inkAt = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`
const mixAt = (hue: string, pct: number) => `color-mix(in srgb, ${hue} ${pct}%, transparent)`

export interface FlowNode {
  id: string
  label: string
  value: number
  /** Kept for callers. Not painted: sources take the house order by position, uses stay ink. */
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
  { id: "salary", label: "Salary", value: 6200, color: "var(--chart-1)" },
  { id: "rental", label: "Rental", value: 1500, color: "var(--chart-4)" },
  { id: "divs", label: "Dividends", value: 900, color: "var(--chart-2)" },
  { id: "side", label: "Side work", value: 700, color: "var(--chart-5)" },
]
const DEFAULT_USES: FlowNode[] = [
  { id: "invest", label: "Investing", value: 2400, color: "var(--chart-1)" },
  { id: "rent", label: "Rent", value: 2200, color: "var(--chart-amber)" },
  { id: "living", label: "Living", value: 1600, color: "var(--chart-3)" },
  { id: "debt", label: "Debt", value: 1100, color: "var(--chart-5)" },
  { id: "save", label: "Savings", value: 1300, color: "var(--chart-2)" },
  { id: "fun", label: "Fun", value: 700, color: "var(--chart-4)" },
]

const W = 540
const H = 320
const PAD = { t: 14, b: 14, x: 4 }
const NODE_W = 11
const GAP = 9
/** the room a label takes beside its node */
const LABEL_W = 92
const contentH = H - PAD.t - PAD.b

const leftX = PAD.x + LABEL_W
const rightX = W - PAD.x - LABEL_W - NODE_W
const midX = W / 2 - NODE_W / 2

type Placed = FlowNode & { top: number; h: number; mid: number; ink: number; hue: string }

/** Walk both sides as partitions of the same [0, total] interval: every overlap
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

/** a ribbon `w` deep from (x0, y0) to (x1, y1), both given at its centre line, as one
 *  closed shape: the top edge out, the bottom edge back */
function ribbon(x0: number, y0: number, x1: number, y1: number, w: number) {
  const xc = ((x0 + x1) / 2).toFixed(2)
  const h = Math.max(1, w) / 2
  const f = (n: number) => n.toFixed(2)
  return [
    `M${f(x0)},${f(y0 - h)}`,
    `C${xc},${f(y0 - h)} ${xc},${f(y1 - h)} ${f(x1)},${f(y1 - h)}`,
    `L${f(x1)},${f(y1 + h)}`,
    `C${xc},${f(y1 + h)} ${xc},${f(y0 + h)} ${f(x0)},${f(y0 + h)}`,
    "Z",
  ].join(" ")
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`
const pctOf = (part: number, whole: number) => `${((part / (whole || 1)) * 100).toFixed(1)}%`

/**
 * A fund-flow diagram where income pools in one hub and fans out into uses, node and
 * ribbon depth standing for amount. Flow is conserved through the middle, so pointing at
 * any node lights the strands that pass through it the whole way across, dims the rest and
 * reads its amount and share beside the title. Pressing pins it.
 */
export function SankeyFlow({
  sources = DEFAULT_SOURCES,
  uses = DEFAULT_USES,
  title = "Monthly cash flow",
  className,
}: SankeyFlowProps) {
  const reduced = useReducedMotion()
  const [hover, setHover] = useState<string | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const hot = pin ?? hover
  const enter = (id: string) => {
    if (!pin) setHover(id)
  }
  const toggle = (id: string) => setPin((p) => (p === id ? null : id))
  const uid = useId().replace(/:/g, "")
  /* the entrance plays once, when a third of the diagram is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const play = !!reduced || seen
  /** a change of data glides between the two states */
  const morph = reduced ? { duration: 0 } : { duration: 0.35, ease: EASE }

  const { total, left, right, mid, inFlows, outFlows, bands, seams } = useMemo(() => {
    const total = sources.reduce((a, b) => a + b.value, 0)
    const scale = (contentH - Math.max(sources.length, uses.length) * GAP) / (total || 1)

    const stack = (nodes: FlowNode[]): Placed[] => {
      // strength follows amount, so the largest node is the strongest wherever it sits
      const rank = [...nodes.keys()].sort((a, b) => nodes[b].value - nodes[a].value)
      const totalH = nodes.reduce((a, n) => a + n.value * scale, 0) + (nodes.length - 1) * GAP
      let y = PAD.t + (contentH - totalH) / 2
      return nodes.map((n, i) => {
        const h = n.value * scale
        const top = y
        y += h + GAP
        return { ...n, top, h, mid: top + h / 2, ink: STEPS[Math.min(rank.indexOf(i), STEPS.length - 1)], hue: hueAt(i) }
      })
    }

    const left = stack(sources)
    const right = stack(uses)
    const byUse = Object.fromEntries(right.map((n) => [n.id, n])) as Record<string, Placed>
    const bySrc = Object.fromEntries(left.map((n) => [n.id, n])) as Record<string, Placed>
    const midH = total * scale
    const midTop = PAD.t + (contentH - midH) / 2
    const mid = { top: midTop, h: midH, mid: midTop + midH / 2 }

    let inCum = 0
    const inFlows = left.map((n) => {
      const w = n.value * scale
      const y1 = midTop + inCum + w / 2
      inCum += w
      return { id: `${n.id}~mid`, src: n.id, w, y0: n.mid, y1, hue: n.hue }
    })

    /* a strand leaves the hub at the offset its source arrived at and lands
       stacked inside its use, so depths line up on both faces */
    let outCum = 0
    const filled: Record<string, number> = {}
    const outFlows = decompose(sources, uses).map((f) => {
      const use = byUse[f.use]
      const w = f.value * scale
      const y0 = midTop + outCum * scale + w / 2
      outCum += f.value
      const done = filled[f.use] ?? 0
      const y1 = use.top + done * scale + w / 2
      filled[f.use] = done + f.value
      return { id: `mid~${f.use}~${f.src}`, src: f.src, use: f.use, w, y0, y1, hue: bySrc[f.src].hue }
    })

    let bandCum = 0
    const bands = left.map((n) => {
      const h = n.value * scale
      const y = midTop + bandCum
      bandCum += h
      return { id: n.id, y, h, hue: n.hue }
    })
    let seamCum = 0
    const seams = uses.slice(0, -1).map((n) => {
      seamCum += n.value * scale
      return { id: n.id, y: midTop + seamCum }
    })

    return { total, left, right, mid, inFlows, outFlows, bands, seams }
  }, [sources, uses])

  /** a source and a use are on the same path when a strand joins them */
  const joined = (a: string | null, b: string) =>
    a !== null && outFlows.some((f) => (f.src === a && f.use === b) || (f.use === a && f.src === b))

  const nodeOn = (id: string) => hot === null || hot === "mid" || hot === id || joined(hot, id)
  const inOn = (l: { src: string }) => hot === null || hot === "mid" || hot === l.src || joined(hot, l.src)
  const outOn = (f: { src: string; use: string }) => hot === null || hot === "mid" || hot === f.src || hot === f.use

  const nodes = [...left.map((n) => ({ n, side: "l" as const })), ...right.map((n) => ({ n, side: "r" as const }))]
  const hotNode = nodes.find(({ n }) => n.id === hot)
  const fade = reduced ? "none" : "opacity 160ms, fill 160ms"
  /* ribbons get their opacity from motion, so only the fill eases in CSS */
  const fillFade = reduced ? "none" : "fill 160ms"
  /* a strand is its source's colour, stronger while it is the one pointed through */
  const ribbonFill = (hue: string, lit: boolean) => mixAt(hue, lit && hot !== null ? 55 : 32)
  /* the dim and the morph run on their own clocks */
  const ribbonTransition = reduced ? { duration: 0 } : { opacity: { duration: 0.16, ease: EASE }, d: morph }
  /* the sweep covers the ribbons only, from the source faces to the use faces */
  const sweepX = leftX + NODE_W

  return (
    <div
      ref={rootRef}
      className={cn("w-[540px] max-w-full tabular-nums", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setPin(null)
      }}
    >
      <div className="mb-1 flex items-baseline justify-between gap-4 px-1">
        <span className="text-[13px] font-medium text-foreground/90">{title}</span>
        <span role="status" className="whitespace-nowrap text-[11px] text-foreground/45">
          {/* the readout swaps in place: 4px out of a 2px blur over 150ms */}
          <motion.span
            key={hot ?? "rest"}
            className="flex items-baseline gap-2"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
          {hot === "mid" ? (
            <>
              <span className="font-semibold text-foreground/90">{usd(total)}</span>
              <span>through cash</span>
            </>
          ) : hotNode ? (
            <>
              {hotNode.side === "l" && (
                <span aria-hidden className="h-1.5 w-1.5 self-center rounded-full" style={{ background: hotNode.n.hue }} />
              )}
              <span>{hotNode.n.label}</span>
              <span className="font-semibold text-foreground/90">{usd(hotNode.n.value)}</span>
              <span>
                {pctOf(hotNode.n.value, total)} of {hotNode.side === "l" ? "what comes in" : "what goes out"}
              </span>
            </>
          ) : (
            <span>
              {usd(total)} in · {usd(total)} out
            </span>
          )}
          </motion.span>
        </span>
      </div>

      <div className="relative" onPointerLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`${title}: ${sources.length} sources into ${uses.length} uses, ${usd(total)} through`}
        >
          <defs>
            <clipPath id={`${uid}-sweep`}>
              <motion.rect
                x={sweepX}
                y={0}
                height={H}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: play ? rightX - sweepX : 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
              />
            </clipPath>
          </defs>

          <g clipPath={`url(#${uid}-sweep)`}>
            {inFlows.map((l) => (
              <motion.path
                key={l.id}
                fill={ribbonFill(l.hue, inOn(l))}
                style={{ transition: fillFade }}
                initial={false}
                animate={{ opacity: inOn(l) ? 1 : 0.35, d: ribbon(leftX + NODE_W, l.y0, midX, l.y1, l.w) }}
                transition={ribbonTransition}
              />
            ))}

            {outFlows.map((f) => (
              <motion.path
                key={f.id}
                fill={ribbonFill(f.hue, outOn(f))}
                style={{ transition: fillFade }}
                initial={false}
                animate={{ opacity: outOn(f) ? 1 : 0.35, d: ribbon(midX + NODE_W, f.y0, rightX, f.y1, f.w) }}
                transition={ribbonTransition}
              />
            ))}
          </g>

          {/* the hub: one band per source, scored where it divides between uses */}
          <g>
            {bands.map((b) => (
              <motion.rect
                key={b.id}
                x={midX}
                width={NODE_W}
                fill={b.hue}
                opacity={nodeOn(b.id) ? 1 : 0.35}
                style={{ transition: fade }}
                initial={false}
                animate={{ attrY: b.y, height: b.h }}
                transition={morph}
              />
            ))}
            {seams.map((s) => (
              <motion.rect
                key={s.id}
                x={midX}
                width={NODE_W}
                height={1}
                fill="var(--background)"
                initial={false}
                animate={{ attrY: s.y - 0.5 }}
                transition={morph}
              />
            ))}
            {pin === "mid" && (
              <rect
                x={midX - 3}
                y={mid.top - 3}
                width={NODE_W + 6}
                height={mid.h + 6}
                rx={4}
                fill="none"
                stroke="var(--foreground)"
                strokeOpacity={0.45}
                strokeWidth={1}
              />
            )}
            <motion.text
              x={midX + NODE_W / 2}
              initial={false}
              animate={{ attrY: mid.top - 6 }}
              transition={morph}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={600}
              fill="var(--foreground)"
              fillOpacity={0.9}
            >
              Cash
            </motion.text>
          </g>

          {nodes.map(({ n, side }) => {
            const x = side === "l" ? leftX : rightX
            const on = nodeOn(n.id)
            const tx = side === "l" ? x - 7 : x + NODE_W + 7
            const anchor = side === "l" ? "end" : "start"
            return (
              <g key={`${side}-${n.id}`} opacity={on ? 1 : 0.35} style={{ transition: fade }}>
                {pin === n.id && (
                  <rect
                    x={x - 3}
                    y={n.top - 3}
                    width={NODE_W + 6}
                    height={n.h + 6}
                    rx={4}
                    fill="none"
                    stroke="var(--foreground)"
                    strokeOpacity={0.45}
                    strokeWidth={1}
                  />
                )}
                <motion.rect
                  x={x}
                  width={NODE_W}
                  rx={2}
                  fill={side === "l" ? n.hue : inkAt(hot === n.id ? 90 : n.ink)}
                  style={{ transition: fade }}
                  initial={false}
                  animate={{ attrY: n.top, height: n.h }}
                  transition={morph}
                />
                <motion.text
                  x={tx}
                  textAnchor={anchor}
                  fontSize={10}
                  fontWeight={500}
                  fill="var(--foreground)"
                  fillOpacity={0.9}
                  initial={false}
                  animate={{ attrY: n.mid - 3 }}
                  transition={morph}
                >
                  {n.label}
                </motion.text>
                <motion.text
                  x={tx}
                  textAnchor={anchor}
                  fontSize={9}
                  fill="var(--foreground)"
                  fillOpacity={0.45}
                  initial={false}
                  animate={{ attrY: n.mid + 9 }}
                  transition={morph}
                >
                  {usd(n.value)}
                </motion.text>
              </g>
            )
          })}
        </svg>

        {/* the pressable parts, laid over the drawing in its own proportions */}
        <button
          type="button"
          aria-label={`Cash, ${usd(total)} through`}
          aria-pressed={pin === "mid"}
          onClick={() => toggle("mid")}
          onPointerEnter={() => enter("mid")}
          onPointerLeave={() => setHover(null)}
          onFocus={() => enter("mid")}
          onBlur={() => setHover(null)}
          className="absolute cursor-pointer rounded-[4px] outline-none focus-visible:bg-foreground/[0.06]"
          style={{
            left: `${((midX - 8) / W) * 100}%`,
            width: `${((NODE_W + 16) / W) * 100}%`,
            top: `${((mid.top - 18) / H) * 100}%`,
            height: `${((mid.h + 22) / H) * 100}%`,
          }}
        />
        {nodes.map(({ n, side }) => (
          <button
            key={`${side}-${n.id}`}
            type="button"
            aria-label={`${n.label}, ${usd(n.value)}, ${pctOf(n.value, total)} of ${side === "l" ? "what comes in" : "what goes out"}`}
            aria-pressed={pin === n.id}
            onClick={() => toggle(n.id)}
            onPointerEnter={() => enter(n.id)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => enter(n.id)}
            onBlur={() => setHover(null)}
            className="absolute cursor-pointer rounded-[4px] outline-none focus-visible:bg-foreground/[0.06]"
            style={{
              left: `${((side === "l" ? PAD.x : rightX - 4) / W) * 100}%`,
              width: `${((LABEL_W + NODE_W + 4) / W) * 100}%`,
              top: `${((n.top - GAP / 2) / H) * 100}%`,
              height: `${((n.h + GAP) / H) * 100}%`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
