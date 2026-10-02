"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Dialog Stack, promoted through ssych-component (2026-09-29).
   What it is for: a task in a few steps where each step is its own dialog. A new step is
   laid on top of the one before, which stays in sight behind it, so how far in you are is
   something you can see.
   Read first: the top card. The edges of the earlier steps show above it.
   The pointer: the white button lays the next step on top, "Back" takes the top one off,
   Escape does the same, and the last step's button closes the whole stack. With the stack
   closed, one button opens it again.
   Sketch: lab/DialogStack. Kept the step shape (title, body, action), the pile that
   recedes in depth, the position marks, "N of M", and only the top card taking input.
   Changed: it sits in the flow of the page with no frame, no dotted ground and no dimmed
   backdrop; the cards are flat fills one ink step apart instead of outlined panels with a
   drop shadow; the action is the white primary button, not blue, and the position marks
   are ink; it starts two steps deep (`defaultDepth`) so the stack is there to be seen;
   Escape is heard while the focus is inside the stack, not window-wide.
   Formulas:
   · position = the card's step number over the number of steps
   · a card `b` places behind the top sits b × 10px higher, at 1 − b × 0.04 of its size */

/** the house layout spring: physical objects settling into a pile */
const SPRING = { type: "spring", stiffness: 400, damping: 32 } as const
const SMOOTH = [0.22, 1, 0.36, 1] as const

export interface DialogStackStep {
  /** short title, also the name of its dialog for a screen reader */
  title: string
  body: string
  /** label of the forward button; the last step's button closes the stack */
  action: string
}

export interface DialogStackProps {
  steps?: DialogStackStep[]
  /** how many dialogs are open at the start; 0 shows only the opening button */
  defaultDepth?: number
  /** label of the button that opens the first step */
  trigger?: string
  onDepthChange?: (depth: number) => void
  className?: string
}

const DEFAULT_STEPS: DialogStackStep[] = [
  { title: "Settings", body: "Workspace defaults apply to every new deploy in Sample Org.", action: "Next step" },
  { title: "Confirm plan", body: "Team plan, 12 seats, billed monthly. Nothing changes until sign off.", action: "Next step" },
  { title: "Sign off", body: "Your approval is recorded against the audit trail with a timestamp.", action: "Sign off" },
]

const PRIMARY =
  "h-7 rounded-full bg-foreground/[0.92] px-3.5 text-[11.5px] font-medium text-background outline-none transition-[background-color,transform,translate,scale,rotate] duration-150 ease-out hover:bg-foreground active:scale-[0.97] motion-reduce:active:scale-100"

/**
 * Dialogs that pile up instead of replacing each other. The top card takes input; the
 * steps before it stay visible behind.
 */
export function DialogStack({ steps = DEFAULT_STEPS, defaultDepth = 2, trigger = "Open settings", onDepthChange, className }: DialogStackProps) {
  const reduced = useReducedMotion()
  const [depth, setDepth] = useState(Math.max(0, Math.min(steps.length, defaultDepth)))
  const open = steps.slice(0, depth)

  const go = (d: number) => {
    const next = Math.max(0, Math.min(steps.length, d))
    setDepth(next)
    onDepthChange?.(next)
  }

  return (
    <div
      role="group"
      aria-label={depth ? `${steps[depth - 1].title}, step ${depth} of ${steps.length}` : "Dialogs closed"}
      onKeyDown={(e) => {
        if (e.key === "Escape" && depth > 0) go(depth - 1)
      }}
      className={cn("relative h-[208px] w-[320px] max-w-full tabular-nums", className)}
    >
      <AnimatePresence initial={false}>
        {depth === 0 ? (
          <motion.div
            key="trigger"
            className="absolute inset-0 grid place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15, ease: SMOOTH } }}
            transition={{ duration: 0.25, ease: SMOOTH }}
          >
            <button type="button" onClick={() => go(1)} className={PRIMARY}>
              {trigger}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {open.map((step, i) => {
          /* 0 is the top card; every card under it sits one place further back */
          const back = open.length - 1 - i
          const last = i === steps.length - 1
          return (
            <motion.div
              key={step.title}
              role="dialog"
              aria-modal="false"
              aria-label={step.title}
              aria-hidden={back > 0}
              /* 14 (the 28px buttons) + 16 padding = 30 */
              className={cn("absolute inset-x-0 bottom-0 origin-top rounded-[30px] p-4", back === 0 ? "" : "pointer-events-none")}
              style={{
                /* a solid fill, so the card under it never shows through */
                background: `color-mix(in srgb, var(--foreground) ${Math.max(3, 8 - back * 2)}%, var(--background))`,
                zIndex: 10 + i,
              }}
              /* a step opens from 0.96 with its fade in 250ms and settles into the pile on the
                 layout spring; taking it off is quicker, 150ms, with no spring */
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: reduced ? 1 : 1 - back * 0.04, y: reduced ? 0 : -back * 10 }}
              exit={
                reduced
                  ? { opacity: 0, transition: { duration: 0.15 } }
                  : { opacity: 0, scale: 0.96, y: 6, transition: { duration: 0.15, ease: SMOOTH } }
              }
              transition={reduced ? { duration: 0.15 } : { ...SPRING, opacity: { duration: 0.25, ease: SMOOTH } }}
            >
              <div className="transition-opacity duration-200" style={{ opacity: back === 0 ? 1 : 0.35 }}>
                <div className="text-[13px] font-medium text-foreground/90">{step.title}</div>
                <div className="mt-1.5 text-[11.5px] leading-relaxed text-foreground/45">{step.body}</div>

                <div className="mt-4 flex items-center gap-1.5">
                  {steps.map((s, k) => (
                    <span
                      key={s.title}
                      aria-hidden
                      className="h-1 rounded-full"
                      style={{ width: k === i ? 14 : 4, background: `color-mix(in srgb, var(--foreground) ${k === i ? 90 : 16}%, transparent)` }}
                    />
                  ))}
                  <span className="ml-auto text-[10px] text-foreground/35">
                    {i + 1} of {steps.length}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    tabIndex={back === 0 ? 0 : -1}
                    onClick={() => go(depth - 1)}
                    className="h-7 rounded-full px-3 text-[11.5px] text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 ease-out hover:bg-foreground/[0.08] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] active:scale-[0.97] motion-reduce:active:scale-100"
                  >
                    Back
                  </button>
                  <button type="button" tabIndex={back === 0 ? 0 : -1} onClick={() => go(last ? 0 : depth + 1)} className={PRIMARY}>
                    {step.action}
                  </button>
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
