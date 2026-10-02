"use client"

import { useEffect, useId, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Tape Flow, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: the last prints of one market as a row of bars, tall for size, green
   when buyers pressed and red when sellers did, so a burst on one side is seen at once.
   Read first: the price. It is the one large figure; the change on that print sits beside it.
   The pointer: scrub the bars and the pointed print stays full while the rest dim; the
   price, the change and the line under the bars become that print's. Press a bar to hold
   it, press it again or Escape to let go; with focus on the bars the arrow keys step
   through them. "Live" starts and stops the feed, "Boost" raises the small prints.
   Lab sketch: src/components/lab/TapeFlow.tsx. Kept: the data shape, 48 prints in the
   buffer, colour by buy share, hover and press, the live switch and the boost. Changed:
   no card, shadow, dotted ground, gradient bars or glow; no capitals and no mono; the
   live feed drew from Math.random and the clock, it now continues the same seeded walk,
   so two mounts print the same tape. "Flow ratio 64% buy" was typed in; it is worked out
   from the buffer. "Volume × 120 units" meant nothing; volume is BTC. "60 fps" is gone.
   Formulas:
   · change on a print  = price − price of the print before
   · buy share, a print = 0.5 + change / 25, held between 5% and 95%
   · bar height         = min(1, volume × gain / 10 BTC), gain 1 or 1.3 with boost
   · bar strength       = 35% + |buy share − 50%| × 2 × 60% of the hue
   · buy share, buffer  = Σ (volume × buy share) / Σ volume; sell share = 100% − buy share
   · traded, buffer     = Σ volume */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

const M = 2147483647
const BUFFER = 48
/** one print every 400 ms */
const BEAT = 400
/** the volume that fills a bar, in BTC */
const FULL = 10
const BOOST = 1.3

const W = 520
const H = 112
const GAP = 2
const BW = (W - (BUFFER - 1) * GAP) / BUFFER

export interface TickBar {
  id: number
  /** hh:mm:ss */
  timestamp: string
  /** size of the print, in BTC */
  volume: number
  /** 0 to 1, the share of the print that lifted the offer */
  buyRatio: number
  price: number
  /** change against the print before, in dollars */
  delta: number
}

export interface TapeFlowProps {
  symbol?: string
  /** the price the walk starts from */
  base?: number
  /** seed of the walk; the same seed prints the same tape */
  seed?: number
  initialLive?: boolean
  className?: string
}

const two = (n: number) => String(n).padStart(2, "0")
/** the tape opens at 09:30:00 and prints every 400 ms */
const clock = (id: number) => {
  const s = 9 * 3600 + 30 * 60 + Math.floor((id * BEAT) / 1000)
  return `${two(Math.floor(s / 3600) % 24)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`
}

/** the next print of the walk, and the seed it leaves behind */
function grow(prev: { id: number; price: number }, seed: number): { tick: TickBar; seed: number } {
  const a = (seed * 16807) % M
  const b = (a * 16807) % M
  const delta = Math.round((a / M - 0.48) * 12.5 * 100) / 100
  const id = prev.id + 1
  return {
    seed: b,
    tick: {
      id,
      timestamp: clock(id),
      volume: (15 + (b % 80)) / 10,
      buyRatio: Math.min(0.95, Math.max(0.05, 0.5 + delta / 25)),
      price: Math.round((prev.price + delta) * 100) / 100,
      delta,
    },
  }
}

function seedTape(base: number, seed: number) {
  const ticks: TickBar[] = []
  let at = { id: -1, price: base }
  let s = seed
  for (let i = 0; i < BUFFER; i++) {
    const g = grow(at, s)
    ticks.push(g.tick)
    at = g.tick
    s = g.seed
  }
  return { ticks, seed: s }
}

const usd = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`
const pct = (v: number) => `${Math.round(v * 100)}%`
const fill = (t: TickBar) => `color-mix(in srgb, ${t.buyRatio >= 0.5 ? GREEN : RED} ${Math.round(35 + Math.abs(t.buyRatio - 0.5) * 2 * 60)}%, transparent)`

const PILL =
  "relative h-7 rounded-full px-3 text-[11px] outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 focus-visible:bg-foreground/[0.06] active:scale-[0.97] motion-reduce:active:scale-100"

/**
 * Order flow as a row of bars: height is size, hue is the side that pressed, strength is
 * how one-sided the print was. Scrubbing reads any print in place of the latest one.
 */
export function TapeFlow({ symbol = "BTC-USD", base = 64280.5, seed = 42, initialLive = true, className }: TapeFlowProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const box = useRef<SVGSVGElement>(null)
  const [feed, setFeed] = useState(() => seedTape(base, seed))
  const [live, setLive] = useState(initialLive)
  const [boost, setBoost] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [pin, setPin] = useState<number | null>(null)
  /* the first tape rises in once, 6ms a bar (48 bars inside 300ms); after that each new
     print rises alone as it lands */
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLanded(true), reduced ? 0 : BUFFER * 6 + 320)
    return () => clearTimeout(t)
  }, [reduced])

  /* reduced motion holds the tape still until it is asked to run */
  useEffect(() => {
    if (reduced) setLive(false)
  }, [reduced])

  useEffect(() => {
    if (!live) return
    const t = setInterval(() => {
      setFeed((f) => {
        const g = grow(f.ticks[f.ticks.length - 1], f.seed)
        return { ticks: [...f.ticks.slice(1), g.tick], seed: g.seed }
      })
    }, BEAT)
    return () => clearInterval(t)
  }, [live])

  const { ticks } = feed
  const latest = ticks[ticks.length - 1]
  const hotId = hover ?? pin
  const hot = ticks.find((t) => t.id === hotId) ?? null
  const shown = hot ?? latest
  const gain = boost ? BOOST : 1

  const traded = ticks.reduce((s, t) => s + t.volume, 0)
  const bought = ticks.reduce((s, t) => s + t.volume * t.buyRatio, 0) / (traded || 1)

  /* the sell share is what is left of 100, so the two always add up */
  const buy = Math.round((hot ? hot.buyRatio : bought) * 100)

  const at = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return null
    const i = Math.max(0, Math.min(ticks.length - 1, Math.floor(((clientX - r.left) / r.width) * ticks.length)))
    return ticks[i].id
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setPin(null)
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    e.preventDefault()
    const i = ticks.findIndex((t) => t.id === (pin ?? latest.id))
    const next = Math.max(0, Math.min(ticks.length - 1, (i < 0 ? ticks.length - 1 : i) + (e.key === "ArrowLeft" ? -1 : 1)))
    setPin(ticks[next].id)
  }

  return (
    <div className={cn("w-full max-w-[520px] tabular-nums", className)}>
      <div className="flex items-end justify-between gap-3 pb-3">
        <div role="status">
          <div className="text-[11.5px] font-medium text-foreground/45">
            {symbol}
            {hot ? ` · ${hot.timestamp}` : ""}
          </div>
          {/* each new live print pops in (4px, 2px blur, 150ms); a scrubbed one reads at once */}
          <motion.div
            key={hot ? "held" : latest.id}
            className="mt-1.5 flex items-baseline gap-2"
            initial={reduced || !landed ? false : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">${usd(shown.price)}</span>
            <span className="text-[11px] font-medium" style={{ color: shown.delta >= 0 ? GREEN : RED }}>
              {signed(shown.delta)}
            </span>
          </motion.div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={boost}
            onClick={() => setBoost((b) => !b)}
            className={cn(PILL, boost ? "bg-foreground/[0.08] text-foreground/90" : "text-foreground/45 hover:text-foreground/90")}
          >
            Boost
          </button>
          <button
            type="button"
            aria-pressed={live}
            onClick={() => setLive((l) => !l)}
            className={cn(PILL, "flex items-center gap-1.5", live ? "bg-foreground/[0.08] text-foreground/90" : "text-foreground/45 hover:text-foreground/90")}
          >
            {/* live is a healthy state: the dot is green while the feed runs */}
            <span aria-hidden className={cn("h-[5px] w-[5px] rounded-full transition-colors duration-150", !live && "bg-foreground/30")} style={live ? { background: GREEN } : undefined} />
            {live ? "Live" : "Paused"}
          </button>
        </div>
      </div>

      <div
        tabIndex={0}
        role="group"
        aria-label="Prints, arrow keys step through them"
        onKeyDown={onKey}
        className="rounded-[4px] outline-none focus-visible:bg-foreground/[0.03]"
      >
        <svg
          ref={box}
          viewBox={`0 0 ${W} ${H + 6}`}
          className="block w-full cursor-crosshair touch-none overflow-visible"
          role="img"
          aria-label={`${symbol} order flow, last ${ticks.length} prints, ${pct(bought)} bought, latest $${usd(latest.price)}`}
          onPointerMove={(e) => setHover(at(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const id = at(e.clientX)
            setPin((p) => (p === id ? null : id))
          }}
        >
          <line x1={0} x2={W} y1={H + 0.5} y2={H + 0.5} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} />
          <g key={uid}>
            {ticks.map((t, i) => {
              const h = Math.max(2, Math.min(1, (t.volume * gain) / FULL) * H)
              return (
                <motion.rect
                  key={t.id}
                  initial={reduced ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: landed ? 0 : i * 0.006 }}
                  x={i * (BW + GAP)}
                  y={H - h}
                  width={BW}
                  height={h}
                  rx={2}
                  fill={fill(t)}
                  style={{ transformBox: "fill-box", originY: 1, opacity: hotId !== null && hot && hot.id !== t.id ? 0.4 : 1, transition: "opacity 150ms" }}
                />
              )
            })}
          </g>
          {ticks.map((t, i) => (pin === t.id ? <rect key={t.id} x={i * (BW + GAP)} y={H + 3} width={BW} height={2} rx={1} fill="var(--foreground)" /> : null))}
        </svg>
      </div>

      <div role="status" className="mt-2 flex items-center justify-between gap-3 text-[10.5px] text-foreground/45">
        <span className="truncate">
          {hot ? (
            <>
              <span className="text-foreground/90">{hot.volume.toFixed(1)} BTC</span> at {hot.timestamp}
            </>
          ) : (
            <>
              <span className="text-foreground/90">{traded.toFixed(1)} BTC</span> over {ticks.length} prints
            </>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          <span>
            <span style={{ color: GREEN }}>{buy}% buy</span> · <span style={{ color: RED }}>{100 - buy}% sell</span>
          </span>
          <span aria-hidden className="flex h-[3px] w-16 overflow-hidden rounded-full">
            <span style={{ width: `${(hot ? hot.buyRatio : bought) * 100}%`, background: GREEN }} />
            <span className="flex-1" style={{ background: RED }} />
          </span>
        </span>
      </div>
    </div>
  )
}
