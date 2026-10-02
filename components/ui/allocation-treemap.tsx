"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Allocation Treemap, new through ssych-component (2026-09-29).
   What it is for: seeing how a book is split, where the area of a tile is the share of
   the book it holds.
   Read first: the largest tile, top left, the strongest ink.
   The pointer: pointing at a tile, or tabbing to it, turns it the accent, dims the rest
   and reads its weight and its value in the line above the map.
   Sketch: lab/AllocationTreemap. Kept from it: the holdings and their weights, the book,
   the squarified layout that measures its own box so tiles stay near square at any
   shape, the `height` prop for a plot band, the eased re-tiling when the weights change,
   and the readout in the header.
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
   motion draws the end state and does not glide. */

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
  /** map height in px; left out, the map keeps a 100:62 frame */
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

const RATIO = 100 / 62

/** tile geometry in percent of the box on both axes */
type Tile = TreemapHolding & { x: number; y: number; w: number; h: number; rank: number }

/** Squarified layout in a box `ratio` wide and 1 tall, so square means square on screen. */
function squarify(items: TreemapHolding[], ratio: number): Tile[] {
  const sorted = [...items].filter((it) => it.weight > 0).sort((a, b) => b.weight - a.weight)
  const total = sorted.reduce((s, it) => s + it.weight, 0) || 1
  const queue = sorted.map((it, rank) => ({ ...it, rank, area: (it.weight / total) * ratio }))
  const sum = (row: { area: number }[]) => row.reduce((s, r) => s + r.area, 0)
  const worst = (row: { area: number }[], side: number) => {
    const s = sum(row)
    const areas = row.map((r) => r.area)
    return Math.max((side * side * Math.max(...areas)) / (s * s), (s * s) / (side * side * Math.min(...areas)))
  }

  const out: Tile[] = []
  let box = { x: 0, y: 0, w: ratio, h: 1 }
  let i = 0
  while (i < queue.length) {
    const side = Math.min(box.w, box.h)
    const row = [queue[i]]
    let k = i + 1
    while (k < queue.length && worst([...row, queue[k]], side) <= worst(row, side)) {
      row.push(queue[k])
      k += 1
    }
    const depth = sum(row) / side
    let run = 0
    for (const r of row) {
      const len = r.area / depth
      const tile = box.w >= box.h ? { x: box.x, y: box.y + run, w: depth, h: len } : { x: box.x + run, y: box.y, w: len, h: depth }
      out.push({ name: r.name, weight: r.weight, rank: r.rank, x: (tile.x / ratio) * 100, y: tile.y * 100, w: (tile.w / ratio) * 100, h: tile.h * 100 })
      run += len
    }
    box = box.w >= box.h ? { x: box.x + depth, y: box.y, w: box.w - depth, h: box.h } : { x: box.x, y: box.y + depth, w: box.w, h: box.h - depth }
    i = k
  }
  return out
}

const usd = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`)

/**
 * Holdings as a treemap: the area of a tile is its share of the book, in one ink that is
 * strongest for the largest. Pointing at a tile turns it the accent and reads its weight
 * and value above the map.
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

  return (
    <div className={cn("w-full max-w-[480px] tabular-nums", className)}>
      <div className="mb-2.5 flex items-baseline gap-4">
        <span role="status" className="text-[10.5px] text-foreground/45">
          {/* the readout swaps in place: 4px and a 2px blur, 150ms */}
          <motion.span
            key={hot ?? ""}
            className="inline-block"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
          {shown ? (
            <>
              <span className="font-medium text-foreground/90">{shown.name}</span> · {shareOf(shown).toFixed(1)}% · <span className="font-medium text-foreground/90">{usd((shown.weight / total) * book)}</span>
            </>
          ) : (
            `${tiles.length} positions · ${usd(book)} book`
          )}
          </motion.span>
        </span>
      </div>

      <div
        ref={boxRef}
        role="group"
        aria-label={`${title}, ${tiles.length} positions in a ${usd(book)} book${largest ? `. Largest: ${largest.name} ${shareOf(largest).toFixed(1)}%` : ""}`}
        className="relative w-full"
        style={height ? { height } : { aspectRatio: "100 / 62" }}
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
                  borderRadius: 3,
                  background: on ? ACCENT : inkAt(t.rank),
                  opacity: dim ? 0.4 : 1,
                  transition: reduced ? "none" : "background-color 160ms, opacity 160ms",
                }}
              >
                {big && (
                  <>
                    <span className="text-[11px] font-semibold leading-none text-foreground/90">{t.name}</span>
                    <span className={cn("mt-1 text-[9.5px] leading-none", on ? "text-foreground/90" : "text-foreground/45")}>{shareOf(t).toFixed(1)}%</span>
                  </>
                )}
              </motion.span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
