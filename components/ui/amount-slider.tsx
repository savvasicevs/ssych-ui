"use client"

import { useId, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Amount Slider, written new through ssych-component (2026-09-29).
   What it is for: choosing how much of a balance to use, as a share of it. The share is
   always shown with the amount and the value it comes to.
   Read first: the large percentage.
   The pointer: drag the rail or use the arrow keys on it; the four pills jump to a
   quarter, a half, three quarters and all of it. Both write the same value. While the rail
   is pointed at or held, its fill takes the accent.
   Sketch used: src/components/lab/AmountSliderPro.tsx. Kept: the rail and the quarter
   pills driving one value, the share paired with the amount it resolves to.
   Changed: the rail and the chosen pill are ink at rest (they were blue), the pills are the
   quiet round ones with one sliding fill, the thumb has no shadow, and the value in
   dollars was added beside the amount.
   Formulas:
   · amount  balance × share ÷ 100
   · value   amount × price */

const TAB_EASE = [0.22, 1, 0.36, 1] as const
const SMOOTH = "cubic-bezier(0.22, 1, 0.36, 1)"
const ACCENT = "var(--chart-1)"
const STOPS = [25, 50, 75, 100]
const THUMB = 14

export interface AmountSliderProps {
  /** amount held */
  balance?: number
  symbol?: string
  /** price in dollars */
  price?: number
  /** opening share, 0 to 100 */
  defaultPercent?: number
  onChange?: (percent: number, amount: number) => void
  className?: string
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const upTo = (n: number, dp: number) => n.toLocaleString("en-US", { maximumFractionDigits: dp })

/**
 * Share of balance selector: a rail and four pills that write one value, read back as the
 * share, the amount and what that amount is worth.
 */
export function AmountSlider({ balance = 4.1, symbol = "ETH", price = 3050, defaultPercent = 50, onChange, className }: AmountSliderProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const [pct, setPct] = useState(defaultPercent)
  const [hot, setHot] = useState(false)
  /* a pill press glides the thumb and the fill there (250ms); dragging and the arrow keys
     move them at once, so a held key never trails */
  const [glide, setGlide] = useState(false)
  const amount = (balance * pct) / 100
  const value = amount * price

  const set = (v: number) => {
    setPct(v)
    onChange?.(v, (balance * v) / 100)
  }
  /* the thumb stays inside the rail at both ends */
  const at = `calc(${THUMB / 2}px + ${pct / 100} * (100% - ${THUMB}px))`
  /* both move on transform and clip-path only, never width or left */
  const move = glide && !reduced ? `transform 250ms ${SMOOTH}, clip-path 250ms ${SMOOTH}, background 150ms` : "background 150ms"

  return (
    <div className={cn("w-[300px] max-w-full tabular-nums", className)}>
      <div role="status" className="flex items-baseline justify-between">
        {/* a pressed stop swaps the figure in (text swap: 4px, 2px blur, 150ms); a drag writes it live */}
        <motion.span
          key={glide ? pct : "live"}
          initial={reduced ? { opacity: 0.4 } : { opacity: 0.4, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: TAB_EASE }}
          className="inline-block text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90"
        >
          {pct}%
        </motion.span>
        <span className="text-[11px] text-foreground/45">
          <span className="text-foreground/90">
            {upTo(amount, 4)} {symbol}
          </span>{" "}
          · {usd(value)}
        </span>
      </div>

      <div className="relative mt-3 h-5" onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)}>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => {
            setGlide(false)
            set(Number(e.target.value))
          }}
          onFocus={() => setHot(true)}
          onBlur={() => setHot(false)}
          aria-label={`Share of the ${symbol} balance`}
          aria-valuetext={`${pct}%, ${upTo(amount, 4)} ${symbol}, ${usd(value)}`}
          className="peer absolute inset-0 m-0 h-full w-full cursor-ew-resize opacity-0"
        />
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-foreground/[0.08]" />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full"
          style={{
            clipPath: `inset(0 calc(100% - ${at}) 0 0 round 999px)`,
            background: hot ? ACCENT : "color-mix(in srgb, var(--foreground) 70%, transparent)",
            transition: move,
          }}
        />
        {/* the track the thumb travels is the rail less one thumb, so translateX(pct%) lands it */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 [.peer:active~&>span]:scale-110 [.peer:focus-visible~&>span]:scale-125"
          style={{ width: `calc(100% - ${THUMB}px)`, transform: `translateX(${pct}%)`, transition: move }}
        >
          <span
            className="absolute left-0 top-1/2 rounded-full bg-foreground transition-transform duration-150"
            style={{ width: THUMB, height: THUMB, marginTop: -THUMB / 2 }}
          />
        </span>
      </div>

      <div role="group" aria-label="Quick shares" className="mt-2 grid grid-cols-4">
        {STOPS.map((s) => {
          const on = pct === s
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              aria-label={s === 100 ? "All of the balance" : `${s}% of the balance`}
              onClick={() => {
                setGlide(true)
                set(s)
              }}
              className={cn(
                "relative h-7 rounded-full text-[11.5px] font-medium outline-none transition-[color,transform,translate,scale,rotate] duration-200 active:scale-[0.97]",
                on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90",
              )}
            >
              {on &&
                (reduced ? (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
                ) : (
                  <motion.span aria-hidden layoutId={`${uid}-stop`} className="absolute inset-0 rounded-full bg-foreground/[0.08]" transition={{ duration: 0.25, ease: TAB_EASE }} />
                ))}
              <span className="relative">{s === 100 ? "Max" : `${s}%`}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
