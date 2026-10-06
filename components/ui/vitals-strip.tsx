"use client"

import { useEffect, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { usePointed } from "@/components/ui/use-pointed"

/* Vitals Strip, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: the handful of figures that sit over a chart or a ticket: price, size,
   weight, volume, a ratio, and a count that is still running.
   Read first: the first cell, the price and its change.
   The pointer: pointing at a cell, or tabbing to it, dims the others and the line under
   the strip reads what that figure divides or multiplies.
   Sketch: lab/VitalsStrip. Kept: one thin row of label and value, hairlines between the
   cells, the trade count that ticks up and flashes to full ink as it lands, the
   derivation of each figure.
   Changed: the box, its outline and inner shadow are gone; the label sits over the value
   so six cells fit 520px without scrolling (the sketch was 760 wide and scrolled); the
   derivation was a browser tooltip, which a keyboard and a touch screen never see, and is
   now a line of text; the cells and the count are props.
   The sample numbers hold: 15.44B × 228.02 = 3.52T, 3.52T ÷ 56.3T = 6.25%,
   228.02 ÷ 7.31 = 31.2.
   Formulas: each cell carries its own in `hint`.
   · trades = the opening count + 1 for each tick; ticks only while the strip is pointed at,
     still under reduced motion
   2026-10-02 audit: the trade count ran from mount, re-entered through a 4px blur on every
   tick and flashed to full ink; now it ticks only while the strip is pointed at (his call,
   usePointed) and changes in place, with no flash and no re-entry. The vertical rules
   between cells are gone (24px gaps instead), the cells have no side padding so the first
   one no longer sits 0 / 12, and the focus fill bleeds 8px past the text on 8px corners.
   The price cell takes a real mark through a new `renderIcon(symbol, size)` prop and a new
   `icon` field on a vital. The hint line reads "Mkt cap: 15.44B shares × $228.02". */

const EASE = [0.16, 1, 0.3, 1] as const
/** the hint line's swap when the pointed cell changes (a change of intent): a 4px rise through a 2px blur */
const SWAP_FROM = { opacity: 0, y: 4, filter: "blur(2px)" }
const SWAP_TO = { opacity: 1, y: 0, filter: "blur(0px)" }
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export interface Vital {
  label: string
  value: string
  /** a signed change, written with + or − */
  delta?: string
  /** how the figure is reached, read out while the cell is pointed at */
  hint?: string
  /** a ticker or token whose mark `renderIcon` draws before the label */
  icon?: string
}

export interface VitalsStripProps {
  vitals?: Vital[]
  /** the label of the running count, the last cell; leave empty to drop the cell */
  counter?: string
  /** where the running count starts */
  count?: number
  /** milliseconds between ticks of the count while the strip is pointed at; 0 holds it still */
  every?: number
  /** draws a company or token mark (14px) before a vital's label; the preview passes BrandIcon */
  renderIcon?: (symbol: string, size: number) => ReactNode
  className?: string
}

const DEFAULT_VITALS: Vital[] = [
  { label: "AAPL", value: "$228.02", delta: "+2.56%", hint: "last price, change against the prior close", icon: "AAPL" },
  { label: "Mkt cap", value: "3.52T", hint: "15.44B shares × $228.02" },
  { label: "Index weight", value: "6.25%", hint: "3.52T ÷ 56.3T index cap" },
  { label: "Volume", value: "54.2M", hint: "shares traded, session to date" },
  { label: "P/E", value: "31.2", hint: "$228.02 ÷ $7.31 earnings a share, trailing 12 months" },
]

/**
 * A strip of vitals: label over value, hairlines between. The last cell is a count that
 * ticks; pointing at any cell reads how its figure is reached.
 */
export function VitalsStrip({ vitals = DEFAULT_VITALS, counter = "Trades", count = 4215882, every = 1400, renderIcon, className }: VitalsStripProps) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<number | null>(null)
  const [ticks, setTicks] = useState(0)
  /* the count runs only while the strip is pointed at (his call, 2026-10-02); at rest it holds */
  const { ref, live: pointed, bind } = usePointed()

  useEffect(() => {
    if (reduced || !pointed || !counter || every <= 0) return
    const id = setInterval(() => setTicks((t) => t + 1), every)
    return () => clearInterval(id)
  }, [reduced, pointed, counter, every])

  const cells: Vital[] = counter
    ? [...vitals, { label: counter, value: (count + ticks).toLocaleString("en-US"), hint: `${count.toLocaleString("en-US")} at the open + ${ticks} since` }]
    : vitals
  const shown = hot === null ? null : cells[hot]

  return (
    <div ref={ref} {...bind} className={cn("w-[520px] max-w-full tabular-nums", className)} role="group" aria-label={cells.map((c) => `${c.label} ${c.value}${c.delta ? ` ${c.delta}` : ""}`).join(", ")}>
      <div className="flex flex-wrap gap-x-6 gap-y-3" onPointerLeave={() => setHot(null)}>
        {cells.map((c, i) => {
          const live = !!counter && i === cells.length - 1
          return (
            <div
              key={c.label}
              tabIndex={0}
              role="group"
              aria-label={`${c.label} ${c.value}${c.delta ? `, ${c.delta}` : ""}${c.hint ? `. ${c.hint}` : ""}`}
              onPointerEnter={() => setHot(i)}
              onFocus={() => setHot(i)}
              onBlur={() => setHot(null)}
              /* no side padding and no rules: cells part by the 24px gap; focus bleeds 8px past the text */
              className="-mx-2 flex min-w-0 flex-col gap-1 rounded-[8px] px-2 outline-none transition-opacity duration-200 focus-visible:bg-foreground/[0.06]"
              style={{ opacity: hot !== null && hot !== i ? 0.45 : 1 }}
            >
              <span className="flex items-center gap-1.5 whitespace-nowrap text-[10px] text-foreground/45">
                {renderIcon && c.icon ? (
                  <span aria-hidden className="inline-flex shrink-0">
                    {renderIcon(c.icon, 14)}
                  </span>
                ) : null}
                {c.label}
              </span>
              <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                {/* the running count changes in place on each tick: no re-entry, no flash (spec 13.4) */}
                <span className={cn("text-[12px] font-medium", live ? "text-foreground/70" : "text-foreground/90")}>{c.value}</span>
                {c.delta && (
                  <span className="text-[10px] font-medium" style={{ color: /^[-−]/.test(c.delta.trim()) ? RED : GREEN }}>
                    {c.delta}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      <div role="status" className="mt-2.5 h-[14px] text-[10.5px] leading-[14px] text-foreground/45">
        {shown && (
          /* the line swaps in place as the pointer moves between cells */
          <motion.span
            key={hot}
            className="inline-block"
            initial={reduced ? { opacity: 0 } : SWAP_FROM}
            animate={SWAP_TO}
            transition={{ duration: 0.15, ease: EASE }}
          >
            <span className="font-medium text-foreground/90">{shown.label}</span>
            {shown.hint ? `: ${shown.hint}` : ""}
          </motion.span>
        )}
      </div>
    </div>
  )
}
