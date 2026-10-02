"use client"

import { useId, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Dotted Area Chart, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the line and the dot field are ink, not blue. Colour is kept for the change from the
     open, green or red
   · no raw colours in the source: the fade is an alpha mask on a token, so the white
     stops are gone, and the blue written as numbers is gone
   · no floating box over the chart: the summary under it already carries the price at the
     pointer, and now the move from the open beside it, as one status line
   · the summary has no rule above it and the change is signed text, not a tinted chip
   · the scrub dot has no halo because there is no card colour under it
   Props are unchanged.
   Motion (2026-10-01): once the chart is in view the line and its dot field sweep in left to
   right through one clip (0.9s; they drew on mount, off screen too); a new series morphs the
   line and the field and glides the gridlines with their ticks */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const INK = "var(--foreground)"

const W = 460
const H = 200
const PAD = { r: 44, t: 10, b: 12 }
/** pitch of the dot field under the line */
const DOT = 8
/** what the stretch ahead of the pointer falls back to */
const DIM = 0.35

/** deterministic default series, a drifting session close */
const DEFAULT_PRICES: number[] = (() => {
  let s = 29
  let v = 168
  const out: number[] = []
  for (let i = 0; i < 96; i++) {
    s = (s * 16807) % 2147483647
    v = Math.max(120, v + (s / 2147483647 - 0.45) * 5.6)
    out.push(v)
  }
  return out
})()

export interface DottedAreaChartProps {
  /** pair shown top-left */
  symbol?: string
  /** series, oldest → latest; the headline and the change both derive from it */
  prices?: number[]
  className?: string
}

/**
 * A price line standing on a field of dots: the area under it is filled with a dot
 * pattern that fades toward the floor, so the fill reads as texture instead of a slab.
 * Scrubbing splits the chart at the pointer, the stretch already passed stays lit while
 * the rest falls back, and the line under the chart reads the price at that bar with its
 * move from the open.
 */
export function DottedAreaChart({ symbol = "BTC / USD", prices = DEFAULT_PRICES, className }: DottedAreaChartProps) {
  const reduced = useReducedMotion()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const uid = useId().replace(/:/g, "")
  /* the entrance plays once, when a third of the chart is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const play = !!reduced || seen
  /** a change of data glides between the two states */
  const morph = reduced ? { duration: 0 } : { duration: 0.35, ease: EASE }

  const { data, n, min, max, x, y, line, area } = useMemo(() => {
    const data = prices.length ? prices : [0]
    const n = data.length
    const min = Math.min(...data)
    const max = Math.max(...data)
    const x = (i: number) => (i / Math.max(1, n - 1)) * (W - PAD.r)
    const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b)
    const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    const area = `${line} L${x(n - 1).toFixed(1)},${H - PAD.b} L0,${H - PAD.b} Z`
    return { data, n, min, max, x, y, line, area }
  }, [prices])

  const open = data[0]
  const last = data[n - 1]
  const at = hover == null ? last : data[hover]
  const change = at - open
  const pct = (change / (open || 1)) * 100
  const up = change >= 0
  const hue = up ? GREEN : RED
  const sign = up ? "+" : "−"

  const onMove = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    const px = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / (W - PAD.r)) * (n - 1)))))
  }

  const ticks = [max, max - (max - min) * 0.5, min]

  return (
    <div ref={rootRef} className={cn("w-[480px] max-w-full tabular-nums", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-semibold text-foreground/90">{symbol}</span>
        <span className="text-[10px] text-foreground/35">{hover == null ? `${n} bars` : `bar ${hover + 1} of ${n}`}</span>
      </div>

      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 block h-auto w-full cursor-crosshair touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${symbol} price over ${n} bars, last $${last.toFixed(2)}, ${last >= open ? "up" : "down"} ${Math.abs(((last - open) / (open || 1)) * 100).toFixed(2)} percent from the open`}
      >
        <defs>
          {/* the dot field: one dot of ink per 8px cell, the component's own texture */}
          <pattern id={`dots-${uid}`} x="0" y="0" width={DOT} height={DOT} patternUnits="userSpaceOnUse">
            <circle cx={DOT / 2} cy={DOT / 2} r={1.15} fill={INK} fillOpacity={0.9} />
          </pattern>
          {/* dots thin out toward the floor so the fill never reads as a block; the mask
              reads alpha, so its stops can be a token in both themes */}
          <linearGradient id={`fade-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={INK} stopOpacity="0.42" />
            <stop offset="100%" stopColor={INK} stopOpacity="0" />
          </linearGradient>
          <mask id={`mask-${uid}`} style={{ maskType: "alpha" }}>
            <rect x="0" y="0" width={W} height={H} fill={`url(#fade-${uid})`} />
          </mask>
          {/* everything left of the pointer stays lit; the rest falls back */}
          <clipPath id={`past-${uid}`}>
            <rect x="0" y="0" width={hover == null ? W : x(hover)} height={H} />
          </clipPath>
          {/* the one entrance: line and field sweep in left to right, a few px wider for the round caps */}
          <clipPath id={`reveal-${uid}`}>
            <motion.rect
              x={-4}
              y={0}
              height={H}
              initial={reduced ? false : { width: 0 }}
              animate={{ width: play ? W - PAD.r + 8 : 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
            />
          </clipPath>
        </defs>

        {/* gridlines and right-edge price ticks */}
        {ticks.map((v, i) => (
          <g key={i}>
            <motion.line
              x1={0}
              x2={W - PAD.r}
              stroke={INK}
              strokeOpacity={0.05}
              strokeWidth={1}
              strokeDasharray="2 4"
              initial={false}
              animate={{ y1: y(v), y2: y(v) }}
              transition={morph}
            />
            <motion.text
              x={W - PAD.r + 8}
              fontSize={8.5}
              fill={INK}
              fillOpacity={0.35}
              className="tabular-nums"
              initial={false}
              animate={{ attrY: y(v) + 3 }}
              transition={morph}
            >
              {v.toFixed(0)}
            </motion.text>
          </g>
        ))}

        {/* resting state, and the bed the lit copy sits on while scrubbing; the group owns
            the hover dim (160ms), the clip owns the one sweep in, the paths morph on new data */}
        <g clipPath={`url(#reveal-${uid})`} style={{ opacity: hover == null ? 1 : DIM, transition: "opacity 160ms ease-out" }}>
          <motion.path
            fill={`url(#dots-${uid})`}
            mask={`url(#mask-${uid})`}
            initial={false}
            animate={{ d: area }}
            transition={morph}
          />
          <motion.path
            fill="none"
            stroke={INK}
            strokeOpacity={0.9}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ d: line }}
            transition={morph}
          />
        </g>

        {/* the lit stretch behind the pointer */}
        {hover != null && (
          <g clipPath={`url(#past-${uid})`} pointerEvents="none">
            <path d={area} fill={`url(#dots-${uid})`} mask={`url(#mask-${uid})`} />
            <path d={line} fill="none" stroke={INK} strokeOpacity={0.9} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}

        {/* guide and the bar's own dot */}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} y1={PAD.t} x2={x(hover)} y2={H - PAD.b} stroke={INK} strokeOpacity={0.16} strokeWidth={1} />
            <circle cx={x(hover)} cy={y(at)} r={3} fill={INK} />
          </g>
        )}
      </svg>

      {/* summary: open is the reference every number here is measured against */}
      {/* going from the last close to the pointed bar and back, the readout crosses over
          (4px, 2px blur, 150ms); while scrubbing it follows the pointer in place */}
      <motion.div
        key={hover == null ? "rest" : "scrub"}
        role="status"
        className="mt-2.5 flex items-baseline justify-between"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.15, ease: EASE }}
      >
        <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">${at.toFixed(2)}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-[11px] font-medium" style={{ color: hue, transition: "color 160ms ease-out" }}>
            {sign}${Math.abs(change).toFixed(2)} · {sign}
            {Math.abs(pct).toFixed(2)}%
          </span>
          <span className="text-[10px] text-foreground/35">open ${open.toFixed(2)}</span>
        </span>
      </motion.div>
    </div>
  )
}
