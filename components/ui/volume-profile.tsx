"use client"

import { useRef, useState } from "react"
import { useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Volume Profile, new through ssych-component (2026-09-29).
   What it is for: seeing at which prices the trading actually happened, so the fair
   range and the thin edges of a session read at a glance.
   Read first: the longest bar, the point of control, named on the price axis.
   The pointer: scrubbing up and down the profile turns the level under it the accent,
   dims the rest and reads its price range, volume and share of the session in the line
   above the bars.
   Reference: "volume profile" on browsable returned candle charts with a volume pane and
   no true profile, so no source was read. The one idea kept from those listings is the
   price axis on the right with the marks hugging it. The rest is the trading convention:
   point of control, value area, bars by price.
   Colour: volume has no direction, so it is one ink at three strengths: the point of
   control strongest, the value area full, everything outside it dimmer.
   Formulas, all from `levels`, `step` and `share`:
   · total            = sum of volume over every level
   · point of control = the level with the most volume
   · value area       = start at the point of control and keep adding the neighbouring
                        level (above or below) with the larger volume until the sum
                        reaches share × total; it runs from the lowest level taken to
                        the top of the highest one (price + step)
   · bar length       = volume / volume at the point of control
   · share of volume  = volume / total × 100
   Motion (2026-10-01): the bars grow out from the left once the profile is a third in view,
   top row first, 15ms apart (capped at 360ms) over 450ms, as CSS transitions; reduced motion
   shows them grown. No data changes here, so nothing else moves. */

const CSS_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"
const ACCENT = "var(--chart-1)"

export interface VolumeLevel {
  /** lower edge of the price bucket */
  price: number
  /** volume traded inside the bucket, in units of the asset */
  volume: number
}

export interface VolumeProfileProps {
  /** one entry per price bucket, any order */
  levels?: VolumeLevel[]
  /** height of one bucket, in price */
  step?: number
  /** the part of all volume the value area has to hold, 0 to 1 */
  share?: number
  symbol?: string
  title?: string
  className?: string
}

/** Deterministic session (Lehmer): one high-volume node and a smaller shelf under it. */
const DEFAULT_LEVELS: VolumeLevel[] = (() => {
  let s = 3050
  const rnd = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  return Array.from({ length: 24 }, (_, i) => {
    const node = Math.exp(-((i - 14) ** 2) / 18)
    const shelf = 0.45 * Math.exp(-((i - 5) ** 2) / 8)
    return { price: 2940 + i * 10, volume: Math.round((node + shelf + 0.08 + rnd() * 0.12) * 2400) }
  })
})()

const W = 440
const ROW = 12
const AXIS = 122
const BAR_W = W - AXIS
const BAR_H = ROW - 2

const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`
const whole = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 })

function valueArea(vols: number[], share: number) {
  const total = vols.reduce((s, v) => s + v, 0)
  const poc = vols.reduce((best, v, i) => (v > vols[best] ? i : best), 0)
  let lo = poc
  let hi = poc
  let held = vols[poc] ?? 0
  while (held < total * share && (lo > 0 || hi < vols.length - 1)) {
    const below = lo > 0 ? vols[lo - 1] : -1
    const above = hi < vols.length - 1 ? vols[hi + 1] : -1
    if (above >= below) {
      hi += 1
      held += above
    } else {
      lo -= 1
      held += below
    }
  }
  return { total, poc, lo, hi, held }
}

/**
 * Volume by price: one bar per price level beside the axis, the point of control named,
 * the value area at full strength and the thin edges dimmer. Scrubbing reads any level.
 */
export function VolumeProfile({
  levels = DEFAULT_LEVELS,
  step = 10,
  share = 0.7,
  symbol = "ETH",
  title = "Volume profile",
  className,
}: VolumeProfileProps) {
  const reduced = useReducedMotion()
  const svgRef = useRef<SVGSVGElement>(null)
  /* the bars wait until the profile is a third in view, then grow once */
  const play = useInView(svgRef, { once: true, amount: 0.3 }) || !!reduced
  const [hot, setHot] = useState<number | null>(null)

  /* lowest price first, so index 0 is the bottom row */
  const rows = [...levels].sort((a, b) => a.price - b.price)
  const n = rows.length
  const H = Math.max(1, n) * ROW
  const { total, poc, lo, hi, held } = valueArea(
    rows.map((r) => r.volume),
    share,
  )
  const top = Math.max(1e-6, rows[poc]?.volume ?? 0)
  const y = (i: number) => (n - 1 - i) * ROW

  const onMove = (e: React.PointerEvent) => {
    const el = svgRef.current
    if (!el || n === 0) return
    const r = el.getBoundingClientRect()
    const row = Math.floor(((e.clientY - r.top) / r.height) * n)
    setHot(n - 1 - Math.max(0, Math.min(n - 1, row)))
  }

  /* the axis names the three levels that matter and a quiet tick every fourth level */
  const named = new Map<number, string>([
    [hi, "value area high"],
    [lo, "value area low"],
    [poc, "point of control"],
  ])
  const pocPrice = rows[poc]?.price ?? 0
  const areaLow = rows[lo]?.price ?? 0
  const areaHigh = (rows[hi]?.price ?? 0) + step
  const shown = hot !== null ? rows[hot] : null

  return (
    <div role="group" aria-label={`${symbol} ${title.toLowerCase()}`} className={cn("w-[440px] max-w-full tabular-nums", className)}>
      {/* no visible title (2026-10-01): the axis names the point of control and the value area */}
      <div className="mb-3">
        <div role="status" className="text-[10.5px] text-foreground/45">
          {shown && hot !== null ? (
            <>
              <span className="font-medium text-foreground/90">
                {whole(shown.price)} to {whole(shown.price + step)}
              </span>{" "}
              · {whole(shown.volume)} {symbol} · {((shown.volume / (total || 1)) * 100).toFixed(1)}% of volume ·{" "}
              {hot === poc ? "point of control" : hot >= lo && hot <= hi ? "inside the value area" : "outside the value area"}
            </>
          ) : (
            <>
              Point of control <span className="font-medium text-foreground/90">{whole(pocPrice)}</span> · {((held / (total || 1)) * 100).toFixed(1)}% of volume between {whole(areaLow)} and{" "}
              {whole(areaHigh)}
            </>
          )}
        </div>
      </div>

      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto max-w-full cursor-crosshair touch-none"
        role="img"
        aria-label={`${symbol} ${title.toLowerCase()}, point of control ${whole(pocPrice)}, value area ${whole(areaLow)} to ${whole(areaHigh)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHot(null)}
      >
        {rows.map((r, i) => {
          const on = hot === i
          const inside = i >= lo && i <= hi
          const fill = on ? ACCENT : i === poc ? ink(92) : inside ? ink(60) : ink(22)
          return (
            <g key={r.price} style={{ opacity: hot !== null && !on ? 0.45 : 1, transition: "opacity 150ms" }}>
              <rect
                x={0}
                y={y(i) + 1}
                width={Math.max(1, (r.volume / top) * (BAR_W - 14))}
                height={BAR_H}
                rx={2}
                fill={fill}
                style={{
                  transformBox: "fill-box",
                  transformOrigin: "0% 50%",
                  transform: play ? "none" : "scaleX(0)",
                  transition: reduced ? "fill 150ms" : `fill 150ms, transform 450ms ${CSS_EASE} ${Math.min(0.36, (n - 1 - i) * 0.015).toFixed(3)}s`,
                }}
              />
            </g>
          )
        })}

        {/* the value area, as one thin filled bracket between the bars and the axis */}
        {n > 0 && <rect x={BAR_W - 8} y={y(hi) + 1} width={2} height={(hi - lo + 1) * ROW - 2} rx={1} fill={ink(35)} />}

        {rows.map((r, i) => {
          const name = named.get(i)
          const on = hot === i
          if (!name && !on && i % 4 !== 0) return null
          return (
            <text
              key={r.price}
              x={BAR_W + 2}
              y={y(i) + ROW / 2 + 3}
              fontSize={9}
              fontWeight={on || i === poc ? 600 : 400}
              fill="var(--foreground)"
              fillOpacity={on || i === poc ? 0.9 : name ? 0.45 : 0.35}
              className="tabular-nums"
            >
              {whole(r.price)}
              {name ? ` · ${name}` : ""}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
