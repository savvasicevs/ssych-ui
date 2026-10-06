"use client"

import { useEffect, useId, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { LiveToggle } from "@/components/ui/live-toggle"
import { LiveFigure } from "@/components/ui/live-figure"
import { usePointed } from "@/components/ui/use-pointed"

/* Tape Flow, promoted from a lab sketch through ssych-component (2026-09-29).
   Motion pass (user call, 2026-10-02: "fix the animations and transitions … add icons"):
   the tape now SLIDES one slot left as each print lands (x over the beat, linear, so the
   row reads as one moving tape), the oldest bar sinks out at the left edge, the new one
   rises in at the right; Boost grows and shrinks the bars (height 300ms) instead of
   snapping; the buttons carry icons (a bolt that fills while Boost is on; a pulsing green
   dot while Live, a pause mark while Paused) and their labels swap in place without the
   button changing width; the buy/sell bar eases to its new split.
   What it is for: the last prints of one market as a row of bars, tall for size, green
   when buyers pressed and red when sellers did, so a burst on one side is seen at once.
   Read first: the price. It is the one large figure; the change on that print sits beside it.
   The pointer: scrub the bars and the pointed print stays full while the rest dim; the
   price, the change and the line under the bars become that print's. Press a bar to hold
   it, press it again or Escape to let go; with focus on the bars the arrow keys step
   through them. The feed runs while the tape is pointed at; the toggle pins it on or pauses it.
   Lab sketch: src/components/lab/TapeFlow.tsx. Kept: the data shape, 48 prints in the
   buffer, colour by buy share, hover and press, the live switch and the boost. Changed:
   no card, shadow, dotted ground, gradient bars or glow; no capitals and no mono; the
   live feed drew from Math.random and the clock, it now continues the same seeded walk,
   so two mounts print the same tape. "Flow ratio 64% buy" was typed in; it is worked out
   from the buffer. "Volume × 120 units" meant nothing; volume is BTC. "60 fps" is gone.
   2026-10-02 audit: his calls first. The tape is still at rest and its feed runs only while
   the pointer is on it (usePointed); the toggle pins it on, and while paused it shows a
   filled play mark reading "Play", while live the pulsing green dot reading "Live", inside
   one fixed width. Boost is gone, it only rescaled the bars, so there is one toggle (the
   gain is 1). The header is the three tier one (label row "Order flow" and the symbol,
   26px price with its cents at /35, the change in its hue then the print's time), and the
   line under the bars reads only the pointed print and keeps its height at rest; the buy
   share of the buffer moved to the aria-label. The width is 440, shared with Trade Tape.
   2026-10-02 round 2: his note on the Live control, no green dot. The toggle is the shared
   LiveToggle (live-toggle.tsx), the same in every streaming component: four looks, all in
   ink and without a dot, picked by the LiveToggleVariant around it; it plays and pauses the
   feed exactly as before.
   Formulas:
   · change on a print  = price − price of the print before
   · buy share, a print = 0.5 + change / 25, held between 5% and 95%
   · bar height         = min(1, volume / 10 BTC)
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
  /** start with the feed pinned on; at rest (false) it runs only while pointed at */
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

/**
 * Order flow as a row of bars: height is size, hue is the side that pressed, strength is
 * how one-sided the print was. Scrubbing reads any print in place of the latest one.
 */
export function TapeFlow({ symbol = "BTC-USD", base = 64280.5, seed = 42, initialLive = false, className }: TapeFlowProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const box = useRef<SVGSVGElement>(null)
  const pointed = usePointed()
  const [feed, setFeed] = useState(() => seedTape(base, seed))
  /* "auto" runs while pointed at, "on" is pinned by the toggle, "off" is paused by it until
     the pointer leaves (then it goes back to auto) */
  const [mode, setMode] = useState<"auto" | "on" | "off">(initialLive ? "on" : "auto")
  /* reduced motion never starts the feed on its own: only the toggle runs it */
  const live = mode === "on" || (mode === "auto" && pointed.live && !reduced)
  useEffect(() => {
    if (!pointed.live && mode === "off") setMode("auto")
  }, [pointed.live, mode])
  const [hover, setHover] = useState<number | null>(null)
  const [pin, setPin] = useState<number | null>(null)
  /* the first tape rises in once, 6ms a bar (48 bars inside 300ms); after that each new
     print rises alone as it lands */
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLanded(true), reduced ? 0 : BUFFER * 6 + 320)
    return () => clearTimeout(t)
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

  const traded = ticks.reduce((s, t) => s + t.volume, 0)
  const bought = ticks.reduce((s, t) => s + t.volume * t.buyRatio, 0) / (traded || 1)

  /* the sell share is what is left of 100, so the two always add up */
  const buy = hot ? Math.round(hot.buyRatio * 100) : 0
  const [whole, cents] = usd(shown.price).split(".")

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
    <div ref={pointed.ref} {...pointed.bind} className={cn("w-[440px] max-w-full tabular-nums", className)}>
      <div className="mb-3 flex items-baseline justify-between text-[12px]">
        <span className="text-foreground/45">Order flow</span>
        <span className="font-medium text-foreground/90">{symbol}</span>
      </div>
      <div className="flex items-end justify-between gap-3 pb-3">
        <div role="status">
          {/* the live price changes in place (live-figure.tsx): it swaps only when the pointer
              takes a print or lets it go, never on each print (user call, 2026-10-02) */}
          <LiveFigure intent={hot ? hot.id : null}>
            <p className="m-0 text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
              ${whole}
              <span className="text-foreground/35">.{cents}</span>
            </p>
            <p className="mb-0 mt-2 flex items-baseline gap-1.5 text-[12px] font-medium" style={{ color: shown.delta >= 0 ? GREEN : RED }}>
              <span>{signed(shown.delta)}</span>
              <span className="font-normal text-foreground/45">{shown.timestamp}</span>
            </p>
          </LiveFigure>
        </div>

        {/* live-toggle.tsx: the family's play and pause control, ink only, one fixed width */}
        <LiveToggle live={live} onLiveChange={(next) => setMode(next ? "on" : "off")} />
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
          aria-label={`${symbol} order flow, last ${ticks.length} prints, ${traded.toFixed(1)} BTC traded, ${pct(bought)} bought and ${100 - Math.round(bought * 100)}% sold, latest $${usd(latest.price)}`}
          onPointerMove={(e) => setHover(at(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const id = at(e.clientX)
            setPin((p) => (p === id ? null : id))
          }}
        >
          <line x1={0} x2={W} y1={H + 0.5} y2={H + 0.5} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} />
          <g key={uid}>
            {/* each bar owns its place by id: when a print lands every bar glides one slot
                left over the beat, the oldest sinks out at the edge and the new one rises in */}
            <AnimatePresence initial={false}>
              {ticks.map((t, i) => {
                const h = Math.max(2, Math.min(1, t.volume / FULL) * H)
                const x = i * (BW + GAP)
                return (
                  <motion.rect
                    key={t.id}
                    initial={reduced ? false : landed ? { x: x + BW + GAP, y: H, height: 0 } : { x, y: H, height: 0 }}
                    animate={{ x, y: H - h, height: h }}
                    exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { x: x - BW - GAP, y: H, height: 0, opacity: 0 }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : {
                            x: { duration: BEAT / 1000, ease: "linear" },
                            y: { duration: 0.3, ease: EASE, delay: landed ? 0 : i * 0.006 },
                            height: { duration: 0.3, ease: EASE, delay: landed ? 0 : i * 0.006 },
                            opacity: { duration: 0.2 },
                          }
                    }
                    width={BW}
                    rx={2}
                    fill={fill(t)}
                    style={{ opacity: hotId !== null && hot && hot.id !== t.id ? 0.4 : 1, transition: "opacity 150ms" }}
                  />
                )
              })}
            </AnimatePresence>
          </g>
          {ticks.map((t, i) => (pin === t.id ? <rect key={t.id} x={i * (BW + GAP)} y={H + 3} width={BW} height={2} rx={1} fill="var(--foreground)" /> : null))}
        </svg>
      </div>

      {/* the pointed print only; at rest the line keeps its height empty */}
      <div role="status" className="mt-2 flex h-4 items-center justify-between gap-3 text-[10.5px] text-foreground/60">
        {hot ? (
          <>
            <span className="truncate">
              <span className="text-foreground/90">{hot.volume.toFixed(1)} BTC</span> at {hot.timestamp}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span style={{ color: GREEN }}>{buy}% buy</span>
              <span style={{ color: RED }}>{100 - buy}% sell</span>
              <span aria-hidden className="flex h-[3px] w-16 overflow-hidden rounded-full">
                <span style={{ width: `${hot.buyRatio * 100}%`, background: GREEN, transition: reduced ? undefined : "width 300ms cubic-bezier(0.16, 1, 0.3, 1)" }} />
                <span className="flex-1" style={{ background: RED }} />
              </span>
            </span>
          </>
        ) : (
          <span aria-hidden>&nbsp;</span>
        )}
      </div>
    </div>
  )
}
