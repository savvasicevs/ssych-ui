"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

type Print = { id: number; t: string; price: number; size: number; side: "buy" | "sell"; block: boolean }

const MAX_ROWS = 14
const MEDIAN = 120

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const stamp = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`

export interface TradeTapeProps {
  symbol?: string
  /** the price the seeded walk starts from */
  base?: number
  priceDp?: number
  /** drop the card: no ground, no border, no width cap, so the tape fills whatever pane holds it */
  flush?: boolean
  /** take the pane's full height; the row count answers to it, so prints reach the bottom edge */
  fill?: boolean
  /** print the title; false when the host already names the pane */
  label?: boolean
  className?: string
}

/**
 * Live time and sales. Prints stream in at the top, side-coloured by the
 * aggressor and sized by a per-print magnitude bar; block trades of ten times
 * the median or more get a full-row tint. Hovering pauses the tape, prints
 * queue and flush on leave, so a fill can be read without it running away.
 * Demo feed, seeded, so two mounts print the same walk.
 */
export function TradeTape({ symbol = "AAPL", base = 228.02, priceDp = 2, flush = false, fill = false, label = true, className }: TradeTapeProps) {
  const reduced = useReducedMotion()
  const [prints, setPrints] = useState<Print[]>([])
  const paused = useRef(false)
  const queue = useRef<Print[]>([])
  const idRef = useRef(1)
  const priceRef = useRef(base)

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
      return { id: idRef.current++, t: stamp(new Date()), price: priceRef.current, size, side, block }
    }
  }

  useEffect(() => {
    const make = makeRef.current
    if (!make) return
    setPrints(Array.from({ length: rowsRef.current }, make).reverse())
    const id = setInterval(() => {
      const p = make()
      if (paused.current) queue.current.push(p)
      else {
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

  const release = () => {
    paused.current = false
    if (queue.current.length) {
      setPrints((prev) => [...queue.current.reverse(), ...prev].slice(0, rowsRef.current))
      queue.current = []
    }
  }

  return (
    <div
      className={cn("w-full overflow-hidden", fill && "flex h-full min-h-0 flex-col", !flush && "max-w-[300px] rounded-xl border border-foreground/[0.04]", className)}
      style={flush ? undefined : { background: "var(--card)", boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)" }}
      onPointerEnter={() => {
        paused.current = true
      }}
      onPointerLeave={release}
    >
      <div className={cn("flex shrink-0 items-center px-3", label ? "justify-between py-2.5" : "justify-end pt-2", !flush && "border-b border-foreground/[0.04]")}>
        {label && (
          <span className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-foreground/85">Trade Tape</span>
            <span className="text-[10px] uppercase tracking-[0.1em] text-foreground/30">{symbol}</span>
          </span>
        )}
        <span className="text-[9.5px] text-foreground/35">hover to pause</span>
      </div>

      <div className="grid shrink-0 grid-cols-3 px-3 pb-1 pt-2 text-[9px] uppercase tracking-[0.1em] text-foreground/30">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
      </div>

      <div ref={listRef} className={fill ? "min-h-0 flex-1 overflow-hidden" : "pb-1"}>
        <AnimatePresence initial={false}>
          {prints.map((p) => {
            const hue = p.side === "buy" ? GREEN : RED
            return (
              <motion.div
                key={p.id}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="relative grid grid-cols-3 items-center px-3 py-[3px] text-[10.5px]"
                style={p.block ? { background: `color-mix(in srgb, ${hue} 8%, transparent)` } : undefined}
              >
                {/* per-print magnitude bar */}
                <span className="absolute inset-y-[2px] left-0 w-[2px] rounded-full" style={{ background: hue, opacity: Math.min(1, 0.25 + p.size / (MEDIAN * 6)) }} />
                <span className="tabular-nums text-foreground/35">{p.t}</span>
                <span className="text-right tabular-nums" style={{ color: hue }}>
                  {p.price.toFixed(priceDp)}
                </span>
                <span className={cn("text-right tabular-nums", p.block ? "font-semibold text-foreground/90" : "text-foreground/60")}>
                  {p.size.toLocaleString("en-US")}
                  {p.block && (
                    <span className="ms-1 text-[8px] uppercase tracking-[0.08em]" style={{ color: hue }}>
                      blk
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
