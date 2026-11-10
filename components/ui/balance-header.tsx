// provenance: original
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
   Props are unchanged.
   2026-10-02 audit: it reads from the left like every other header now, on the three tiers
   of spec 14.1: a 12px label row ("Total balance" /45 left, the hide control right, where
   it no longer floats beside the figure), the 26px figure with leading-none 12px under it,
   and a 12px sub line 8px under that, the move font-medium in its hue then the period /45.
   The move reads "+$1,204.32 (+1.9%)", no middle dot. The hide control shows on hover or
   focus, and always where there is no hover.
   2026-11-10: a peek. While the balances are hidden, pressing and holding the dots shows
   the real figures, and letting go masks them again; the privacy setting itself never
   changes, so there is nothing to remember to switch back. The peek starts 150ms into the
   press, so a tap does nothing, and it uses the same swap as the hide control (4px, 2px
   blur, 150ms), both ways. Leaving the dots, a cancelled touch or the window losing focus
   all count as letting go. By keyboard: focus the dots and hold Space or Enter.
   Formulas:
   · percent  change ÷ (total − change) × 100, the move over the balance it moved from,
              unless the caller passes changePct */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

/** Σ of the sample book the portfolio family quotes from */
const DEFAULT_TOTAL = 64025.65
const DEFAULT_CHANGE = 1204.32

const MASK = "••••••"
/** how far into a press the peek starts; anything shorter is a tap and shows nothing */
const PEEK_MS = 150

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
 * for it, then masks every figure to dots. Held down, the dots give the figures back for
 * as long as the press lasts.
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
  /* a peek shows the figures while the dots are held; `hidden`, the setting, stays as it is */
  const [peek, setPeek] = useState(false)
  const hold = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const masked = hidden && !peek
  const reduced = useReducedMotion()

  const press = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPeek(true), PEEK_MS)
  }
  const release = useCallback(() => {
    window.clearTimeout(timer.current)
    setPeek(false)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  /* a release that never arrives (the window lost focus mid press) must not leave the
     figures on show; the listener goes on the window the dots are drawn in */
  useEffect(() => {
    if (!hidden) return
    const view = hold.current?.ownerDocument.defaultView
    view?.addEventListener("blur", release)
    return () => view?.removeEventListener("blur", release)
  }, [hidden, release])
  const up = change >= 0
  const hue = up ? GREEN : RED
  const sign = up ? "+" : "−"
  /* the move over the balance it moved FROM, so the two numbers agree */
  const pct = changePct ?? (change / (total - change || 1)) * 100
  const move = `${sign}${usd(Math.abs(change))} (${sign}${Math.abs(pct).toFixed(1)}%)`

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
      className={cn("group flex w-max min-w-[200px] flex-col items-stretch tabular-nums", className)}
      role="group"
      aria-label={masked ? "Total balance, hidden" : `Total balance ${usd(total)}${delta ? `, ${move} over ${period}` : ""}`}
    >
      <motion.div {...rise(0)} className="mb-3 flex items-baseline justify-between gap-3 text-[12px]">
        <span className="text-foreground/45">Total balance</span>
        {/* the hide control sits at the row's end, so it never nudges the figure; it keeps
            the 12px row by bleeding into the padding around it */}
        <button
          type="button"
          onClick={() => {
            release()
            setHidden((h) => !h)
          }}
          aria-label={hidden ? "Show balances" : "Hide balances"}
          aria-pressed={hidden}
          className="-my-1.5 -mr-1.5 grid h-6 w-6 self-center place-items-center rounded-full text-foreground/60 opacity-0 outline-none transition-[opacity,color,background-color,transform,translate,scale,rotate] duration-200 active:scale-[0.97] hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:bg-foreground/[0.06] focus-visible:opacity-100 group-hover:opacity-100 motion-reduce:active:scale-100 [@media(hover:none)]:opacity-100"
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
              {hidden ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
            </motion.span>
          </AnimatePresence>
        </button>
      </motion.div>

      {/* the line is as wide as its figure, so the hold target below covers the dots and not the row */}
      <motion.p {...rise(0.035)} role="status" className="relative m-0 self-start text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
        {/* the hold target lies over the dots while they are hidden: a real button, 38px tall
            (the figure plus 6px each way), its corner 37.5% of that. It stays put while the
            text under it swaps, so the press is never lost mid peek */}
        {hidden && (
          <button
            ref={hold}
            type="button"
            aria-label="Hold to show the balance"
            title="Hold to peek"
            onPointerDown={(e) => {
              if (e.button === 0 && e.isPrimary) press()
            }}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) press()
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") release()
            }}
            onBlur={release}
            onContextMenu={(e) => e.preventDefault()}
            className="peer absolute -inset-x-1.5 -inset-y-1.5 z-10 select-none rounded-[14px] outline-none transition-colors duration-150 [-webkit-touch-callout:none] hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06]"
          />
        )}
        <AnimatePresence mode="wait" initial={false}>
          {/* the text sinks 3% under the press, so the hold is answered before the peek starts */}
          <motion.span
            key={masked ? "mask" : "figure"}
            {...swap}
            className="inline-block transition-[scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] peer-active:scale-[0.97] motion-reduce:peer-active:scale-100"
          >
            {masked ? (
              MASK
            ) : (
              <>
                {whole}
                {cents && <span className="text-foreground/35">.{cents}</span>}
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </motion.p>

      {delta && (
        <motion.div {...rise(0.07)} className="mt-2 flex items-baseline gap-1.5 text-[12px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={masked ? "mask" : "move"}
              {...swap}
              className="inline-block font-medium"
              style={{ color: masked ? "color-mix(in srgb, var(--foreground) 45%, transparent)" : hue }}
            >
              {masked ? MASK : move}
            </motion.span>
          </AnimatePresence>
          <span className="text-foreground/45">{period}</span>
        </motion.div>
      )}
    </div>
  )
}
