"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { ChartCard } from "@/components/ui/chart-overlay"
import { parkBeside, squarify as squarifyBox } from "@/components/ui/market-heatmap-squarify"
import { cn } from "@/lib/utils"

/* Allocation Treemap, new through ssych-component (2026-09-29).
   What it is for: seeing how a book is split, where the area of a tile is the share of
   the book it holds.
   Read first: the largest tile, top left, the strongest ink.
   The pointer: pointing at a tile, or tabbing to it, turns it the accent, dims the rest
   and reads its share and its value in a card parked beside it (since 2026-10-02).
   Sketch: lab/AllocationTreemap. Kept from it: the holdings and their weights, the book,
   the squarified layout that measures its own box so tiles stay near square at any
   shape, the `height` prop for a plot band, the eased re-tiling when the weights change,
   and the readout (in the header until 2026-10-02, now in a card beside the tile).
   Rebuilt: the per-holding colour is dropped from the data (it was blue, green, amber and
   purple by position). Tiles are one ink at several strengths, strongest for the largest
   weight, and only the pointed tile takes var(--chart-1). The outlined, filled frame
   around the map and the text shadow are gone. Tiles are laid out largest first, which
   is what the squarifier needs to keep them near square.
   Formulas, all from `holdings` and `book`:
   · tile area = weight / sum of weights × area of the map
   · share     = weight / sum of weights × 100
   · value     = weight / sum of weights × book
   · strength  = the tile's rank by weight picks a step of STEPS, largest first
   Motion (2026-10-01): once the map first comes into view the tiles settle in largest first,
   a fade and 0.96 to full size, 40ms apart, done by about 700ms (it ran on mount, in 280ms).
   New weights or a new box re-tile in one 320ms glide, still by layout transforms. Reduced
   motion draws the end state and does not glide.
   2026-10-02 audit: the Treemap family now shares one look and one width with Market Heatmap,
   so the map is 460 wide in a 460 by 280 frame, tiles have a 6px corner with a 2px gap, and
   the squarifier is the family's shared one (market-heatmap-squarify). The readout line above
   the map, with its dot separators, is gone; the pointed tile reads in the shared ChartCard
   parked beside it (Share, Value), the same card the heatmap uses. The share printed on a
   tile is 10.5px at /60 and money is written with a capital K. */

const EASE = [0.16, 1, 0.3, 1] as const
const ACCENT = "var(--chart-1)"

export interface TreemapHolding {
  name: string
  /** any unit: weights are taken against their own sum */
  weight: number
}

export interface AllocationTreemapProps {
  holdings?: TreemapHolding[]
  /** dollars under management; a tile's value is its share of this */
  book?: number
  /** the map's name, read to assistive tech only */
  title?: string
  /** map height in px; left out, the map keeps the Treemap family's 460:280 frame (100:62 before 2026-10-02) */
  height?: number
  className?: string
}

const DEFAULT_BOOK = 128400

const DEFAULT_HOLDINGS: TreemapHolding[] = [
  { name: "AAPL", weight: 24.8 },
  { name: "MSFT", weight: 18.2 },
  { name: "NVDA", weight: 15.6 },
  { name: "AMZN", weight: 11.3 },
  { name: "GOOGL", weight: 9.1 },
  { name: "Other", weight: 8.4 },
  { name: "META", weight: 7.4 },
  { name: "TSLA", weight: 5.2 },
]

/** the ink of a tile by its rank, largest first; past the end tiles stay at the last step.
 *  Kept low so the name on the tile reads in the foreground in both themes. */
const STEPS = [32, 26, 21, 17, 14, 11, 9, 7]
const inkAt = (rank: number) => `color-mix(in srgb, var(--foreground) ${STEPS[Math.min(rank, STEPS.length - 1)]}%, transparent)`

/** the Treemap family's frame, the same as Market Heatmap's 460 × 280 */
const FRAME_W = 460
const FRAME_H = 280
const RATIO = FRAME_W / FRAME_H

/** tile geometry in percent of the box on both axes */
type Tile = TreemapHolding & { x: number; y: number; w: number; h: number; rank: number }

/** Squarified layout in a box `ratio` wide and 1 tall, so square means square on screen. */
function squarify(items: TreemapHolding[], ratio: number): Tile[] {
  return squarifyBox(items, (it) => it.weight, ratio, 1).map((t) => ({
    name: t.item.name,
    weight: t.item.weight,
    rank: t.rank,
    x: (t.x / ratio) * 100,
    y: t.y * 100,
    w: (t.w / ratio) * 100,
    h: t.h * 100,
  }))
}

/** the readout card: 132 wide, and its height from its fixed type (10px heading, two 11px rows) */
const CARD_W = 132
const CARD_H = 84

const usd = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(0)}`)

/**
 * Holdings as a treemap: the area of a tile is its share of the book, in one ink that is
 * strongest for the largest. Pointing at a tile turns it the accent and reads its share
 * and value in a card parked beside it.
 */
export function AllocationTreemap({ holdings = DEFAULT_HOLDINGS, book = DEFAULT_BOOK, title = "Allocation", height, className }: AllocationTreemapProps) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<string | null>(null)

  /* the box measures itself, so the layout is made for the shape the tiles land in */
  const boxRef = useRef<HTMLDivElement>(null)
  const seen = useInView(boxRef, { once: true, amount: 0.3 })
  const entered = seen || !!reduced
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(([e]) => {
      const { width, height: h } = e.contentRect
      if (width > 0 && h > 0) setBox((b) => (b && b.w === width && b.h === h ? b : { w: width, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ratio = box ? box.w / box.h : RATIO
  const tiles = useMemo(() => squarify(holdings, ratio), [holdings, ratio])
  const total = tiles.reduce((s, t) => s + t.weight, 0) || 1
  const shareOf = (t: Tile) => (t.weight / total) * 100
  const shown = tiles.find((t) => t.name === hot) ?? null
  const largest = tiles[0]
  /* the card parks clear of the pointed tile, in px of the measured box */
  const bw = box?.w ?? FRAME_W
  const bh = box?.h ?? (height ?? FRAME_H)
  const park = shown ? parkBeside({ x: (shown.x / 100) * bw, y: (shown.y / 100) * bh, w: (shown.w / 100) * bw, h: (shown.h / 100) * bh }, CARD_W, CARD_H, bw, bh) : null

  return (
    <div className={cn("w-[460px] max-w-full tabular-nums", className)}>
      <div
        ref={boxRef}
        role="group"
        aria-label={`${title}, ${tiles.length} positions in a ${usd(book)} book${largest ? `. Largest: ${largest.name} ${shareOf(largest).toFixed(1)}%` : ""}`}
        className="relative w-full"
        style={height ? { height } : { aspectRatio: `${FRAME_W} / ${FRAME_H}` }}
        onPointerLeave={() => setHot(null)}
      >
        {tiles.map((t) => {
          const on = hot === t.name
          const dim = hot !== null && !on
          /* the label prints only where two lines of type and the padding fit */
          const big = box ? (t.w / 100) * box.w > 54 && (t.h / 100) * box.h > 40 : t.w > 15 && t.h > 13
          return (
            <motion.button
              key={t.name}
              type="button"
              aria-label={`${t.name} ${shareOf(t).toFixed(1)}%, ${usd((t.weight / total) * book)}`}
              onPointerEnter={() => setHot(t.name)}
              onFocus={() => setHot(t.name)}
              onBlur={() => setHot(null)}
              className="absolute outline-none"
              /* a board that moves its weights re-tiles in one 320ms glide, done by layout
                 transforms (never a left, top, width or height tween); still when they are fixed */
              layout={!reduced}
              style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w}%`, height: `${t.h}%` }}
              initial={reduced ? false : { opacity: 0, scale: 0.96 }}
              animate={entered ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }}
              transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: t.rank * 0.04, layout: { duration: 0.32, ease: EASE } }}
            >
              <motion.span
                layout={!reduced}
                transition={{ layout: { duration: 0.32, ease: EASE } }}
                className="absolute inset-[1px] flex flex-col justify-end p-2 text-left"
                style={{
                  borderRadius: 6,
                  background: on ? ACCENT : inkAt(t.rank),
                  opacity: dim ? 0.4 : 1,
                  transition: reduced ? "none" : "background-color 160ms, opacity 160ms",
                }}
              >
                {big && (
                  <>
                    <span className="text-[11px] font-medium leading-none text-foreground/90">{t.name}</span>
                    <span className={cn("mt-1 text-[10.5px] leading-none", on ? "text-foreground/90" : "text-foreground/60")}>{shareOf(t).toFixed(1)}%</span>
                  </>
                )}
              </motion.span>
            </motion.button>
          )
        })}

        {/* the pointed tile reads here; ChartCard sits 12px right of x */}
        <ChartCard
          open={!!shown && !!park}
          x={(park?.left ?? 0) - 12}
          y={park?.top ?? 0}
          width={CARD_W}
          heading={shown ? <span className="font-medium text-foreground/90">{shown.name}</span> : null}
          rows={
            shown
              ? [
                  { label: "Share", value: `${shareOf(shown).toFixed(1)}%` },
                  { label: "Value", value: usd((shown.weight / total) * book) },
                ]
              : []
          }
        />
      </div>
    </div>
  )
}
