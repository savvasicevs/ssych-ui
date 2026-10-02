"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Comb Rows, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the accent comes from the token, not from a typed colour: the comb of the subject, or
     of the row being pointed at, takes it, every other comb is ink
   · every figure is tabular, the one in the caption included
   · pointing at a row, or tabbing to it, keeps it full and dims the others, and the
     caption turns into that row's readout: its value and how far it sits from the subject
   · the comparison names itself to a screen reader, every row carries its own label
   Motion (2026-10-01): once the rows first come into view they settle in 4px apart by 40ms
   and their ticks grow out of the middle line left to right, 4ms apart, all in about 800ms.
   A new value walks the cursor tick: heights and inks tween over 300ms. The ticks are CSS
   transitions on transform, not 230 motion nodes. Reduced motion draws the end state. */

const EASE = [0.16, 1, 0.3, 1] as const
const ACCENT = "var(--chart-1)"
const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`

export interface CombRow {
  label: string
  value: number
}

const DEFAULT_ROWS: CombRow[] = [
  { label: "EBAY", value: 10.7 },
  { label: "GOOGL", value: 22.9 },
  { label: "META", value: 28.9 },
  { label: "MSFT", value: 36 },
  { label: "AMZN", value: 42.2 },
]

const TICKS = 46
const EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)"
/** every tick is drawn at the cursor height and scaled down to its own, so a height change is a transform */
const TALL = 13

/**
 * A comparison in the Ink register: every row is a ruler of ticks, the cursor tick
 * stands taller at the value, and the subject row's comb carries the accent. Pointing at
 * another row hands it the accent, dims the rest and reads it against the subject in
 * place of the caption. The ticks grow in row by row on mount.
 */
export function CombRows({
  title = "P/E ratio",
  caption = "AMZN is 95% above sector average",
  rows = DEFAULT_ROWS,
  subject = "AMZN",
  max = 50,
  className,
}: {
  title?: string
  caption?: string
  rows?: CombRow[]
  /** the row that carries the accent while nothing is hovered */
  subject?: string
  /** the value at the end of the ruler */
  max?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const shown = seen || !!reduced
  /* once the grow-in has landed, a value change tweens at once instead of on the stagger */
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!seen) return
    const t = setTimeout(() => setSettled(true), 900)
    return () => clearTimeout(t)
  }, [seen])
  const [hot, setHot] = useState<string | null>(null)

  const base = rows.find((r) => r.label === subject)
  const pointed = rows.find((r) => r.label === hot)
  /* the pointed row against the subject: value ÷ subject's value − 1 */
  const readout = (() => {
    if (!pointed || pointed.label === subject) return caption
    if (!base || base.value === 0) return `${pointed.label} ${pointed.value} of ${max}`
    const gap = (pointed.value / base.value - 1) * 100
    return `${pointed.label} ${pointed.value}, ${Math.abs(gap).toFixed(0)}% ${gap < 0 ? "below" : "above"} ${subject}`
  })()

  return (
    <div ref={rootRef} className={cn("w-[320px] tabular-nums", className)} role="group" aria-label={`${title}, ${rows.length} rows${base ? `, ${subject} ${base.value}` : ""}`}>
      <div className="text-center">
        <div className="text-[13px] font-medium text-foreground/90">{title}</div>
        <div role="status" className="mt-0.5 text-[10.5px] text-foreground/45">
          {/* the caption swaps in place: a 4px rise through a 2px blur */}
          <motion.span
            key={readout}
            className="inline-block"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            {readout}
          </motion.span>
        </div>
      </div>

      <div className="mt-4 flex flex-col" role="list" onPointerLeave={() => setHot(null)}>
        {rows.map((r, ri) => {
          const cursor = Math.round((r.value / max) * TICKS)
          const active = hot === r.label || (hot === null && r.label === subject)
          const dim = hot !== null && hot !== r.label
          return (
            /* the outer row owns the dim so it never fights the entrance inside */
            <div
              key={r.label}
              role="listitem"
              tabIndex={0}
              aria-label={`${r.label} ${r.value} of ${max}`}
              onPointerEnter={() => setHot(r.label)}
              onFocus={() => setHot(r.label)}
              onBlur={() => setHot(null)}
              className="-mx-2 rounded-[4px] outline-none transition-[opacity,background-color] duration-200 focus-visible:bg-foreground/[0.06]"
              style={{ opacity: dim ? 0.45 : 1 }}
            >
              <motion.div
                className="flex items-center gap-3 px-2 py-[7px]"
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
                transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: ri * 0.04 }}
              >
                <span className={cn("w-[52px] shrink-0 text-[11.5px] font-medium transition-colors duration-150", active ? "text-foreground/90" : "text-foreground/45")}>{r.label}</span>
                <span className="flex h-4 flex-1 items-center gap-[2.5px]" aria-hidden>
                  {Array.from({ length: TICKS }, (_, t) => {
                    const isCursor = t === cursor
                    const filled = t < cursor
                    const h = isCursor ? TALL : filled ? 8 : 5
                    return (
                      <span
                        key={t}
                        className="w-px rounded-full"
                        style={{
                          height: TALL,
                          transform: `scaleY(${shown ? h / TALL : 0})`,
                          background: isCursor
                            ? active
                              ? ACCENT
                              : ink(85)
                            : filled
                              ? active
                                ? `color-mix(in srgb, ${ACCENT} 55%, transparent)`
                                : ink(28)
                              : ink(10),
                          /* the grow-in carries the stagger; after it lands a value change tweens at once */
                          transition: reduced
                            ? "none"
                            : settled
                              ? `transform 0.3s ${EASE_CSS}, background 150ms`
                              : `transform 0.45s ${EASE_CSS} ${(ri * 0.04 + t * 0.004).toFixed(3)}s, background 150ms`,
                        }}
                      />
                    )
                  })}
                </span>
                <span className={cn("w-[36px] shrink-0 text-right text-[11px] transition-colors duration-150", active ? "text-foreground/90" : "text-foreground/45")}>{r.value}</span>
              </motion.div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
