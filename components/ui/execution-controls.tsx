"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Execution Controls, written new through ssych-component (2026-09-29).
   What it is for: firing an order on purpose. One button carries the order from the press
   to the fill, and an undo line follows the fill for a few seconds.
   Read first: the button's label. It is the state of the order.
   The pointer: press and hold, and a fill sweeps the button; let go early and it runs
   back; held to the end, the order goes out and the label reads working, then filled at
   the price, or rejected. Space and Enter hold it from the keyboard. Undo is a button.
   Sketch used: src/components/lab/ExecutionControls.tsx. Kept: hold to confirm with the
   sweep and the run back, the working, filled and rejected states, the timed undo with its
   draining hairline, green for a buy and red for a sell.
   Changed: no outline around the button or the undo strip, icons and the spinner became
   words, the price is a number and the order has a size so the value under the button can
   be worked out (the sketch took the price as text).
   Formulas:
   · order value  size × price
   · hold         the sweep covers the button in hold time; the order fires at the end
   · undo         the hairline drains over the undo window, then the line leaves */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const WORKING_MS = 1200
const REJECT_SETTLE_MS = 2200

type Phase = "idle" | "working" | "filled" | "rejected"

export interface ExecutionControlsProps {
  /** action verb; Buy or Sell from the side when left out */
  label?: string
  symbol?: string
  /** shares in the order */
  size?: number
  /** the price it fills at, in dollars */
  price?: number
  side?: "buy" | "sell"
  /** how long the press has to be held before the order fires */
  holdMs?: number
  /** how long the undo line stays after a fill */
  undoMs?: number
  /** end in the rejected state in place of a fill */
  simulateReject?: boolean
  workingLabel?: string
  rejectLabel?: string
  undoLabel?: string
  onConfirm?: () => void
  onUndo?: () => void
  className?: string
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

/**
 * One button for the whole life of an order: held to confirm, working, then filled at the
 * price or rejected. A fill is followed by an undo line that drains and leaves.
 */
export function ExecutionControls({
  label,
  symbol = "TSLA",
  size = 25,
  price = 178.52,
  side = "buy",
  holdMs = 900,
  undoMs = 5000,
  simulateReject = false,
  workingLabel = "Working…",
  rejectLabel = "Rejected, insufficient margin",
  undoLabel = "Order filled",
  onConfirm,
  onUndo,
  className,
}: ExecutionControlsProps) {
  const reduced = useReducedMotion()
  const hue = side === "sell" ? RED : GREEN
  const verb = label ?? (side === "sell" ? "Sell" : "Buy")
  const value = size * price

  const [phase, setPhase] = useState<Phase>("idle")
  const [holding, setHolding] = useState(false)
  const progress = useMotionValue(0)
  const sweep = useRef<ReturnType<typeof animate> | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef<Phase>("idle")
  phaseRef.current = phase

  const fire = useCallback(() => {
    sweep.current?.stop()
    sweep.current = null
    progress.set(0)
    setHolding(false)
    setPhase("working")
    onConfirm?.()
  }, [onConfirm, progress])

  const startHold = useCallback(() => {
    if (phaseRef.current !== "idle" || holdTimer.current || sweep.current) return
    setHolding(true)
    if (reduced) {
      /* no sweep: a plain timed hold on a still face */
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null
        fire()
      }, holdMs)
      return
    }
    sweep.current = animate(progress, 1, { duration: holdMs / 1000, ease: "linear", onComplete: fire })
  }, [fire, holdMs, reduced, progress])

  const endHold = useCallback(() => {
    setHolding(false)
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    if (sweep.current) {
      sweep.current.stop()
      sweep.current = null
      /* let go early: the fill runs back */
      animate(progress, 0, { duration: 0.3, ease: EASE })
    }
  }, [progress])

  useEffect(() => {
    if (phase === "working") {
      const t = setTimeout(() => setPhase(simulateReject ? "rejected" : "filled"), WORKING_MS)
      return () => clearTimeout(t)
    }
    if (phase === "rejected") {
      const t = setTimeout(() => setPhase("idle"), REJECT_SETTLE_MS)
      return () => clearTimeout(t)
    }
    if (phase === "filled") {
      const t = setTimeout(() => setPhase("idle"), undoMs)
      return () => clearTimeout(t)
    }
  }, [phase, simulateReject, undoMs])

  useEffect(
    () => () => {
      sweep.current?.stop()
      if (holdTimer.current) clearTimeout(holdTimer.current)
    },
    [],
  )

  const text =
    phase === "idle"
      ? `${verb} ${size} ${symbol}`
      : phase === "working"
        ? workingLabel
        : phase === "filled"
          ? `Filled at ${usd(price)}`
          : rejectLabel
  const colour = phase === "working" ? undefined : ink(phase === "filled" ? GREEN : phase === "rejected" ? RED : hue)

  return (
    <div className={cn("w-[300px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}>
      <motion.button
        type="button"
        aria-busy={phase === "working"}
        aria-label={phase === "idle" ? `Hold to ${verb.toLowerCase()} ${size} ${symbol} at ${usd(price)}` : text}
        animate={{
          scale: holding && !reduced ? 0.98 : 1,
          x: phase === "rejected" && !reduced ? [0, -5, 5, -3, 3, 0] : 0,
        }}
        transition={{ scale: { duration: 0.18, ease: EASE }, x: { duration: 0.3, ease: "easeInOut" } }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          startHold()
        }}
        onPointerUp={endHold}
        onPointerCancel={endHold}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault()
            startHold()
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") endHold()
        }}
        onBlur={endHold}
        className={cn(
          "relative h-11 w-full select-none overflow-hidden rounded-full text-[13px] font-semibold text-foreground/90 outline-none transition-colors duration-200",
          phase === "idle" ? "cursor-pointer hover:bg-foreground/[0.1] focus-visible:bg-foreground/[0.1]" : "cursor-default",
        )}
        style={{
          background: phase === "filled" ? mix(GREEN, 12) : phase === "rejected" ? mix(RED, 12) : holding && reduced ? mix(hue, 22) : undefined,
          touchAction: "none",
        }}
      >
        <span aria-hidden className="absolute inset-0 bg-foreground/[0.06]" />
        {!reduced && phase === "idle" && (
          <motion.span aria-hidden className="absolute inset-0" style={{ scaleX: progress, transformOrigin: "left", background: mix(hue, 24) }} />
        )}
        <AnimatePresence mode="wait" initial={false}>
          {/* the label is the state: it swaps in place (text swap: 4px, 2px blur, 150ms); reduced
              motion keeps the cross-fade and drops the travel and the blur */}
          <motion.span
            key={phase}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
            transition={{ duration: 0.15, ease: EASE }}
            className="relative block whitespace-nowrap"
            style={{ color: colour }}
          >
            {phase === "working" && !reduced ? (
              /* while the order works, a highlight sweeps the label (transitions.dev shimmer text) */
              <motion.span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, color-mix(in srgb, var(--foreground) 45%, transparent) 35%, color-mix(in srgb, var(--foreground) 95%, transparent) 50%, color-mix(in srgb, var(--foreground) 45%, transparent) 65%)",
                  backgroundSize: "200% 100%",
                }}
                initial={{ backgroundPosition: "100% 0%" }}
                animate={{ backgroundPosition: "-100% 0%" }}
                transition={{ duration: 1.2, ease: "linear", repeat: Infinity }}
              >
                {text}
              </motion.span>
            ) : (
              text
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <div role="status" className="mt-2 px-1 text-[11px] text-foreground/45">
        <AnimatePresence mode="wait" initial={false}>
          {phase === "filled" ? (
            <motion.div
              key="undo"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.2, ease: EASE }}
              className="relative flex items-center justify-between pb-2"
            >
              <span>
                {undoLabel} · {size} {symbol} · {usd(value)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPhase("idle")
                  onUndo?.()
                }}
                className="h-6 rounded-full px-2 text-[11px] font-medium text-foreground/90 outline-none transition-[background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.08] focus-visible:bg-foreground/[0.08] active:scale-[0.97]"
              >
                Undo
              </button>
              {/* drains over the undo window, end to end */}
              <motion.span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-px"
                style={{ transformOrigin: "left", background: mix("var(--foreground)", 35) }}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: reduced ? 1 : 0 }}
                transition={reduced ? { duration: 0 } : { duration: undoMs / 1000, ease: "linear" }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="rest"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.15, ease: EASE }}
              className="flex items-center justify-between pb-2"
            >
              <span>
                {size} {symbol} at {usd(price)}
              </span>
              <span className="text-foreground/90">{usd(value)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
