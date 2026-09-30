"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Sectors Donut, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the ring is one ink at six strengths, not blue, green and amber. The one sector being
     pointed at takes the accent, on the ring and in the list
   · arcs are filled shapes, 9px deep, not 13px strokes
   · the chart names itself to a screen reader, every row is a labelled button
   · every figure is tabular, colours come from tokens only */

const EASE = [0.16, 1, 0.3, 1] as const

export interface DonutSector {
  label: string
  pct: number
}

const DEFAULT_SECTORS: DonutSector[] = [
  { label: "Technology", pct: 31.2 },
  { label: "Financials", pct: 13.9 },
  { label: "Health care", pct: 12.4 },
  { label: "Consumer disc.", pct: 10.1 },
  { label: "Industrials", pct: 8.6 },
  { label: "Other", pct: 23.8 },
]

/** the strength of each arc, largest weight first; past the end they stay at the last step */
const STEPS = [92, 70, 54, 42, 32, 24]
/** The sector being pointed at, on the ring and in the list. At rest there is no colour at
 *  all; this one accent only ever means "this one" (Savva's pick of four trials, 2026-09-29),
 *  so it never competes with green and red for up and down. */
const ACCENT = "var(--chart-1)"
const inkAt = (rank: number) => `color-mix(in srgb, var(--foreground) ${STEPS[Math.min(rank, STEPS.length - 1)]}%, transparent)`

const SIZE = 132
const MID = SIZE / 2
const R_OUT = 60
const R_IN = 51
/** the gap between two arcs, in degrees */
const GAP = 1.6

const at = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180
  return `${(MID + r * Math.cos(a)).toFixed(2)} ${(MID + r * Math.sin(a)).toFixed(2)}`
}

/** one arc of the ring as a closed shape, from `from` to `to` degrees */
function arcPath(from: number, to: number) {
  const a = from + GAP / 2
  const b = Math.max(a + 0.2, to - GAP / 2)
  const large = b - a > 180 ? 1 : 0
  return `M ${at(a, R_OUT)} A ${R_OUT} ${R_OUT} 0 ${large} 1 ${at(b, R_OUT)} L ${at(b, R_IN)} A ${R_IN} ${R_IN} 0 ${large} 0 ${at(a, R_IN)} Z`
}

/**
 * Allocation ring: weights as arcs of one ink around a centred symbol, the list beside it.
 * Pointing at an arc or a row turns it the accent, dims the rest and puts its weight in the
 * middle.
 */
export function SectorsDonut({
  symbol = "SPY",
  caption = "503 holdings",
  sectors = DEFAULT_SECTORS,
  className,
}: {
  symbol?: string
  caption?: string
  sectors?: DonutSector[]
  className?: string
}) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<number | null>(null)

  const total = sectors.reduce((s, x) => s + x.pct, 0) || 1
  // strength follows size, so the largest weight is the strongest arc wherever it sits
  const rank = [...sectors.keys()].sort((a, b) => sectors[b].pct - sectors[a].pct)
  let acc = 0
  const arcs = sectors.map((s, i) => {
    const from = (acc / total) * 360
    acc += s.pct
    return { ...s, d: arcPath(from, (acc / total) * 360), ink: inkAt(rank.indexOf(i)) }
  })
  const fillOf = (i: number) => (hot === i ? ACCENT : arcs[i].ink)
  const top = arcs[rank[0]]

  return (
    <div className={cn("flex items-center gap-8 tabular-nums", className)}>
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`${symbol} by sector, ${caption}. Largest: ${top.label} ${top.pct.toFixed(1)}%`}
          onPointerLeave={() => setHot(null)}
        >
          {/* the ring turns 24° into place as its arcs arrive, once, on mount */}
          <motion.g
            initial={reduced ? false : { rotate: -24 }}
            animate={{ rotate: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }}
          >
          {arcs.map((a, i) => (
            <motion.path
              key={a.label}
              d={a.d}
              fill={fillOf(i)}
              style={{ transition: reduced ? "none" : "fill 160ms" }}
              initial={{ opacity: reduced ? 1 : 0 }}
              animate={{ opacity: hot === null || hot === i ? 1 : 0.35 }}
              transition={reduced ? { duration: 0 } : { duration: hot === null ? 0.35 : 0.16, ease: EASE, delay: hot === null ? Math.min(0.03, 0.24 / arcs.length) * i : 0 }}
              onPointerEnter={() => setHot(i)}
            />
          ))}
          </motion.g>
        </svg>
        <div role="status" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {/* the middle swaps in place: a 4px rise through a 2px blur */}
          <motion.span
            key={hot ?? "rest"}
            className="flex flex-col items-center"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            <span className="text-[13px] font-semibold text-foreground/90">
              {hot === null ? symbol : `${arcs[hot].pct.toFixed(1)}%`}
            </span>
            <span className="mt-0.5 max-w-[84px] truncate text-center text-[9px] text-foreground/45">
              {hot === null ? caption : arcs[hot].label}
            </span>
          </motion.span>
        </div>
      </div>

      <div className="flex flex-col" onPointerLeave={() => setHot(null)}>
        {arcs.map((a, i) => (
          <button
            key={a.label}
            type="button"
            aria-label={`${a.label} ${a.pct.toFixed(1)}%`}
            onPointerEnter={() => setHot(i)}
            onFocus={() => setHot(i)}
            onBlur={() => setHot(null)}
            className={cn(
              "-mx-2 flex items-center gap-2.5 rounded-[4px] px-2 py-[5px] text-left outline-none transition-opacity duration-200 focus-visible:bg-foreground/[0.06]",
              hot !== null && hot !== i && "opacity-35",
            )}
          >
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: fillOf(i), transition: reduced ? "none" : "background 160ms" }} />
            <span className="w-[120px] truncate text-[11.5px] text-foreground/90">{a.label}</span>
            <span className="w-[38px] text-right text-[11px] text-foreground/45">{a.pct.toFixed(1)}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}
