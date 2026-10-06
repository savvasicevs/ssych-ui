"use client"

import { useEffect, useRef } from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { usePointed } from "@/components/ui/use-pointed"

/* 2026-10-02 audit: his call that changing numbers start under the pointer, so the board now
   rests fully lit and still; the quote sequence (and the marquee, when on) runs only while it
   is pointed at (usePointed; in view on touch). The animation frame used to run forever and
   read the theme with getComputedStyle every frame; colours are now read on mount and when
   the page's theme changes (a MutationObserver on the html class), and frames run only while
   a row dissolves or the marquee moves. A falling change is drawn with a true minus (a U+2212
   glyph added to the font) and the lit dots' halo is 12% instead of 30%, softer, as befits an
   art piece. Formula: each step moves one row's price by the step's delta in percent of its
   base, and its change by the same delta in points (quoteAt).
   2026-10-02 round 2: a light look, the dark one unchanged. The halo round each lit dot is a
   glow that only works on black (on white it blurred the ink into grey fuzz), so it now draws
   only when the ink is light: the ink's luminance is measured off a 1px canvas when the
   colours are read, above 0.5 keeps the 12% halo, below draws crisp ink dots on white. The
   colours were read on a change of the app's html class, but a library preview renders into
   an iframe whose html class flips a beat later, so the first read caught the old theme; the
   board now also watches its own document's root (and the system scheme) and re-reads there. */

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
  "\u2212": "..... ..... ..... ##### ..... ..... .....",
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

const MINUS = "\u2212"
/** a change string as a number, whichever minus it carries */
const changeOf = (s: string) => parseFloat(s.replace(MINUS, "-"))

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
  // a falling change reads with the true minus, whatever the feed sends
  push(r.change.replace(/-/g, MINUS).padStart(6).slice(-6), r.up ? "up" : "down")
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
  const c = changeOf(base.change) + d
  return {
    symbol: base.symbol,
    price: Number.isFinite(p) ? (p * (1 + d / 100)).toFixed(dec) : base.price,
    change: `${c >= 0 ? "+" : MINUS}${Math.abs(c).toFixed(1)}%`,
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
  { symbol: "AAPL", price: "226.14", change: "\u22120.6%", up: false },
  { symbol: "AMZN", price: "187.09", change: "\u22121.3%", up: false },
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
 * At rest it is fully lit and still. While it is pointed at, every ~2.5s one
 * row's quote advances through a deterministic sequence: only
 * the characters that differ dissolve out dot by dot, staggered by a spatial
 * hash, and the new characters bloom back in the same way, the split-flap
 * feel without the flaps. Colours are read from the theme variables on mount and
 * on a theme switch, so the board recolours live. HiDPI canvas, a
 * ResizeObserver refit, the unlit grid cached offscreen, and it paints only
 * while something moves. Fully lit and still under reduced motion.
 */
export function MatrixTickerBoard({ rows = DEFAULT_ROWS, marquee = false, dotSize = 3, className }: MatrixTickerBoardProps) {
  const reduced = useReducedMotion()
  const { ref: wrapRef, live, bind } = usePointed<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /* the effect below builds the board once; it reads whether it is pointed at through this,
     and `wake` restarts its frames when that changes */
  const liveRef = useRef(live)
  const wakeRef = useRef<() => void>(() => {})
  useEffect(() => {
    liveRef.current = live
    wakeRef.current()
  }, [live])

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
    let mqAt = 0

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
      /* the marquee holds where it is when the pointer leaves, and starts from there again */
      if (marquee && !still && liveRef.current) mqAt = Math.floor(now / 110) % loopCols
      const mq = marquee && !still ? mqAt : 0
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
                if (halo) {
                  ctx!.globalAlpha = a * 0.12 // a faint halo, no glow; light ink only (dark theme)
                  ctx!.beginPath()
                  ctx!.arc(x, y, dotR * 1.8, 0, TAU)
                  ctx!.fill()
                }
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

    /* the theme's colours, read on mount and again whenever the page's theme class changes */
    let fg = "", upC = "", downC = ""
    let halo = true
    /* the ink's luminance, whatever colour syntax the token uses: paint it on 1px and read it back */
    const probe = document.createElement("canvas")
    probe.width = probe.height = 1
    const pctx = probe.getContext("2d", { willReadFrequently: true })
    const inkIsLight = (c: string) => {
      if (!pctx) return true
      pctx.clearRect(0, 0, 1, 1)
      pctx.fillStyle = "#808080"
      pctx.fillStyle = c
      pctx.fillRect(0, 0, 1, 1)
      const [r, g, b] = pctx.getImageData(0, 0, 1, 1).data
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5
    }
    const readColors = () => {
      const cs = getComputedStyle(wrap!)
      fg = cs.getPropertyValue("--foreground").trim() || "#ffffff"
      upC = cs.getPropertyValue("--chart-up").trim() || "#34c28a"
      downC = cs.getPropertyValue("--chart-down").trim() || "#e06a6a"
      halo = inkIsLight(fg)
      const key = fg + upC + downC
      if (key !== colorKey) {
        colorKey = key
        dirty = true
      }
    }
    readColors()

    /* frames run only while something moves; anything that changes the picture calls wake */
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(loop)
    }
    function loop(now: number) {
      raf = 0
      let animating = false
      for (const s of state) {
        if (s.start < 0) continue
        if (now - s.start > 620) {
          s.start = -1
          s.prev = s.cur
          dirty = true
        } else animating = true
      }
      const scrolling = marquee && !still && liveRef.current
      if (dirty || animating || scrolling) draw(now, fg, upC, downC)
      if (animating || scrolling) wake()
    }
    wake()
    wakeRef.current = wake

    const mo = new MutationObserver(() => {
      readColors()
      wake()
    })
    const themeAttrs = { attributes: true, attributeFilter: ["class", "data-theme", "style"] }
    mo.observe(document.documentElement, themeAttrs)
    /* a preview iframe flips its own root's class after the app's: read again when it does */
    const ownRoot = wrap.ownerDocument.documentElement
    if (ownRoot !== document.documentElement) mo.observe(ownRoot, themeAttrs)
    /* a system theme change with no class on the root at all */
    const scheme = window.matchMedia?.("(prefers-color-scheme: dark)")
    const onScheme = () => {
      readColors()
      wake()
    }
    scheme?.addEventListener?.("change", onScheme)

    let iv = 0
    if (!still)
      iv = window.setInterval(() => {
        if (!liveRef.current) return
        tick++
        const which = SEQ_ROWS[tick % SEQ_ROWS.length] % state.length
        const s = state[which]
        s.prev = s.cur
        s.cur = cellsFor(quoteAt(rows[which], tick))
        s.start = performance.now()
        wrap.dataset.seq = String(tick)
        wake()
      }, 2500)

    const ro = new ResizeObserver(() => {
      dirty = true
      wake()
    })
    ro.observe(wrap)

    return () => {
      cancelAnimationFrame(raf)
      wakeRef.current = () => {}
      if (iv) clearInterval(iv)
      ro.disconnect()
      mo.disconnect()
      scheme?.removeEventListener?.("change", onScheme)
    }
  }, [rows, marquee, dotSize, reduced, wrapRef])

  return (
    <div
      ref={wrapRef}
      {...bind}
      className={cn("relative h-[180px] w-full max-w-[600px]", className)}
      role="img"
      aria-label={rows.map((r) => `${r.symbol} ${r.price} ${r.change}`).join(", ")}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
