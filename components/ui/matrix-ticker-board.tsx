"use client"

import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const TAU = Math.PI * 2

/** the visual-regression runner freezes the board fully lit */
const isSnapshot = () => typeof navigator !== "undefined" && /\bChromatic\b/.test(navigator.userAgent)

/* ── 5×7 dot font — hand-authored; rows top→bottom, '#' = lit ─────────────── */
const RAW: Record<string, string> = {
  A: ".###. #...# #...# ##### #...# #...# #...#",
  B: "####. #...# #...# ####. #...# #...# ####.",
  C: ".###. #...# #.... #.... #.... #...# .###.",
  D: "####. #...# #...# #...# #...# #...# ####.",
  E: "##### #.... #.... ####. #.... #.... #####",
  F: "##### #.... #.... ####. #.... #.... #....",
  G: ".###. #...# #.... #.### #...# #...# .###.",
  H: "#...# #...# #...# ##### #...# #...# #...#",
  I: ".###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.",
  J: "..### ...#. ...#. ...#. ...#. #..#. .##..",
  K: "#...# #..#. #.#.. ##... #.#.. #..#. #...#",
  L: "#.... #.... #.... #.... #.... #.... #####",
  M: "#...# ##.## #.#.# #.#.# #...# #...# #...#",
  N: "#...# ##..# #.#.# #..## #...# #...# #...#",
  O: ".###. #...# #...# #...# #...# #...# .###.",
  P: "####. #...# #...# ####. #.... #.... #....",
  Q: ".###. #...# #...# #...# #.#.# #..#. .##.#",
  R: "####. #...# #...# ####. #.#.. #..#. #...#",
  S: ".#### #.... #.... .###. ....# ....# ####.",
  T: "##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
  U: "#...# #...# #...# #...# #...# #...# .###.",
  V: "#...# #...# #...# #...# #...# .#.#. ..#..",
  W: "#...# #...# #...# #.#.# #.#.# ##.## #...#",
  X: "#...# #...# .#.#. ..#.. .#.#. #...# #...#",
  Y: "#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..",
  Z: "##### ....# ...#. ..#.. .#... #.... #####",
  "0": ".###. #...# #..## #.#.# ##..# #...# .###.",
  "1": "..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.",
  "2": ".###. #...# ....# ...#. ..#.. .#... #####",
  "3": ".###. #...# ....# ..##. ....# #...# .###.",
  "4": "...#. ..##. .#.#. #..#. ##### ...#. ...#.",
  "5": "##### #.... ####. ....# ....# #...# .###.",
  "6": ".###. #.... #.... ####. #...# #...# .###.",
  "7": "##### ....# ...#. ..#.. .#... .#... .#...",
  "8": ".###. #...# #...# .###. #...# #...# .###.",
  "9": ".###. #...# #...# .#### ....# ....# .###.",
  $: "..#.. .#### #.#.. .###. ..#.# ####. ..#..",
  ".": "..... ..... ..... ..... ..... .##.. .##..",
  ",": "..... ..... ..... ..... ..##. ..#.. .#...",
  "%": "##..# ##..# ...#. ..#.. .#... #..## #..##",
  "+": "..... ..#.. ..#.. ##### ..#.. ..#.. .....",
  "-": "..... ..... ..... ##### ..... ..... .....",
  " ": "..... ..... ..... ..... ..... ..... .....",
}
/** glyph → 7 bitmask rows (bit gx set = dot lit) */
const GLYPHS: Record<string, number[]> = {}
for (const [ch, s] of Object.entries(RAW)) {
  GLYPHS[ch] = s.split(" ").map((row) => {
    let bits = 0
    for (let i = 0; i < 5; i++) if (row[i] === "#") bits |= 1 << i
    return bits
  })
}

type Tone = "text" | "up" | "down"
type Cell = { ch: string; tone: Tone }
export type TickerRow = { symbol: string; price: string; change: string; up: boolean }

/** fixed-width layout: symbol(5) price(7) gap change(6) = 19 cells */
function cellsFor(r: TickerRow): Cell[] {
  const out: Cell[] = []
  const push = (s: string, tone: Tone) => {
    for (const ch of s) out.push({ ch, tone })
  }
  push(r.symbol.toUpperCase().padEnd(5).slice(0, 5), "text")
  push(r.price.padStart(7).slice(-7), "text")
  push(" ", "text")
  push(r.change.padStart(6).slice(-6), r.up ? "up" : "down")
  return out
}

/* ── deterministic demo sequence — which row updates, and by how much ─────── */
const SEQ_ROWS = [0, 2, 1, 3, 0, 3, 2, 1]
const SEQ_DELTAS = [0.18, -0.32, 0.44, -0.12, 0.27, -0.41, 0.09, 0.36]

/** quote for base row at sequence step t — always derived from the ORIGINAL base
 *  (no drift), so the feed loops through a fixed set of states */
function quoteAt(base: TickerRow, t: number): TickerRow {
  const d = SEQ_DELTAS[t % SEQ_DELTAS.length]
  const p = parseFloat(base.price.replace(/,/g, ""))
  const dec = (base.price.split(".")[1] ?? "").length
  const c = parseFloat(base.change) + d
  return {
    symbol: base.symbol,
    price: Number.isFinite(p) ? (p * (1 + d / 100)).toFixed(dec) : base.price,
    change: `${c >= 0 ? "+" : "-"}${Math.abs(c).toFixed(1)}%`,
    up: c >= 0,
  }
}

/** deterministic spatial hash → [0,1) — per-dot stagger for dissolve/bloom */
function hash01(x: number, y: number) {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  return (((h ^ (h >>> 15)) >>> 0) % 1024) / 1024
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const DEFAULT_ROWS: TickerRow[] = [
  { symbol: "TSLA", price: "178.52", change: "+2.4%", up: true },
  { symbol: "NVDA", price: "921.30", change: "+1.1%", up: true },
  { symbol: "AAPL", price: "226.14", change: "-0.6%", up: false },
  { symbol: "AMZN", price: "187.09", change: "-1.3%", up: false },
]

export interface MatrixTickerBoardProps {
  /** ticker feed; price/change are preformatted strings, `up` picks green/red */
  rows?: TickerRow[]
  /** scroll rows horizontally like a wall board (whole-dot steps) */
  marquee?: boolean
  /** lit dot diameter in CSS px (gap derives as ~⅔ of it) */
  dotSize?: number
  /** the board fills its box; the default box is 600×180 */
  className?: string
}

/**
 * A retro dot-matrix price wall on a real canvas. Every character is
 * rasterized through a hand-authored 5×7 dot font onto a grid of ~3px circular
 * cells, the unlit cells sitting at 7% ink so the matrix reads as hardware.
 * Every ~2.5s one row's quote advances through a deterministic sequence: only
 * the characters that differ dissolve out dot by dot, staggered by a spatial
 * hash, and the new characters bloom back in the same way, the split-flap
 * feel without the flaps. Colours are read from the theme variables at draw
 * time, so the board recolours live on a theme switch. HiDPI canvas, a
 * ResizeObserver refit, the unlit grid cached offscreen, and it paints only
 * while something moves. Fully lit and still under reduced motion.
 */
export function MatrixTickerBoard({ rows = DEFAULT_ROWS, marquee = false, dotSize = 3, className }: MatrixTickerBoardProps) {
  const reduced = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const still = isSnapshot() || !!reduced

    type RowState = { prev: Cell[]; cur: Cell[]; start: number }
    const state: RowState[] = rows.map((r) => ({ prev: cellsFor(r), cur: cellsFor(r), start: -1 }))
    let tick = 0
    wrap.dataset.seq = "0"

    const gap = Math.max(1, Math.round(dotSize * 0.66))
    const pitch = dotSize + gap
    const dotR = dotSize / 2 + 0.25

    // unlit-grid cache — thousands of idle dots render once per size/theme
    const gridCanvas = document.createElement("canvas")
    let gridKey = ""
    let colorKey = ""
    let dirty = true
    let raf = 0

    function draw(now: number, fg: string, upC: string, downC: string) {
      const dpr = window.devicePixelRatio || 1
      const w = wrap!.clientWidth
      const h = wrap!.clientHeight
      if (!w || !h) return
      const pw = Math.round(w * dpr)
      const ph = Math.round(h * dpr)
      if (canvas!.width !== pw || canvas!.height !== ph) {
        canvas!.width = pw
        canvas!.height = ph
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.clearRect(0, 0, w, h)

      const cols = Math.floor(w / pitch)
      const rowsG = Math.floor(h / pitch)
      if (cols < 8 || rowsG < 7) return
      const offX = (w - cols * pitch) / 2 + pitch / 2
      const offY = (h - rowsG * pitch) / 2 + pitch / 2

      const gKey = `${pw}|${ph}|${fg}`
      if (gKey !== gridKey) {
        gridKey = gKey
        gridCanvas.width = pw
        gridCanvas.height = ph
        const g = gridCanvas.getContext("2d")
        if (g) {
          g.setTransform(dpr, 0, 0, dpr, 0, 0)
          g.fillStyle = fg
          g.globalAlpha = 0.07
          for (let gy = 0; gy < rowsG; gy++)
            for (let gx = 0; gx < cols; gx++) {
              g.beginPath()
              g.arc(offX + gx * pitch, offY + gy * pitch, dotSize / 2, 0, TAU)
              g.fill()
            }
        }
      }
      ctx!.drawImage(gridCanvas, 0, 0, w, h)

      // vertical distribution — rows spread evenly across the grid
      const n = state.length
      const vMargin = 1
      const usable = Math.max(7, rowsG - vMargin * 2)
      const stepR = n > 1 ? (usable - 7) / (n - 1) : 0
      const rowTop = (i: number) => vMargin + Math.round(i * stepR)

      const textCols = (state[0]?.cur.length ?? 0) * 6
      const hMargin = Math.max(1, Math.floor((cols - textCols) / 2))
      const loopCols = textCols + 12
      const mq = marquee && !still ? Math.floor(now / 110) % loopCols : 0
      const toneColor = (tone: Tone) => (tone === "up" ? upC : tone === "down" ? downC : fg)

      for (let ri = 0; ri < n; ri++) {
        const s = state[ri]
        const top = rowTop(ri)
        const t = s.start >= 0 ? now - s.start : Infinity
        for (let ci = 0; ci < s.cur.length; ci++) {
          const cell = s.cur[ci]
          const prev = s.prev[ci]
          const changing = !still && t < 620 && prev !== undefined && (prev.ch !== cell.ch || prev.tone !== cell.tone)

          // char origin column(s) — marquee wraps the text loop across the board
          const origin = hMargin + ci * 6
          const starts: number[] = []
          if (marquee && !still) {
            const c0 = ((((origin - mq) % loopCols) + loopCols) % loopCols) - loopCols
            for (let cx = c0; cx < cols; cx += loopCols) if (cx + 4 >= 0) starts.push(cx)
          } else starts.push(origin)

          const paint = (g: Cell, mode: "full" | "out" | "in", c0: number) => {
            const glyph = GLYPHS[g.ch.toUpperCase()] ?? GLYPHS[" "]
            ctx!.fillStyle = toneColor(g.tone)
            for (let gy = 0; gy < 7; gy++) {
              const bits = glyph[gy]
              if (!bits) continue
              const rowG = top + gy
              if (rowG < 0 || rowG >= rowsG) continue
              for (let gx = 0; gx < 5; gx++) {
                if (!(bits & (1 << gx))) continue
                const col = c0 + gx
                if (col < 0 || col >= cols) continue
                let a = 1
                if (mode !== "full") {
                  const st = hash01(ci * 5 + gx, ri * 7 + gy)
                  a = mode === "out" ? 1 - clamp01((t - st * 150) / 150) : clamp01((t - 300 - st * 150) / 150)
                  if (a <= 0.02) continue
                }
                const x = offX + col * pitch
                const y = offY + rowG * pitch
                ctx!.globalAlpha = a * 0.3 // soft glow halo
                ctx!.beginPath()
                ctx!.arc(x, y, dotR * 1.8, 0, TAU)
                ctx!.fill()
                ctx!.globalAlpha = a
                ctx!.beginPath()
                ctx!.arc(x, y, dotR, 0, TAU)
                ctx!.fill()
              }
            }
          }

          for (const c0 of starts) {
            if (still || !changing) paint(cell, "full", c0)
            else {
              if (prev) paint(prev, "out", c0)
              paint(cell, "in", c0)
            }
          }
        }
      }
      ctx!.globalAlpha = 1
      dirty = false
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const cs = getComputedStyle(wrap!)
      const fg = cs.getPropertyValue("--foreground").trim() || "#ffffff"
      const upC = cs.getPropertyValue("--chart-up").trim() || "#34c28a"
      const downC = cs.getPropertyValue("--chart-down").trim() || "#e06a6a"
      const key = fg + upC + downC
      if (key !== colorKey) {
        colorKey = key
        dirty = true
      }
      let animating = false
      for (const s of state) {
        if (s.start < 0) continue
        if (now - s.start > 620) {
          s.start = -1
          s.prev = s.cur
          dirty = true
        } else animating = true
      }
      if (dirty || animating || (marquee && !still)) draw(now, fg, upC, downC)
    }
    raf = requestAnimationFrame(loop)

    let iv = 0
    if (!still)
      iv = window.setInterval(() => {
        tick++
        const which = SEQ_ROWS[tick % SEQ_ROWS.length] % state.length
        const s = state[which]
        s.prev = s.cur
        s.cur = cellsFor(quoteAt(rows[which], tick))
        s.start = performance.now()
        wrap.dataset.seq = String(tick)
      }, 2500)

    const ro = new ResizeObserver(() => {
      dirty = true
    })
    ro.observe(wrap)

    return () => {
      cancelAnimationFrame(raf)
      if (iv) clearInterval(iv)
      ro.disconnect()
    }
  }, [rows, marquee, dotSize, reduced])

  return (
    <div
      ref={wrapRef}
      className={cn("relative h-[180px] w-full max-w-[600px]", className)}
      role="img"
      aria-label={rows.map((r) => `${r.symbol} ${r.price} ${r.change}`).join(", ")}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
