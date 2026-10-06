"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { ChartCard } from "@/components/ui/chart-overlay"
import { parkBeside, squarify } from "@/components/ui/market-heatmap-squarify"
import { cn } from "@/lib/utils"

/* Market Heatmap: the market as one block of ground, tiles sized by market cap and tinted
   on a diverging scale by the day's move, so scale and direction read at once.
   Formulas, all from `data`:
   · tile area   = cap / sum of caps × 460 × 280 (squarified, largest first)
   · tile fill   = the up or down hue at min(|chg| / 3, 1) × 48 + 9 percent, over nothing
   · card Price  = price, 2dp · Change = chg, 2dp, signed · Cap = cap in trillions, 2dp
   2026-10-02 audit: his call was more roundness and colours that fit the rest, so tiles are
   fills only with a 6px corner and a 2px gap (no outline, no rounded frame round the map),
   up is var(--chart-up) instead of the teal, text sits on the foreground ladder and tickers
   are weight 500. The title and its explainer line are gone from view (the title prop now
   names the map in the aria-label only, with the sizing note). The pointed tile reads in the
   shared ChartCard, parked clear of the tile as before. Each tile is a real button, so focus
   reads like hover and a press pins the card; Escape lets it go. The entrance stagger runs on
   the entrance only; the hover dim answers in 150ms with no delay. The squarifier is the one
   the Treemap family shares (market-heatmap-squarify). */

const EASE = [0.16, 1, 0.3, 1] as const
const UP = "var(--chart-up)"
const DOWN = "var(--chart-down)"

/** A hue as text: in the light theme its lightness is capped so small figures reach AA
 *  while the chroma stays; in dark it is native (`--ink-l` flips per theme on the root). */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

export interface HeatmapCo {
  sym: string
  name: string
  /** market cap in trillions — drives tile area */
  cap: number
  /** percent change on the day — drives tile hue */
  chg: number
  price: number
}

export interface MarketHeatmapProps {
  /** one tile per company, any length; areas rescale to fill the box */
  data?: HeatmapCo[]
  /** the map's name; since 2026-10-02 read to assistive tech only (no visible title) */
  title?: string
  /** the map's height in px (2026-10-06); left out it follows the width, 280 at the default 460 */
  height?: number
  /** what the tile size measures, read in the card ("Cap" left out) */
  sizeLabel?: string
  /** how that size is written in the card (trillions of dollars left out) */
  formatSize?: (v: number) => string
  className?: string
}

const DEFAULT_DATA: HeatmapCo[] = [
  { sym: "AAPL", name: "Apple", cap: 3.4, chg: 0.8, price: 228.5 },
  { sym: "MSFT", name: "Microsoft", cap: 3.1, chg: 1.2, price: 441.2 },
  { sym: "NVDA", name: "NVIDIA", cap: 2.9, chg: 3.1, price: 179.8 },
  { sym: "GOOGL", name: "Alphabet", cap: 2.1, chg: -0.6, price: 182.4 },
  { sym: "AMZN", name: "Amazon", cap: 1.9, chg: 1.5, price: 201.3 },
  { sym: "META", name: "Meta", cap: 1.3, chg: -1.2, price: 512.7 },
  { sym: "AVGO", name: "Broadcom", cap: 0.8, chg: 2.2, price: 168.1 },
  { sym: "TSLA", name: "Tesla", cap: 0.78, chg: -2.4, price: 244.9 },
  { sym: "JPM", name: "JPMorgan", cap: 0.62, chg: 0.3, price: 214.6 },
  { sym: "V", name: "Visa", cap: 0.55, chg: 0.1, price: 289.0 },
  { sym: "WMT", name: "Walmart", cap: 0.5, chg: -0.4, price: 69.4 },
  { sym: "XOM", name: "Exxon", cap: 0.48, chg: -1.1, price: 118.2 },
  { sym: "UNH", name: "UnitedHealth", cap: 0.45, chg: 0.9, price: 528.3 },
  { sym: "MA", name: "Mastercard", cap: 0.42, chg: 0.2, price: 471.5 },
  { sym: "HD", name: "Home Depot", cap: 0.38, chg: -0.7, price: 361.8 },
  { sym: "PG", name: "P&G", cap: 0.35, chg: 0.5, price: 167.9 },
]

const W = 460
const H = 280
/** half the 2px gap: every tile gives up 1px on each side */
const INSET = 1
const RADIUS = 6

type Tile = { x: number; y: number; w: number; h: number; co: HeatmapCo }

/** diverging: one hue per direction, magnitude as the mix percentage */
const tileFill = (chg: number) =>
  `color-mix(in srgb, ${chg >= 0 ? UP : DOWN} ${Math.round(Math.min(Math.abs(chg) / 3, 1) * 48 + 9)}%, transparent)`

const signedPct = (v: number, dp: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`

/** the ChartCard's size: 148 wide (its default), and its height from its fixed type
 *  (10px heading, three 11px rows, 10px padding top and bottom) */
const TIP_W = 148
const TIP_H = 102

/**
 * The market as one block of ground: tiles sized by market cap and tinted on a
 * diverging scale by the day's move, so scale and direction read at once.
 * Pointing at a tile (or tabbing to it) dims the rest and parks a card beside it
 * with price, change and cap; pressing pins that card in place.
 */
export function MarketHeatmap({
  data = DEFAULT_DATA,
  title = "Market map, today",
  height,
  sizeLabel = "Cap",
  formatSize = (v: number) => `$${v.toFixed(2)}T`,
  className,
}: MarketHeatmapProps) {
  const reduced = useReducedMotion()
  const [hover, setHover] = useState<string | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const hot = pin ?? hover
  /* laid out at the width it is given (2026-10-06): the tiles fill the box and the text keeps
     its size. At the default class that is 460 × 280, as before */
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: W, h: height ?? H })
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width) || W
      setBox({ w, h: height ?? Math.round(Math.min(440, Math.max(H, w * 0.5))) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [height])
  const tiles = useMemo<Tile[]>(
    () => squarify(data, (c) => c.cap, box.w, box.h).map((t) => ({ x: t.x, y: t.y, w: t.w, h: t.h, co: t.item })),
    [data, box.w, box.h],
  )
  const hotTile = tiles.find((t) => t.co.sym === hot)
  /* parked clear of the tile it reads: above, below, right, left, then the far corner */
  const tip = hotTile ? parkBeside(hotTile, TIP_W, TIP_H, box.w, box.h) : null

  return (
    <div ref={boxRef} className={cn("w-[460px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}>
      <div className="relative" style={{ width: box.w, height: box.h }} onPointerLeave={() => setHover(null)}>
        <svg width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} className="block" role="img" aria-label={`${title}: ${tiles.length} companies sized by market cap, tinted by the day's move`}>
          {tiles.map((t, i) => {
            const on = hot === t.co.sym
            const dim = hot !== null && !on
            const big = t.w > 52 && t.h > 30
            const w = Math.max(0, t.w - INSET * 2)
            const h = Math.max(0, t.h - INSET * 2)
            const hue = t.co.chg >= 0 ? UP : DOWN
            return (
              /* the outer group runs the entrance once; the inner one owns the dim, so a hover never waits on a stagger */
              <motion.g
                key={t.co.sym}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: i * 0.02 }}
              >
                <g style={{ opacity: dim ? 0.35 : 1, transition: reduced ? "none" : "opacity 150ms" }}>
                  <rect x={t.x + INSET} y={t.y + INSET} width={w} height={h} rx={Math.min(RADIUS, w / 2, h / 2)} fill={tileFill(t.co.chg)} />
                  {big && (
                    <>
                      <text x={t.x + 8} y={t.y + 18} fontSize={11} fontWeight={500} fill="var(--foreground)" fillOpacity={0.9}>
                        {t.co.sym}
                      </text>
                      <text x={t.x + 8} y={t.y + 30} fontSize={9.5} fontWeight={500} fill={ink(hue)}>
                        {signedPct(t.co.chg, 1)}
                      </text>
                    </>
                  )}
                  {!big && t.w > 26 && (
                    <text x={t.x + t.w / 2} y={t.y + t.h / 2 + 3} textAnchor="middle" fontSize={8.5} fontWeight={500} fill="var(--foreground)" fillOpacity={0.7}>
                      {t.co.sym}
                    </text>
                  )}
                </g>
              </motion.g>
            )
          })}
        </svg>

        {/* one real button per tile over the drawing: the pointer, focus and touch all read the
            same tile, a press pins its card and Escape lets it go */}
        {tiles.map((t) => (
          <button
            key={t.co.sym}
            type="button"
            aria-label={`${t.co.sym} ${t.co.name}, $${t.co.price.toFixed(2)}, ${signedPct(t.co.chg, 2)}, cap $${t.co.cap.toFixed(2)}T`}
            aria-pressed={pin === t.co.sym}
            onPointerEnter={() => {
              if (!pin) setHover(t.co.sym)
            }}
            onFocus={() => {
              if (!pin) setHover(t.co.sym)
            }}
            onBlur={() => setHover(null)}
            onClick={() => setPin((p) => (p === t.co.sym ? null : t.co.sym))}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPin(null)
            }}
            className="absolute cursor-pointer outline-none"
            style={{ left: t.x + INSET, top: t.y + INSET, width: Math.max(0, t.w - INSET * 2), height: Math.max(0, t.h - INSET * 2), borderRadius: RADIUS }}
          />
        ))}

        {/* never over the tile it describes, never outside the box; ChartCard sits 12px right of x */}
        <ChartCard
          open={!!hotTile && !!tip}
          x={(tip?.left ?? 0) - 12}
          y={tip?.top ?? 0}
          width={TIP_W}
          heading={
            hotTile ? (
              <>
                <span className="font-medium text-foreground/90">{hotTile.co.sym}</span> {hotTile.co.name}
              </>
            ) : null
          }
          rows={
            hotTile
              ? [
                  { label: "Price", value: `$${hotTile.co.price.toFixed(2)}` },
                  { label: "Change", value: signedPct(hotTile.co.chg, 2), color: ink(hotTile.co.chg >= 0 ? UP : DOWN) },
                  { label: sizeLabel, value: formatSize(hotTile.co.cap) },
                ]
              : []
          }
        />
      </div>
    </div>
  )
}
