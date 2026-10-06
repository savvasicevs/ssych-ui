"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { LiveToggle } from "@/components/ui/live-toggle"
import { usePointed } from "@/components/ui/use-pointed"

/* Trade Tape, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card, outline or inner shadow: the tape sits on the page. `flush` stays as a prop and
     now only lifts the width cap, since there is no card left to drop
   · the clock is a fixed session clock that steps with each print, so two mounts print the
     same times (it read the wall clock before)
   · sentence case: the symbol, the column heads and the block mark are no longer set in
     capitals or letter-spaced
   · pointing at a print keeps it full and dims the rest
   · the tape names itself to a screen reader, every figure is tabular
   2026-10-02 audit: his call reversed the hover. The tape rests on its seeded prints and
   streams only while the pointer is on it (usePointed); it used to stream from mount and
   pause on hover. The text Pause button and the "Paused, 3 waiting" word that changed width
   became one IconToggle at a fixed width, the same as Tape Flow's: a pulsing green dot
   reading "Live", a filled play mark reading "Play"; it pins the feed on, or pauses it while
   the pointer stays. No prints queue any more, since a stopped feed prints nothing. The
   "Trade tape" title is gone (the name is in the aria-label) and the symbol reads 12px /90;
   heads are 10.5px /45, the time /45, the block mark 9.5px. The width is 440, shared with
   Tape Flow, its family.
   2026-10-02 round 2: his note on the Live control, no green dot. The toggle is the shared
   LiveToggle (live-toggle.tsx), the same as Tape Flow's, in ink without a dot, its look
   picked by the LiveToggleVariant around it; it pins and pauses the feed as before.
   Formulas:
   · a print's price  = the price before × (1 ± r × 0.035%), up on a buy, down on a sell
   · block            a print of 10 × the median size (120) or more
   · edge bar         opacity 25% + size ÷ (6 × median), at most 100% */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

type Print = { id: number; t: string; price: number; size: number; side: "buy" | "sell"; block: boolean }

const MAX_ROWS = 12
const MEDIAN = 120
/** the session clock the first print is stamped with, in seconds: 14:30:00 */
const CLOCK_START = 14 * 3600 + 30 * 60

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const two = (n: number) => String(n).padStart(2, "0")
const stamp = (sec: number) => {
  const s = sec % 86400
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`
}

/** a print from the host's own feed (2026-10-06): time in ms since epoch, newest first */
export type TapePrint = { id: number | string; time: number; price: number; size: number; side: "buy" | "sell" }

export interface TradeTapeProps {
  /** real prints, newest first (2026-10-06): given, the tape shows them instead of its seeded
   *  walk and the live toggle leaves, since the host owns the feed. Blocks are ten times the
   *  feed's own median size */
  feed?: TapePrint[]
  /** places the size is written to; 0 for whole shares, more for crypto */
  sizeDp?: number
  symbol?: string
  /** the price the seeded walk starts from */
  base?: number
  priceDp?: number
  /** lift the width cap, so the tape fills whatever pane holds it */
  flush?: boolean
  /** take the pane's full height; the row count answers to it, so prints reach the bottom edge */
  fill?: boolean
  /** show the symbol beside the toggle; false when the host already names the pane */
  label?: boolean
  /** start with the feed pinned on; at rest (false) it streams only while pointed at */
  initialLive?: boolean
  className?: string
}

/**
 * Live time and sales. Prints stream in at the top while the tape is pointed at, coloured
 * by the aggressor and weighed by a thin bar at the edge; block trades of ten times the
 * median or more get a faint ground across the row. Pointing at a print dims the rest.
 * Demo feed, seeded, so two mounts print the same walk.
 */
export function TradeTape({
  feed,
  sizeDp = 0,
  symbol = "AAPL",
  base = 228.02,
  priceDp = 2,
  flush = false,
  fill = false,
  label = true,
  initialLive = false,
  className,
}: TradeTapeProps) {
  const reduced = useReducedMotion()
  const pointed = usePointed()
  const [hot, setHot] = useState<number | null>(null)
  /* "auto" streams while pointed at, "on" is pinned by the toggle, "off" is paused by it
     until the pointer leaves (then it goes back to auto) */
  const [mode, setMode] = useState<"auto" | "on" | "off">(initialLive ? "on" : "auto")
  const live = mode === "on" || (mode === "auto" && pointed.live)
  useEffect(() => {
    if (!pointed.live && mode === "off") setMode("auto")
  }, [pointed.live, mode])
  const idRef = useRef(1)
  const clockRef = useRef(CLOCK_START)
  const priceRef = useRef(base)

  /* one generator for the whole life of the tape, so a taller pane never restarts the price */
  const makeRef = useRef<(() => Print) | null>(null)
  if (!makeRef.current) {
    const rand = mulberry32(47)
    makeRef.current = () => {
      const side: "buy" | "sell" = rand() > 0.5 ? "buy" : "sell"
      priceRef.current = +(priceRef.current * (1 + (side === "buy" ? 1 : -1) * rand() * 0.00035)).toFixed(priceDp)
      const block = rand() < 0.06
      const size = block ? Math.round(MEDIAN * (10 + rand() * 25)) : Math.round(8 + rand() * rand() * 340)
      const id = idRef.current++
      /* the clock steps one to three seconds a print, by the print's number */
      clockRef.current += 1 + (id % 3)
      return { id, t: stamp(clockRef.current), price: priceRef.current, size, side, block }
    }
  }
  /* the seeded prints are there from the first frame: the still state at rest */
  const [prints, setPrints] = useState<Print[]>(() => Array.from({ length: MAX_ROWS }, makeRef.current!).reverse())
  /** the seeded batch rises in once, 35ms apart for the first 8; after that every print
   *  lands alone and the hover dim answers without a delay */
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 600)
    return () => clearTimeout(t)
  }, [])

  /* fill mode: the list is a flex-1 box, so its height is the pane's; measure it
     and one row, and the row count falls out of height ÷ rowHeight */
  const listRef = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState(MAX_ROWS)
  const rowsRef = useRef(MAX_ROWS)
  rowsRef.current = rows
  const seeded = prints.length > 0
  useLayoutEffect(() => {
    const box = listRef.current
    if (!fill || !box || !seeded || typeof ResizeObserver === "undefined") return
    const measure = () => {
      const rowH = (box.firstElementChild as HTMLElement | null)?.getBoundingClientRect().height ?? 0
      if (!rowH) return
      /* floor, so every print on screen is a whole one */
      setRows(Math.max(4, Math.floor(box.clientHeight / rowH)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [fill, seeded])

  useEffect(() => {
    const make = makeRef.current
    if (!make || !live) return
    const id = setInterval(() => setPrints((prev) => [make(), ...prev].slice(0, rowsRef.current)), reduced ? 2200 : 700)
    return () => clearInterval(id)
  }, [live, reduced])

  /* a taller pane asks for more prints than the tape holds: top up at the old end */
  useEffect(() => {
    const make = makeRef.current
    if (!make) return
    setPrints((prev) => (prev.length >= rows ? prev.slice(0, rows) : [...prev, ...Array.from({ length: rows - prev.length }, make)]))
  }, [rows])

  /* the host's feed, when given: its own median sets the block size and the weight bars */
  const sizes = feed ? [...feed.map((f) => f.size)].sort((a, b) => a - b) : []
  const median = feed ? sizes[Math.floor(sizes.length / 2)] || 1 : MEDIAN
  const shown: Print[] = feed
    ? feed.slice(0, rows).map((f, i) => ({
        id: typeof f.id === "number" ? f.id : i + 1,
        t: new Date(f.time).toLocaleTimeString("en-GB", { hour12: false }),
        price: f.price,
        size: f.size,
        side: f.side,
        block: f.size >= median * 10,
      }))
    : prints

  return (
    <div
      ref={pointed.ref}
      {...pointed.bind}
      className={cn("w-full overflow-hidden tabular-nums", fill && "flex h-full min-h-0 flex-col", !flush && "max-w-[440px]", className)}
      role="group"
      aria-label={`Trade tape, ${symbol}${shown[0] ? `, last ${shown[0].price.toFixed(priceDp)}` : ""}${feed ? "" : `, ${live ? "live" : "paused"}`}`}
      onPointerLeave={() => {
        pointed.bind.onPointerLeave()
        setHot(null)
      }}
    >
      <div className={cn("flex shrink-0 items-center px-3 pb-2", label ? "justify-between" : "justify-end")}>
        {label && <span className="text-[12px] font-medium text-foreground/90">{symbol}</span>}
        {/* live-toggle.tsx, the same toggle as Tape Flow: ink only, one fixed width */}
        {!feed && (
          <span className="-mr-2">
            <LiveToggle live={live} onLiveChange={(next) => setMode(next ? "on" : "off")} />
          </span>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-3 border-b border-foreground/[0.05] px-3 pb-1.5 text-[10.5px] text-foreground/45">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
      </div>

      <div ref={listRef} className={fill ? "min-h-0 flex-1 overflow-hidden" : "pt-1"} role="log" aria-label={`${symbol} prints`} aria-live="off">
        <AnimatePresence initial={false}>
          {shown.map((p, i) => {
            const hue = p.side === "buy" ? GREEN : RED
            const dim = hot !== null && hot !== p.id
            const delay = intro ? Math.min(i, 7) * 0.035 : 0
            return (
              <motion.div
                key={p.id}
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                animate={{ opacity: dim ? 0.45 : 1, y: 0 }}
                transition={
                  reduced
                    ? { duration: 0.15, delay }
                    : { duration: 0.28, ease: EASE, delay, opacity: { duration: 0.18, ease: EASE, delay } }
                }
                onPointerEnter={() => setHot(p.id)}
                className="relative grid grid-cols-3 items-center px-3 py-[3px] text-[10.5px]"
                style={p.block ? { background: `color-mix(in srgb, ${hue} 8%, transparent)` } : undefined}
              >
                {/* the print's weight: the same hue, stronger for a larger size */}
                <span aria-hidden className="absolute inset-y-[2px] left-0 w-[2px] rounded-full" style={{ background: hue, opacity: Math.min(1, 0.25 + p.size / (median * 6)) }} />
                <span className="text-foreground/45">{p.t}</span>
                <span className="text-right" style={{ color: hue }}>
                  {p.price.toFixed(priceDp)}
                </span>
                <span className={cn("text-right", p.block ? "font-semibold text-foreground/90" : "text-foreground/60")}>
                  {p.size.toLocaleString("en-US", { minimumFractionDigits: sizeDp, maximumFractionDigits: sizeDp })}
                  {p.block && (
                    <span className="ms-1 text-[9.5px] font-medium" style={{ color: hue }}>
                      block
                    </span>
                  )}
                </span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
