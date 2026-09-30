"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Trade Tape, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card, outline or inner shadow: the tape sits on the page. `flush` stays as a prop and
     now only lifts the 300px width cap, since there is no card left to drop
   · the clock is a fixed session clock that steps with each print, so two mounts print the
     same times (it read the wall clock before)
   · sentence case: the symbol, the column heads and the block mark are no longer set in
     capitals or letter-spaced
   · pointing at a print keeps it full and dims the rest, and the tape still holds while
     the pointer is on it
   · "hover to pause" is now a real Pause button, so the keyboard can hold the tape too;
     the state beside it says how many prints are waiting
   · the tape names itself to a screen reader, every figure is tabular */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

type Print = { id: number; t: string; price: number; size: number; side: "buy" | "sell"; block: boolean }

const MAX_ROWS = 14
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

export interface TradeTapeProps {
  symbol?: string
  /** the price the seeded walk starts from */
  base?: number
  priceDp?: number
  /** lift the width cap, so the tape fills whatever pane holds it */
  flush?: boolean
  /** take the pane's full height; the row count answers to it, so prints reach the bottom edge */
  fill?: boolean
  /** print the title; false when the host already names the pane */
  label?: boolean
  className?: string
}

/**
 * Live time and sales. Prints stream in at the top, coloured by the aggressor and
 * weighed by a thin bar at the edge; block trades of ten times the median or more get a
 * faint ground across the row. Pointing at the tape holds it and dims every print but
 * the one under the pointer; prints wait and land together on leave.
 * Demo feed, seeded, so two mounts print the same walk.
 */
export function TradeTape({ symbol = "AAPL", base = 228.02, priceDp = 2, flush = false, fill = false, label = true, className }: TradeTapeProps) {
  const reduced = useReducedMotion()
  const [prints, setPrints] = useState<Print[]>([])
  const [hot, setHot] = useState<number | null>(null)
  /** held by the pointer, or locked by the button */
  const [over, setOver] = useState(false)
  const [locked, setLocked] = useState(false)
  const [waiting, setWaiting] = useState(0)
  const paused = useRef(false)
  const queue = useRef<Print[]>([])
  const idRef = useRef(1)
  const clockRef = useRef(CLOCK_START)
  const priceRef = useRef(base)
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

  useEffect(() => {
    const make = makeRef.current
    if (!make) return
    setPrints(Array.from({ length: rowsRef.current }, make).reverse())
    const id = setInterval(() => {
      const p = make()
      if (paused.current) {
        queue.current.push(p)
        setWaiting(queue.current.length)
      } else {
        setPrints((prev) => [p, ...queue.current.reverse(), ...prev].slice(0, rowsRef.current))
        queue.current = []
      }
    }, reduced ? 2200 : 700)
    return () => clearInterval(id)
  }, [reduced])

  /* a taller pane asks for more prints than the tape holds: top up at the old end */
  useEffect(() => {
    const make = makeRef.current
    if (!make) return
    setPrints((prev) => (prev.length >= rows ? prev.slice(0, rows) : [...prev, ...Array.from({ length: rows - prev.length }, make)]))
  }, [rows])

  /* the tape runs again once neither the pointer nor the button holds it */
  const held = over || locked
  useEffect(() => {
    paused.current = held
    if (held) return
    if (queue.current.length) {
      const late = [...queue.current].reverse()
      queue.current = []
      setPrints((prev) => [...late, ...prev].slice(0, rowsRef.current))
    }
    setWaiting(0)
  }, [held])

  const state = held ? (waiting > 0 ? `Paused, ${waiting} waiting` : "Paused") : "Live"

  return (
    <div
      className={cn("w-full overflow-hidden tabular-nums", fill && "flex h-full min-h-0 flex-col", !flush && "max-w-[300px]", className)}
      role="group"
      aria-label={`Trade tape, ${symbol}${prints[0] ? `, last ${prints[0].price.toFixed(priceDp)}` : ""}`}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => {
        setOver(false)
        setHot(null)
      }}
    >
      <div className={cn("flex shrink-0 items-baseline px-3", label ? "justify-between pb-2" : "justify-end pb-1")}>
        {label && (
          <span className="flex items-baseline gap-2">
            <span className="text-[13px] font-medium text-foreground/90">Trade tape</span>
            <span className="text-[11px] text-foreground/45">{symbol}</span>
          </span>
        )}
        <span className="flex items-baseline gap-1">
          {/* the state swaps in place (4px, 2px blur, 150ms) */}
          <span role="status" className="text-[10px] text-foreground/35">
            <motion.span
              key={state}
              className="inline-block"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.15, ease: EASE }}
            >
              {state}
            </motion.span>
          </span>
          <button
            type="button"
            aria-pressed={locked}
            onClick={() => setLocked((l) => !l)}
            className="-mr-2 rounded-full px-2 py-1 text-[11px] font-medium text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 ease-out hover:text-foreground/90 focus-visible:bg-foreground/[0.06] active:scale-[0.97] motion-reduce:active:scale-100"
          >
            <motion.span
              key={locked ? "resume" : "pause"}
              className="inline-block"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.15, ease: EASE }}
            >
              {locked ? "Resume" : "Pause"}
            </motion.span>
          </button>
        </span>
      </div>

      <div className="grid shrink-0 grid-cols-3 border-b border-foreground/[0.05] px-3 pb-1.5 text-[9.5px] text-foreground/35">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
      </div>

      <div ref={listRef} className={fill ? "min-h-0 flex-1 overflow-hidden" : "pt-1"} role="log" aria-label={`${symbol} prints`} aria-live="off">
        <AnimatePresence initial={false}>
          {prints.map((p, i) => {
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
                <span aria-hidden className="absolute inset-y-[2px] left-0 w-[2px] rounded-full" style={{ background: hue, opacity: Math.min(1, 0.25 + p.size / (MEDIAN * 6)) }} />
                <span className="text-foreground/35">{p.t}</span>
                <span className="text-right" style={{ color: hue }}>
                  {p.price.toFixed(priceDp)}
                </span>
                <span className={cn("text-right", p.block ? "font-semibold text-foreground/90" : "text-foreground/60")}>
                  {p.size.toLocaleString("en-US")}
                  {p.block && (
                    <span className="ms-1 text-[8px] font-medium" style={{ color: hue }}>
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
