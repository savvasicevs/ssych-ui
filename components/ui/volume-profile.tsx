"use client"

import { useRef, useState } from "react"
import { useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { AxisTag, ChartCard } from "@/components/ui/chart-overlay"

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
   Restyle (user call, 2026-10-02: "more similar to the rest of the UI", the readout line
   above the bars removed): the library's chart language from Candlestick and Price
   Scrubber. Dollar figures on the right with solid faint gridlines; the value area's
   edges tagged VAH and VAL on the axis; the point of control a
   dashed rule across with an outlined tag. Pointing at a level lights its bar in the
   accent, dims the rest, draws a rule across, tags its price on the axis and lays a card
   over the chart (its range, volume, share and where it sits), which glides from row to
   row; the card leaves with a fade.
   Motion (2026-10-01): the bars grow out from the left once the profile is a third in view,
   top row first, 15ms apart (capped at 360ms) over 450ms, as CSS transitions; reduced motion
   shows them grown. No data changes here, so nothing else moves.
   2026-10-02: the outlined POC, VAH and VAL pills on the right looked out of place, so the
   three references are now plain axis text at 9px (spec 14.7): the point of control's price
   in medium at /90 with its name at /45 after it, the value area's edges wholly at /45. The
   outlined tag in the accent stays for the one pointed price only, on any row, and a
   reference next to it fades aside while it is there.
   2026-10-02 audit: the card's closing line was set in the accent, and the accent is never
   for text, so it now reads in ink at /60 (the point of control at /90). The value area's
   soft band was a 4% fill that vanished on white and on black; the bar strengths already
   mark the value area, so the band is gone.
   2026-10-02 round 2: his notes, it still did not feel like his. The bars are straight on
   the left, where they grow from the axis, and fully round on the right, and thinner (6px
   in a 12px row, they were 9). Styled after Market Heatmap and Price Scrubber: when a level
   carries its buy volume (the new optional `buy` on VolumeLevel, which the sample now has)
   its bar is a soft tint of the level's net side, up hue where buyers led and down hue where
   sellers did, stronger the more one side led, with no outline, like the heatmap's tiles;
   bars outside the value area step back to 55%. Without `buy` the bars keep the ink
   strengths. Pointing a level lays a soft wash across its whole row, rounded, which glides
   from row to row on transform only (180ms ease out), dims the other bars to 35% (the
   heatmap's dim) and tags its price on the axis in the bar's hue; the accent blue and the
   dashed rule across are gone. The card is parked clear of the pointed row, above it in the
   lower half and below it in the upper half, against the plot's right edge, so it never
   covers the level it reads; it adds the level's delta in its hue.
   Formulas, added:
   · delta            = buy − (volume − buy) = 2 × buy − volume
   · lead             = |delta| ÷ volume
   · bar tint         = the up hue (delta ≥ 0) or the down hue at 22 + min(lead ÷ 0.3, 1) × 48
                        percent, over nothing */

const CSS_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"
const UP = "var(--chart-up)"
const DOWN = "var(--chart-down)"
const INK = "var(--foreground)"
/** a hue as text: its lightness capped in light so small figures reach AA (Market Heatmap's
 *  rule; `--ink-l` is set on the root per theme) */
const textHue = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

export interface VolumeLevel {
  /** lower edge of the price bucket */
  price: number
  /** volume traded inside the bucket, in units of the asset */
  volume: number
  /** the part of `volume` that buyers initiated; when given, the bar is tinted by the net side */
  buy?: number
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
    const volume = Math.round((node + shelf + 0.08 + rnd() * 0.12) * 2400)
    /* buyers absorb the lows and sellers lean on the highs, with some noise level to level */
    const lean = Math.max(0.22, Math.min(0.78, 0.5 + ((12 - i) / 24) * 0.3 + Math.sin(i / 2.6) * 0.07 + (rnd() - 0.5) * 0.12))
    return { price: 2940 + i * 10, volume, buy: Math.round(volume * lean) }
  })
})()

const W = 440
const ROW = 12
/** the right-hand axis, wide enough for a reference like "$3,090 POC" */
const AXIS = 86
/** air between the longest bar and the axis */
const BAR_W = W - AXIS - 10
/** round 2: thinner bars, 6px in a 12px row */
const BAR_H = 6
const TOP = 6
const CARD_W = 168
/** the card's height from its fixed type: heading, three rows and the closing line */
const CARD_H = 124
/** the hover dim, the heatmap's */
const DIM = 0.35

/** a bar straight on the left (the axis it grows from) and fully round on the right */
const barPath = (x0: number, y0: number, len: number, h: number) => {
  const r = h / 2
  const l = Math.max(len, h)
  return `M${x0},${y0} H${x0 + l - r} A${r},${r} 0 0 1 ${x0 + l - r},${y0 + h} H${x0} Z`
}

/** the tint of a level's net side: the hue at 22 to 70 percent, stronger the more one side led */
const sideFill = (volume: number, buy: number) => {
  const delta = 2 * buy - volume
  const lead = volume ? Math.abs(delta) / volume : 0
  return `color-mix(in srgb, ${delta >= 0 ? UP : DOWN} ${Math.round(22 + Math.min(lead / 0.3, 1) * 48)}%, transparent)`
}

const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`
const whole = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 })
const usd = (v: number) => `$${whole(v)}`

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
 * Volume by price: one bar per price level, the point of control named, the value area at
 * full strength inside its band and the thin edges dimmer. Pointing at a level reads it in
 * a card over the chart.
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
  const H = TOP * 2 + Math.max(1, n) * ROW
  const { total, poc, lo, hi } = valueArea(
    rows.map((r) => r.volume),
    share,
  )
  const top = Math.max(1e-6, rows[poc]?.volume ?? 0)
  const y = (i: number) => TOP + (n - 1 - i) * ROW
  const mid = (i: number) => y(i) + ROW / 2
  const len = (v: number) => Math.max(2, (v / top) * BAR_W)

  const onMove = (e: React.PointerEvent) => {
    const el = svgRef.current
    if (!el || n === 0) return
    const r = el.getBoundingClientRect()
    const py = ((e.clientY - r.top) / r.height) * H
    const row = Math.floor((py - TOP) / ROW)
    setHot(n - 1 - Math.max(0, Math.min(n - 1, row)))
  }

  /* the axis: a figure every fourth level, and plain references for the three that matter */
  const tags = new Map<number, string>([
    [hi, "VAH"],
    [lo, "VAL"],
    [poc, "POC"],
  ])
  const shown = hot !== null ? rows[hot] : null
  const where = (i: number) => (i === poc ? "Point of control" : i >= lo && i <= hi ? "Inside the value area" : "Outside the value area")
  /* the card is parked clear of the pointed row, against the plot's right edge: above the row
     in the lower half, below it in the upper half, kept inside the chart */
  const cardX = BAR_W + 4 - CARD_W
  const cardY =
    hot !== null
      ? Math.max(0, Math.min(H - CARD_H, mid(hot) > H / 2 ? y(hot) - 6 - CARD_H : y(hot) + ROW + 6))
      : 0
  const shownDelta = shown?.buy != null ? 2 * shown.buy - shown.volume : null
  const shownHue = shownDelta == null ? INK : textHue(shownDelta >= 0 ? UP : DOWN)
  /* the wash keeps its last row while it fades out, so it never slides home on the way out */
  const lastHot = useRef(0)
  if (hot !== null) lastHot.current = hot

  return (
    <div role="group" aria-label={`${symbol} ${title.toLowerCase()}`} className={cn("w-[440px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}>
      <div className="relative">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto max-w-full cursor-crosshair touch-none"
          role="img"
          aria-label={`${symbol} ${title.toLowerCase()}, point of control ${usd(rows[poc]?.price ?? 0)}, value area ${usd(rows[lo]?.price ?? 0)} to ${usd((rows[hi]?.price ?? 0) + step)}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHot(null)}
        >
          {/* gridlines on every fourth level, the figures on the right */}
          {rows.map((r, i) =>
            /* a figure next to a reference steps aside for it */
            i % 4 === 0 && ![...tags.keys()].some((t) => Math.abs(mid(t) - mid(i)) < 16) ? (
              <g key={`g-${r.price}`}>
                <line x1={0} x2={BAR_W + 4} y1={mid(i)} y2={mid(i)} stroke="var(--foreground)" strokeOpacity={0.05} />
                <text
                  x={W - 4}
                  y={mid(i) + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill="var(--foreground)"
                  fillOpacity={0.45}
                  style={{ opacity: hot !== null && Math.abs(mid(i) - mid(hot)) < 11 ? 0 : 1, transition: "opacity 150ms" }}
                >
                  {usd(r.price)}
                </text>
              </g>
            ) : null,
          )}

          {/* the pointed row: a soft wash across the whole row, gliding row to row on transform only */}
          <rect
            x={0}
            y={0}
            width={BAR_W + 4}
            height={ROW}
            rx={ROW / 2}
            fill={INK}
            fillOpacity={0.06}
            pointerEvents="none"
            style={{
              opacity: hot !== null ? 1 : 0,
              transform: `translateY(${y(hot ?? lastHot.current)}px)`,
              transition: reduced ? "opacity 150ms" : `opacity 150ms, transform 180ms ${CSS_EASE}`,
            }}
          />

          {/* the point of control, a dashed rule across */}
          {n > 0 && <line x1={0} x2={BAR_W + 4} y1={mid(poc)} y2={mid(poc)} stroke="var(--foreground)" strokeOpacity={0.3} strokeDasharray="2 4" />}

          {rows.map((r, i) => {
            const on = hot === i
            const inside = i >= lo && i <= hi
            const sided = r.buy != null
            const fill = sided ? sideFill(r.volume, r.buy ?? 0) : on ? ink(92) : i === poc ? ink(92) : inside ? ink(55) : ink(20)
            const rest = sided && !inside ? 0.55 : 1
            return (
              <path
                key={r.price}
                d={barPath(0, mid(i) - BAR_H / 2, len(r.volume), BAR_H)}
                fill={fill}
                style={{
                  opacity: hot !== null && !on ? rest * DIM : on ? 1 : rest,
                  transformBox: "fill-box",
                  transformOrigin: "0% 50%",
                  transform: play ? "none" : "scaleX(0)",
                  transition: reduced
                    ? "fill 150ms, opacity 150ms"
                    : `fill 150ms, opacity 150ms, transform 450ms ${CSS_EASE} ${Math.min(0.36, (n - 1 - i) * 0.015).toFixed(3)}s`,
                }}
              />
            )
          })}

          {/* the references, plain text on the axis: POC's price at /90 with its name at /45,
              the value area's edges at /45; one fades aside while the pointed tag sits on it */}
          {[...tags].map(([i, name]) => {
            const r = rows[i]
            if (!r) return null
            const named = name === "POC"
            return (
              <text
                key={name}
                x={W - 4}
                y={mid(i) + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--foreground)"
                pointerEvents="none"
                style={{ opacity: hot !== null && Math.abs(mid(i) - mid(hot)) < 13 ? 0 : 1, transition: "opacity 150ms" }}
              >
                <tspan fontWeight={named ? 500 : 400} fillOpacity={named ? 0.9 : 0.45}>
                  {usd(r.price)}
                </tspan>
                <tspan fillOpacity={0.45}> {name}</tspan>
              </text>
            )
          })}

          {/* the pointed price tagged on the axis in the bar's hue, ink without sides (chart-overlay.tsx) */}
          {hot !== null && shown && (
            <AxisTag x={BAR_W + 14} y={mid(hot)} width={AXIS - 14} color={shownHue}>
              {usd(shown.price)}
            </AxisTag>
          )}
        </svg>

        {/* the level under the pointer, read out in a card over the chart (chart-overlay.tsx);
            it glides from row to row */}
        <ChartCard
          open={hot !== null && shown !== null}
          x={cardX - 12}
          y={cardY}
          width={CARD_W}
          heading={shown ? `${usd(shown.price)} to ${usd(shown.price + step)}` : ""}
          rows={
            shown
              ? [
                  { label: "Volume", value: `${whole(shown.volume)} ${symbol}` },
                  ...(shownDelta != null
                    ? [{ label: "Delta", value: `${shownDelta >= 0 ? "+" : "−"}${whole(Math.abs(shownDelta))} ${symbol}`, color: shownHue }]
                    : []),
                  { label: "Share", value: `${((shown.volume / (total || 1)) * 100).toFixed(1)}%` },
                ]
              : []
          }
          footer={
            hot !== null && (
              <span className={hot === poc ? "text-foreground/90" : "text-foreground/60"}>{where(hot)}</span>
            )
          }
        />
      </div>
    </div>
  )
}
