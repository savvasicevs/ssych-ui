"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-2)"
const RED = "var(--chart-down)"
const SANS = "inherit"
const SURFACE = "var(--card)"
const HAIRLINE = "var(--border)"
const TEXT = "var(--foreground)"
const TEXT_MUTED = "var(--muted-foreground)"

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
  /** heading above the map */
  title?: string
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

type Tile = { x: number; y: number; w: number; h: number; co: HeatmapCo }

function worst(row: number[], side: number, area: number) {
  const max = Math.max(...row)
  const min = Math.min(...row)
  const s2 = area * area
  const l2 = side * side
  return Math.max((l2 * max) / s2, s2 / (l2 * min))
}

/** squarified treemap — areas already scaled to fill w*h */
function squarify(cos: HeatmapCo[]): Tile[] {
  const total = cos.reduce((s, c) => s + c.cap, 0)
  const scale = (W * H) / total
  const items = cos.map((c) => ({ area: c.cap * scale, co: c }))
  const out: Tile[] = []
  let rx = 0
  let ry = 0
  let rw = W
  let rh = H
  let idx = 0
  while (idx < items.length) {
    const side = Math.min(rw, rh)
    const row = [items[idx].area]
    const rowCos = [items[idx].co]
    let rowArea = items[idx].area
    let k = idx + 1
    while (k < items.length) {
      const nxt = rowArea + items[k].area
      if (worst([...row, items[k].area], side, nxt) > worst(row, side, rowArea)) break
      row.push(items[k].area)
      rowCos.push(items[k].co)
      rowArea = nxt
      k++
    }
    if (rw >= rh) {
      const colW = rowArea / rh
      let cy = ry
      row.forEach((a, j) => {
        const th = a / colW
        out.push({ x: rx, y: cy, w: colW, h: th, co: rowCos[j] })
        cy += th
      })
      rx += colW
      rw -= colW
    } else {
      const rowH = rowArea / rw
      let cxx = rx
      row.forEach((a, j) => {
        const tw = a / rowH
        out.push({ x: cxx, y: ry, w: tw, h: rowH, co: rowCos[j] })
        cxx += tw
      })
      ry += rowH
      rh -= rowH
    }
    idx = k
  }
  return out
}

/** diverging: one hue per direction, magnitude as the mix percentage */
const tileFill = (chg: number) =>
  `color-mix(in srgb, ${chg >= 0 ? GREEN : RED} ${Math.round(Math.min(Math.abs(chg) / 3, 1) * 48 + 9)}%, var(--card))`

const TIP_W = 140
const TIP_GAP = 8

/* Park the readout clear of the tile it describes — the small tiles were being
   covered by their own tooltip. Try above, then below, then either side, and
   clamp to the box so nothing overflows. */
function place(t: Tile, h: number) {
  const cx = Math.max(0, Math.min(W - TIP_W, t.x + t.w / 2 - TIP_W / 2))
  const cy = Math.max(0, Math.min(H - h, t.y + t.h / 2 - h / 2))
  const above = t.y - TIP_GAP - h
  if (above >= 0) return { left: cx, top: above }
  const below = t.y + t.h + TIP_GAP
  if (below + h <= H) return { left: cx, top: below }
  const right = t.x + t.w + TIP_GAP
  if (right + TIP_W <= W) return { left: right, top: cy }
  const left = t.x - TIP_GAP - TIP_W
  if (left >= 0) return { left, top: cy }
  return { left: t.x < W / 2 ? W - TIP_W : 0, top: t.y < H / 2 ? H - h : 0 }
}

/**
 * The market as one block of ground: tiles sized by market cap and tinted on a
 * diverging scale by the day's move, so scale and direction read at once.
 * Hovering a tile lifts it out of the field and parks a read-out beside it with
 * price, change and cap; clicking pins that read-out in place.
 */
export function MarketHeatmap({ data = DEFAULT_DATA, title = "Market map · today", className }: MarketHeatmapProps) {
  const reduced = useReducedMotion()
  const [hover, setHover] = useState<string | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const hot = pin ?? hover
  const tiles = useMemo(() => squarify([...data].sort((a, b) => b.cap - a.cap)), [data])
  const hotTile = tiles.find((t) => t.co.sym === hot)

  /* the readout is a fixed block, but measure it so the above/below flip is
     decided on its real height at any type scale */
  const tipRef = useRef<HTMLDivElement>(null)
  const [tipH, setTipH] = useState(62)
  useLayoutEffect(() => {
    const el = tipRef.current
    if (el) setTipH(el.offsetHeight)
  }, [hot])
  const tip = hotTile ? place(hotTile, tipH) : null

  return (
    <div className={cn("w-[460px] max-w-full", className)} style={{ fontFamily: SANS }}>
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <span className="text-[13px] font-medium" style={{ color: TEXT }}>
          {title}
        </span>
        <span className="text-[10px]" style={{ color: TEXT_MUTED }}>
          sized by market cap
        </span>
      </div>

      <div className="relative">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block overflow-visible rounded-lg"
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`${title}, ${tiles.length} companies sized by market cap`}
        >
          {tiles.map((t, i) => {
            const on = hot === t.co.sym
            const pinned = pin === t.co.sym
            const dim = hot !== null && !on
            const big = t.w > 52 && t.h > 30
            return (
              <motion.g
                key={t.co.sym}
                onMouseEnter={() => {
                  if (!pin) setHover(t.co.sym)
                }}
                onClick={() => setPin((p) => (p === t.co.sym ? null : t.co.sym))}
                style={{ cursor: "pointer" }}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: dim ? 0.5 : 1 }}
                transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: i * 0.02 }}
              >
                <rect
                  x={t.x + 0.5}
                  y={t.y + 0.5}
                  width={Math.max(0, t.w - 1)}
                  height={Math.max(0, t.h - 1)}
                  rx={2}
                  fill={tileFill(t.co.chg)}
                  stroke={on ? (t.co.chg >= 0 ? GREEN : RED) : "color-mix(in srgb, var(--foreground) 6%, transparent)"}
                  strokeWidth={pinned ? 2 : on ? 1.5 : 1}
                  strokeDasharray={pinned ? "3 2" : undefined}
                />
                {big && (
                  <>
                    <text x={t.x + 6} y={t.y + 16} fontSize={11} fontWeight={700} fill={TEXT}>
                      {t.co.sym}
                    </text>
                    <text
                      x={t.x + 6}
                      y={t.y + 28}
                      fontSize={9}
                      fontWeight={600}
                      fill={t.co.chg >= 0 ? GREEN : RED}
                      className="tabular-nums"
                    >
                      {t.co.chg >= 0 ? "+" : "−"}
                      {Math.abs(t.co.chg).toFixed(1)}%
                    </text>
                  </>
                )}
                {!big && t.w > 26 && (
                  <text
                    x={t.x + t.w / 2}
                    y={t.y + t.h / 2 + 3}
                    textAnchor="middle"
                    fontSize={8.5}
                    fontWeight={600}
                    fill="var(--color-foreground)" fillOpacity={0.7}
                  >
                    {t.co.sym}
                  </text>
                )}
              </motion.g>
            )
          })}
        </svg>

        {/* never over the tile it describes, never outside the box */}
        {hotTile && tip && (
          <div
            ref={tipRef}
            className="pointer-events-none absolute z-10 rounded-lg border px-2.5 py-1.5"
            role="status"
            style={{
              background: SURFACE,
              borderColor: HAIRLINE,
              width: `${TIP_W}px`,
              left: `${tip.left}px`,
              top: `${tip.top}px`,
            }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold" style={{ color: TEXT }}>
                {hotTile.co.sym}
              </span>
              <span
                className="text-[11px] font-semibold tabular-nums"
                style={{ color: hotTile.co.chg >= 0 ? GREEN : RED }}
              >
                {hotTile.co.chg >= 0 ? "+" : "−"}
                {Math.abs(hotTile.co.chg).toFixed(2)}%
              </span>
            </div>
            <div className="mt-0.5 text-[9.5px]" style={{ color: TEXT_MUTED }}>
              {hotTile.co.name}
            </div>
            <div className="mt-1 flex justify-between text-[9.5px] tabular-nums" style={{ color: TEXT_MUTED }}>
              <span>${hotTile.co.price.toFixed(2)}</span>
              <span>${hotTile.co.cap.toFixed(2)}T</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
