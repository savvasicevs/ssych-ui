"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"

/* Balance Header, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · one large size, 26px, for the whole figure. The cents step back by ink, not by a
     second size (it was 44px dollars over 26px cents)
   · the label is sentence case at its own size, no capitals and no letter spacing
   · the figure is plain text, not a heading tag: the page owns the headings
   · the move is signed text in green or red. The tinted pill and the chevrons are gone,
     the + or − already says the direction
   · the hide control is a round button; the eye stays because it is the control
   · every figure is tabular, the header reads itself out as one status line
   Props are unchanged. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

/** Σ of the sample book the portfolio family quotes from */
const DEFAULT_TOTAL = 64025.65
const DEFAULT_CHANGE = 1204.32

const MASK = "••••••"

const usd = (n: number, dp = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`

export interface BalanceHeaderProps {
  /** the headline figure */
  total?: number
  /** absolute move over the period, signed */
  change?: number
  /** pass to own the percent; unpassed it derives from the move and the balance it moved from */
  changePct?: number
  /** draw the move under the total */
  delta?: boolean
  /** the period the move answers for */
  period?: string
  className?: string
}

/**
 * A wallet's headline number: a quiet label over the total with its cents stepped back,
 * the signed move beneath, and a hide control that stays out of the way until you reach
 * for it, then masks every figure to dots.
 */
export function BalanceHeader({
  total = DEFAULT_TOTAL,
  change = DEFAULT_CHANGE,
  changePct,
  delta = true,
  period = "24h",
  className,
}: BalanceHeaderProps) {
  const [hidden, setHidden] = useState(false)
  const reduced = useReducedMotion()
  const up = change >= 0
  const hue = up ? GREEN : RED
  const sign = up ? "+" : "−"
  /* the move over the balance it moved FROM, so the two numbers agree */
  const pct = changePct ?? (change / (total - change || 1)) * 100
  const move = `${sign}${usd(Math.abs(change))} · ${sign}${Math.abs(pct).toFixed(1)}%`

  const [whole, cents] = usd(total).split(".")

  const rise = (delay: number) => ({
    initial: reduced ? (false as const) : { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay },
  })

  /* hide / show swaps the text in place (transitions.dev text swap: 4px, 2px blur, 150ms);
     reduced motion keeps the cross-fade and drops the travel and the blur */
  const swap = {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    exit: reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" },
    transition: { duration: 0.15, ease: EASE },
  }

  return (
    <div
      className={cn("group flex flex-col items-center tabular-nums", className)}
      role="group"
      aria-label={hidden ? "Total balance, hidden" : `Total balance ${usd(total)}${delta ? `, ${move} over ${period}` : ""}`}
    >
      <motion.span {...rise(0)} className="text-[11px] font-medium text-foreground/45">
        Total balance
      </motion.span>

      {/* the control floats at the trailing edge so it never nudges the number off-axis */}
      <div className="relative mt-2 flex items-center justify-center">
        <motion.span {...rise(0.035)} role="status" className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={hidden ? "mask" : "figure"} {...swap} className="inline-block">
              {hidden ? (
                MASK
              ) : (
                <>
                  {whole}
                  {cents && <span className="text-foreground/35">.{cents}</span>}
                </>
              )}
            </motion.span>
          </AnimatePresence>
        </motion.span>
        <button
          type="button"
          onClick={() => setHidden((h) => !h)}
          aria-label={hidden ? "Show balances" : "Hide balances"}
          aria-pressed={hidden}
          className="absolute left-full ml-2 grid h-7 w-7 place-items-center rounded-full text-foreground/45 opacity-0 outline-none transition-[opacity,color,background-color,transform,translate,scale,rotate] duration-200 active:scale-[0.97] hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:bg-foreground/[0.06] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={hidden ? "off" : "on"}
              className="grid place-items-center"
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8, filter: "blur(2px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8, filter: "blur(2px)" }}
              transition={{ duration: 0.12, ease: EASE }}
            >
              {hidden ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>

      {delta && (
        <motion.div {...rise(0.07)} className="mt-2.5 flex items-baseline gap-2">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={hidden ? "mask" : "move"}
              {...swap}
              className="inline-block text-[12px] font-semibold"
              style={{ color: hidden ? "color-mix(in srgb, var(--foreground) 45%, transparent)" : hue }}
            >
              {hidden ? MASK : move}
            </motion.span>
          </AnimatePresence>
          <span className="text-[11px] text-foreground/45">{period}</span>
        </motion.div>
      )}
    </div>
  )
}
