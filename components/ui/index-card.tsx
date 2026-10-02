"use client"

import { useId, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Index Card, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card: the outline, the card ground, the header band and the two inner rules are
     gone, and so is the dotted paper behind the line. Three 1px gridlines at 5% ink stay
   · the caption is ink, not amber: colour is kept for up and down
   · every figure is tabular (the root sets it, so the tab names with digits line up too)
   · the session time is plain text beside the price while you scrub, not a bordered chip
     riding the pointer
   · the index switcher is a row of quiet pills with one fill that slides to the chosen
     one (it was an underline on a rule)
   · the line is 1.8px with round joins; the change is printed with a true minus sign
   · the chart names itself to a screen reader, with the index and its close
   Motion (2026-10-01): once the plot first comes into view the line and its fill are wiped
   in from the left by one clip, 850ms. Changing index morphs the line and the fill from the
   old session into the new one in 380ms (both walks are 48 samples, so the paths tween
   point for point) and the hue crosses over; it used to wipe out and redraw. Reduced
   motion draws every state at once. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

const W = 300
const H = 110
const SAMPLES = 48
/** fractions down the plot where a gridline sits */
const GRID = [0.25, 0.5, 0.75]

export interface IndexQuote {
  label: string
  /** Already-formatted close, e.g. "5,648.40". */
  price: string
  /** Already-formatted change, e.g. "+63.97 (+1.15%)". A leading − flips the hue. */
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

/** a figure that changes while scrubbing re-enters 4px out of a 2px blur over 150ms;
    reduced motion keeps the fade and drops the travel */
function Swap({ k, reduced, children }: { k: string; reduced: boolean; children: React.ReactNode }) {
  return (
    <motion.span
      key={k}
      className="inline-block"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.15, ease: EASE }}
    >
      {children}
    </motion.span>
  )
}

/** Deterministic intraday walk: same seed, same shape, every render. */
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

/** Session clock across the samples, open to close, spread evenly. */
function timeAt(i: number, n: number, openMin: number, closeMin: number) {
  const m = openMin + Math.round((i / (n - 1)) * (closeMin - openMin))
  const h = Math.floor(m / 60)
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`
}

export interface IndexCardProps {
  /** Quiet label above the price. */
  eyebrow?: string
  /** One tab per index; the first four fit the 300px width comfortably. */
  indices?: IndexQuote[]
  /** Which tab opens selected. */
  defaultIndex?: number
  /** Session bounds for the scrub readout, in minutes past midnight. */
  openMinutes?: number
  closeMinutes?: number
  /** Fires when a tab is chosen. */
  onSelect?: (index: IndexQuote, i: number) => void
  className?: string
}

/**
 * Markets block: one price, the day's line you can scrub, a row of pills to change index
 * and the one-paragraph read below. Scrubbing snaps a rule to the nearest real sample,
 * recomputes the price off that point, prints its session time beside it and dims the
 * line to the right of the pointer. Changing index swaps price, line and story together.
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
  const reduced = useReducedMotion() ?? false
  const uid = useId().replace(/:/g, "")
  const [active, setActive] = useState(Math.min(Math.max(defaultIndex, 0), indices.length - 1))
  const idx = indices[active]

  const up = !idx.delta.trim().startsWith("-") && !idx.delta.trim().startsWith("−")
  const hue = up ? GREEN : RED
  /** the change as written, with every hyphen minus made a true minus */
  const delta = idx.delta.replace(/-(?=[\d.])/g, "−")

  const data = useMemo(() => walk(idx.seed, SAMPLES), [idx.seed])
  const n = data.length
  const min = Math.min(...data)
  const max = Math.max(...data)
  const px = (i: number) => (i / (n - 1)) * W
  const py = (v: number) => 6 + (1 - (v - min) / (max - min || 1)) * (H - 12)
  const line = data.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" L")

  // the rule snaps to the NEAREST sample and drives the readout at once
  const svgRef = useRef<SVGSVGElement>(null)
  const seen = useInView(svgRef, { once: true, amount: 0.3 })
  const shown = seen || reduced
  const [hover, setHover] = useState<number | null>(null)
  const onMove = (e: React.PointerEvent) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(0, Math.min(n - 1, Math.round((x / W) * (n - 1)))))
  }
  const onLeave = () => setHover(null)

  /** the price at a sample: the close scaled by that sample over the last one */
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
    <div className={cn("w-[300px] tabular-nums", className)} role="group" aria-label={`${eyebrow}: ${idx.label}`}>
      <div className="text-[11px] font-medium text-foreground/45">{eyebrow}</div>

      <div role="status" className="mt-1.5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={idx.label}
            className="flex items-baseline gap-2"
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.1 } }}
            transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
          >
            <span className="text-[19px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
              <Swap k={`p${hover ?? "close"}`} reduced={reduced}>
                ${shownPrice}
              </Swap>
            </span>
            {hover == null ? (
              <span className="text-[11px] font-medium" style={{ color: hue }}>
                <Swap k="delta" reduced={reduced}>
                  {delta}
                </Swap>
              </span>
            ) : (
              <span className="text-[11px] text-foreground/45">
                <Swap k={`t${hover}`} reduced={reduced}>
                  {timeAt(hover, n, openMinutes, closeMinutes)}
                </Swap>
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* the day's line; right of the pointer dims */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block w-full cursor-crosshair touch-none overflow-visible"
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerCancel={onLeave}
        role="img"
        aria-label={`${idx.label} through the session, closing at $${idx.price}, ${delta}`}
      >
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hue} stopOpacity="0.14" style={{ transition: reduced ? "none" : "stop-color 200ms" }} />
            <stop offset="100%" stopColor={hue} stopOpacity="0" style={{ transition: reduced ? "none" : "stop-color 200ms" }} />
          </linearGradient>
          {/* the entrance: one clip wipes the line and its fill in from the left, once */}
          <clipPath id={`${uid}-wipe`}>
            <motion.rect
              x={-4}
              y={-4}
              height={H + 8}
              initial={{ width: reduced ? W + 8 : 0 }}
              animate={{ width: shown ? W + 8 : 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.85, ease: EASE }}
            />
          </clipPath>
          <clipPath id={`${uid}-left`}>
            <rect x={0} y={0} width={crossX} height={H} />
          </clipPath>
        </defs>

        {GRID.map((f) => (
          <line key={f} x1={0} x2={W} y1={f * H} y2={f * H} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} />
        ))}

        {/* the whole line, which steps back while scrubbing; a new index morphs it in place */}
        <g clipPath={`url(#${uid}-wipe)`} opacity={hover == null ? 1 : 0.35} style={{ transition: reduced ? "none" : "opacity 200ms" }}>
          <motion.path
            initial={false}
            animate={{ d: `M${line} L ${W},${H} L 0,${H} Z` }}
            transition={reduced ? { duration: 0 } : { duration: 0.38, ease: EASE }}
            fill={`url(#${uid}-fill)`}
          />
          <motion.path
            initial={false}
            animate={{ d: `M${line}` }}
            transition={reduced ? { duration: 0 } : { duration: 0.38, ease: EASE }}
            fill="none"
            stroke={hue}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: reduced ? "none" : "stroke 200ms" }}
          />
        </g>

        {/* a full-strength copy, kept to the LEFT of the pointer */}
        {hover != null && (
          <g clipPath={`url(#${uid}-left)`} pointerEvents="none">
            <path d={`M${line} L ${W},${H} L 0,${H} Z`} fill={`url(#${uid}-fill)`} />
            <path d={`M${line}`} fill="none" stroke={hue} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}

        {hover != null && (
          <g pointerEvents="none">
            <line x1={crossX} x2={crossX} y1={0} y2={H} stroke="var(--foreground)" strokeOpacity={0.22} strokeWidth={1} />
            <circle cx={crossX} cy={py(data[hover])} r={3} fill={hue} />
          </g>
        )}
      </svg>

      {/* index pills: one fill slides to the chosen one */}
      <div className="-mx-1 mt-3 flex" role="group" aria-label="Index">
        {indices.map((ix, i) => (
          <button
            key={ix.label}
            type="button"
            aria-pressed={active === i}
            aria-label={`${ix.label}, $${ix.price}`}
            onClick={() => {
              setActive(i)
              onLeave()
              onSelect?.(ix, i)
            }}
            className={cn(
              "relative h-7 flex-1 whitespace-nowrap rounded-full text-center text-[11px] font-medium outline-none transition-colors duration-150 focus-visible:bg-foreground/[0.06]",
              active === i ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/80",
            )}
          >
            {active === i &&
              (reduced ? (
                <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
              ) : (
                <motion.span
                  aria-hidden
                  layoutId={`${uid}-pill`}
                  className="absolute inset-0 rounded-full bg-foreground/[0.08]"
                  transition={{ duration: 0.25, ease: EASE }}
                />
              ))}
            <span className="relative">{ix.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={idx.label}
          className="mt-3 text-[11.5px] leading-[1.6] text-foreground/45"
          initial={{ opacity: reduced ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.1 } }}
          transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
        >
          {idx.note}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
