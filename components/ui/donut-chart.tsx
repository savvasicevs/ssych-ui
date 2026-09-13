"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const SANS = "inherit"
const TEXT = "var(--foreground)"
const TEXT_MUTED = "var(--muted-foreground)"

const R = 56
/** the band's weight — thick enough to read as a band, with room to grow into */
const THICK = 9
/** what hover adds, radially; the arc keeps its own degrees either way */
const HOT = 3
/** degrees taken out of a slice, half at each end, capped at half its own span */
const GAP_DEG = 4.5
/** the tail's colour — the house neutral, so it reads as "the rest", not a hue */
const OTHER = "color-mix(in srgb, var(--foreground) 22%, transparent)"

export interface DonutDatum {
  name: string
  value: number
  color: string
  /** trailing figure on the legend row — the amount the share is a share of */
  amount?: string
}

export interface DonutChartProps {
  data?: DonutDatum[]
  /** centre figure when nothing is hovered */
  total?: string
  /** what the centre calls that figure */
  label?: string
  /** ring and legend side by side, or legend stacked under the ring for a rail */
  layout?: "row" | "stacked"
  /** the picked slice's name — dims every other slice, ring and legend alike */
  selected?: string | null
  /** given, the legend rows become toggles and the chart becomes the control */
  onSelect?: (name: string) => void
  className?: string
}

/* The top five positions of the sample book, then every remaining position
   summed into one neutral band. `Other` is the arithmetic of the tail, never a
   hand-typed figure. Brand hues take the var-with-fallback form so a host that
   defines a coin token wins, and the raw value is only ever the fallback. */
const DEFAULT_SLICES: DonutDatum[] = [
  { name: "Bitcoin", value: 27139.98, color: "var(--coin-btc, #f7931a)" },
  { name: "Ethereum", value: 12505, color: "var(--coin-eth, #627eea)" },
  { name: "Solana", value: 4144, color: "var(--coin-sol, #9945ff)" },
  { name: "Avalanche", value: 3283.2, color: "var(--coin-avax, #e84142)" },
  { name: "Dogecoin", value: 2997, color: "var(--coin-doge, #c2a633)" },
  { name: "Other · 11", value: 13955.9, color: OTHER },
]

const usdAbbr = (n: number) => {
  const abs = Math.abs(n)
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e4) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const DEFAULT_TOTAL = DEFAULT_SLICES.reduce((s, d) => s + d.value, 0)

/**
 * Allocation as a ring rather than a pie: the stroke is a band around an open
 * centre that the total sits in. Slices sort descending, ring and legend
 * cross-highlight together, and the centre answers with whatever you point at.
 * Square caps keep the gaps real, so a slice thickens radially and never laps
 * its neighbour.
 */
export function DonutChart({
  data = DEFAULT_SLICES,
  total = usdAbbr(DEFAULT_TOTAL),
  label = "Total",
  layout = "row",
  selected = null,
  onSelect,
  className,
}: DonutChartProps) {
  const [hot, setHot] = useState<string | null>(null)
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const sum = sorted.reduce((s, d) => s + d.value, 0)

  /* one focus at a time: the pointer wins while it is over the chart, otherwise
     the picked slice is what the ring and the centre answer about */
  const focus = hot ?? selected

  let acc = 0
  const segs = sorted.map((d) => {
    const frac = d.value / sum
    const span = frac * 360
    /* the gap never eats more than half the slice, so a dust tier still draws
       its own fraction of the circle, just inset less */
    const gap = Math.min(GAP_DEG, span * 0.5)
    const a0 = acc * 360 + gap / 2
    const a1 = (acc + frac) * 360 - gap / 2
    acc += frac
    return { ...d, a0, a1: Math.max(a1, a0 + 0.5), frac }
  })

  const arc = (a0: number, a1: number) => {
    const rad = (a: number) => ((a - 90) * Math.PI) / 180
    const x0 = 70 + R * Math.cos(rad(a0))
    const y0 = 70 + R * Math.sin(rad(a0))
    const x1 = 70 + R * Math.cos(rad(a1))
    const y1 = 70 + R * Math.sin(rad(a1))
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
  }

  const centred = focus ? segs.find((s) => s.name === focus) : undefined

  const ring = (
    <div className="relative">
      <svg
        width="140"
        height="140"
        viewBox="0 0 140 140"
        role="img"
        aria-label={segs.map((s) => `${s.name} ${(s.frac * 100).toFixed(1)}%`).join(", ")}
      >
        {segs.map((s) => (
          <g key={s.name}>
            {/* the hit area, invisible and wider than the band: a 9px arc with
                real gaps is a thin thing to ask a pointer to find */}
            <path
              aria-hidden
              d={arc(s.a0, s.a1)}
              fill="none"
              stroke="transparent"
              strokeWidth={THICK + 12}
              onMouseEnter={() => setHot(s.name)}
              onMouseLeave={() => setHot(null)}
              onClick={onSelect ? () => onSelect(s.name) : undefined}
              className={onSelect ? "cursor-pointer" : undefined}
            />
            <path
              aria-hidden
              pointerEvents="none"
              d={arc(s.a0, s.a1)}
              fill="none"
              stroke={s.color}
              /* butt, never round: a round cap runs past the angle the slice
                 ends on, so a thickened slice would lap its neighbour */
              strokeLinecap="butt"
              strokeWidth={focus === s.name ? THICK + HOT : THICK}
              opacity={focus && focus !== s.name ? 0.3 : 1}
              className="transition-all duration-200"
            />
          </g>
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center">
          <span className="text-[10px]" style={{ color: TEXT_MUTED }}>
            {centred ? centred.name : label}
          </span>
          <span className="text-[17px] font-semibold tabular-nums" style={{ color: TEXT }}>
            {centred ? usdAbbr(centred.value) : total}
          </span>
        </div>
      </div>
    </div>
  )

  const legend = (
    <div className={layout === "stacked" ? "flex w-full flex-col gap-0.5" : "flex flex-col gap-1.5"}>
      {segs.map((s) => {
        const on = selected === s.name
        return (
          <button
            key={s.name}
            type="button"
            onClick={onSelect ? () => onSelect(s.name) : undefined}
            aria-pressed={onSelect ? on : undefined}
            onMouseEnter={() => setHot(s.name)}
            onMouseLeave={() => setHot(null)}
            onFocus={() => setHot(s.name)}
            onBlur={() => setHot(null)}
            /* selection is a fill, never a border swap, so the column cannot
               reflow by a pixel when the scope changes */
            className={
              layout === "stacked"
                ? `flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 ${onSelect ? "hover:bg-foreground/[0.03]" : ""} ${on ? "bg-foreground/[0.05]" : ""}`
                : "flex items-center gap-2 text-left"
            }
            style={{
              opacity: focus && focus !== s.name ? 0.4 : 1,
              transitionTimingFunction: `cubic-bezier(${EASE.join(",")})`,
            }}
          >
            {/* a tall pill, not a dot: a legend mark has to carry its colour far
                enough to be matched to an arc */}
            <span className="h-[14px] w-[5px] shrink-0 rounded-[2px]" style={{ background: s.color }} />
            <span
              className={layout === "stacked" ? "min-w-0 flex-1 truncate text-[12px]" : "w-24 truncate text-[12px]"}
              style={{ color: TEXT }}
            >
              {s.name}
            </span>
            <span className="text-[11px] tabular-nums" style={{ color: TEXT_MUTED }}>
              {(s.frac * 100).toFixed(1)}%
            </span>
            {s.amount && (
              <span className="w-[86px] text-right text-[10.5px] tabular-nums" style={{ color: TEXT_MUTED }}>
                {s.amount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  return (
    <div
      className={cn(layout === "stacked" ? "flex w-full flex-col items-center gap-4" : "flex items-center gap-6", className)}
      style={{ fontFamily: SANS }}
    >
      {ring}
      {legend}
    </div>
  )
}
