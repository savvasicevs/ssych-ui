"use client"

import { useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const AMBER = "var(--chart-amber)"
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const CARD = "var(--card)"
const HAIRLINE = "var(--border)"
/** The one dotted ground — follows the theme through --foreground. */
const DOT_GRID =
  "radial-gradient(color-mix(in srgb, var(--foreground) 5%, transparent) 1px, transparent 1px) 0 0 / 14px 14px"

const W = 298 // card inner width (300 minus the 1px borders) — the line runs flush edge to edge
const H = 110
const SAMPLES = 48

export interface IndexQuote {
  label: string
  /** Already-formatted close, e.g. "5,648.40". */
  price: string
  /** Already-formatted change, e.g. "+63.97 (+1.15%)" — a leading − flips the hue. */
  delta: string
  /** Deterministic seed for this index's intraday walk. */
  seed: number
  /** The one-paragraph read under the tabs. */
  note: string
}

const DEFAULT_INDICES: IndexQuote[] = [
  {
    label: "S&P 500",
    price: "5,648.40",
    delta: "+63.97 (+1.15%)",
    seed: 5,
    note: "Broad strength into the close; breadth improved with 8 of 11 sectors green, led by industrials and financials.",
  },
  {
    label: "Dow 30",
    price: "41,563.08",
    delta: "+228.03 (+0.55%)",
    seed: 31,
    note: "Blue chips ground higher through the session, helped by a soft-landing read on the latest inflation print.",
  },
  {
    label: "Nasdaq",
    price: "17,713.62",
    delta: "+197.19 (+1.13%)",
    seed: 77,
    note: "Megacap tech carried the tape; semis rebounded from early weakness to finish near session highs.",
  },
  {
    label: "Russel 2K",
    price: "2,178.52",
    delta: "+14.10 (+0.65%)",
    seed: 111,
    note: "Consumer sentiment turned up for the first time after five months of stagnant readings, and small caps took the hint.",
  },
]

/** Deterministic intraday walk — same seed, same shape, every render. */
function walk(seed: number, n: number) {
  let s = seed
  let v = 40
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    s = (s * 48271) % 2147483647
    v = Math.max(10, v + (s / 2147483647 - 0.42) * 5)
    out.push(v)
  }
  return out
}

/** Session clock across the samples — open → close, spread evenly. */
function timeAt(i: number, n: number, openMin: number, closeMin: number) {
  const m = openMin + Math.round((i / (n - 1)) * (closeMin - openMin))
  const h = Math.floor(m / 60)
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}

export interface IndexCardProps {
  /** Quiet label above the price — a caption, not a section header. */
  eyebrow?: string
  /** One tab per index; the first four fit the 300px card comfortably. */
  indices?: IndexQuote[]
  /** Which tab opens selected. */
  defaultIndex?: number
  /** Session bounds for the scrub tooltip, in minutes past midnight. */
  openMinutes?: number
  closeMinutes?: number
  /** Fires when a tab is chosen. */
  onSelect?: (index: IndexQuote, i: number) => void
  className?: string
}

/**
 * Markets sidebar card: one big price, an index switcher whose underline walks
 * between tabs, a full-bleed line you can scrub, and the one-paragraph read
 * below. Scrubbing snaps a crosshair to the nearest real sample, floats the
 * session time above it, recomputes the headline off the hovered point, and
 * dims everything to the right of the cursor so the eye stops where the pointer
 * is. Switching index swaps price, line and story together.
 */
export function IndexCard({
  eyebrow = "Markets",
  indices = DEFAULT_INDICES,
  defaultIndex = 3,
  openMinutes = 570,
  closeMinutes = 960,
  onSelect,
  className,
}: IndexCardProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const [active, setActive] = useState(Math.min(Math.max(defaultIndex, 0), indices.length - 1))
  const idx = indices[active]

  const up = !idx.delta.trim().startsWith("-") && !idx.delta.trim().startsWith("−")
  const hue = up ? GREEN : RED

  const data = useMemo(() => walk(idx.seed, SAMPLES), [idx.seed])
  const n = data.length
  const min = Math.min(...data)
  const max = Math.max(...data)
  const px = (i: number) => (i / (n - 1)) * W
  const py = (v: number) => 6 + (1 - (v - min) / (max - min || 1)) * (H - 12)
  const line = data.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" L")

  // The crosshair magnets to the NEAREST sample and drives the readout
  // synchronously — lag reads as broken on a quote card.
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const onMove = (e: React.PointerEvent) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round((x / W) * (n - 1)))))
  }
  const onLeave = () => setHover(null)

  const close = parseFloat(idx.price.replace(/,/g, ""))
  const shownPrice =
    hover == null || !Number.isFinite(close)
      ? idx.price
      : ((close * data[hover]) / data[n - 1]).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
  const crossX = hover == null ? 0 : px(hover)

  return (
    <div
      className={cn("w-[300px] overflow-hidden rounded-lg border", className)}
      style={{ background: CARD, borderColor: HAIRLINE }}
    >
      {/* a quiet label, not a section header — one step down in size and weight */}
      <div className="border-b px-4 py-2" style={{ borderColor: HAIRLINE }}>
        <span className="text-[9px]" style={{ color: AMBER }}>
          {eyebrow}
        </span>
      </div>

      <div className="px-4 pt-3.5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={idx.label}
            initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.1 } }}
            transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
          >
            <span className="text-[19px] font-semibold tabular-nums text-foreground/90">${shownPrice}</span>
            <span className="ml-2 text-[11px] tabular-nums" style={{ color: hue }}>
              {idx.delta}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* full-bleed scrubbable line — no side padding; right of the cursor dims */}
      <div className="relative">
        {/* dotted graph paper behind the line */}
        <div className="pointer-events-none absolute inset-0" style={{ background: DOT_GRID }} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.svg
            ref={svgRef}
            key={idx.label}
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="relative mt-2 block cursor-crosshair touch-none"
            onPointerMove={onMove}
            onPointerLeave={onLeave}
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.1 } }}
          >
            <defs>
              <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={hue} stopOpacity="0.14" />
                <stop offset="100%" stopColor={hue} stopOpacity="0" />
              </linearGradient>
              <clipPath id={`${uid}-left`}>
                <rect x={0} y={0} width={crossX} height={H} />
              </clipPath>
            </defs>

            {/* base chart — drops opacity while scrubbing (the "right side" read) */}
            <g opacity={hover == null ? 1 : 0.3} style={{ transition: reduced ? "none" : "opacity 0.2s" }}>
              <path d={`M${line} L ${W},${H} L 0,${H} Z`} fill={`url(#${uid}-fill)`} />
              <motion.path
                d={`M${line}`}
                fill="none"
                stroke={hue}
                strokeWidth={1.3}
                initial={{ pathLength: reduced ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={reduced ? { duration: 0 } : { duration: 0.8, ease: EASE }}
              />
            </g>

            {/* full-strength copy clipped to the LEFT of the cursor */}
            {hover != null && (
              <g clipPath={`url(#${uid}-left)`} pointerEvents="none">
                <path d={`M${line} L ${W},${H} L 0,${H} Z`} fill={`url(#${uid}-fill)`} />
                <path d={`M${line}`} fill="none" stroke={hue} strokeWidth={1.3} />
              </g>
            )}

            {/* crosshair — synchronous, snapped to the real datum */}
            {hover != null && (
              <g pointerEvents="none">
                <line
                  x1={crossX}
                  x2={crossX}
                  y1={4}
                  y2={H}
                  stroke="color-mix(in srgb, var(--foreground) 18%, transparent)"
                  strokeWidth={1}
                />
                <circle cx={crossX} cy={py(data[hover])} r={3} fill={hue} stroke={CARD} strokeWidth={1.5} />
              </g>
            )}
          </motion.svg>
        </AnimatePresence>

        {/* session time riding the cursor */}
        {hover != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground"
            style={{
              left: `${((crossX / W) * 100).toFixed(1)}%`,
              transform: `translateX(${crossX < 28 ? "0%" : crossX > W - 28 ? "-100%" : "-50%"})`,
              background: CARD,
              borderColor: HAIRLINE,
            }}
            role="status"
          >
            {timeAt(hover, n, openMinutes, closeMinutes)}
          </div>
        )}
      </div>

      {/* index tabs — the underline walks to the new slot */}
      <div className="flex border-b px-4" style={{ borderColor: HAIRLINE }}>
        {indices.map((ix, i) => (
          <button
            key={ix.label}
            type="button"
            aria-pressed={active === i}
            onClick={() => {
              setActive(i)
              onLeave()
              onSelect?.(ix, i)
            }}
            className={cn(
              "relative flex-1 pb-2.5 pt-1 text-center text-[10px] transition-colors duration-150",
              active === i ? "text-foreground/85" : "text-foreground/35 hover:text-foreground/55"
            )}
          >
            {ix.label}
            {active === i && (
              <motion.span
                layoutId={`${uid}-underline`}
                className="absolute inset-x-2 -bottom-px h-px bg-foreground/70"
                transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={idx.label}
          className="px-4 py-3.5 text-[11.5px] leading-[1.6] text-foreground/50"
          initial={{ opacity: reduced ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.1 } }}
          transition={reduced ? { duration: 0 } : { duration: 0.3 }}
        >
          {idx.note}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
