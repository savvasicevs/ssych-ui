"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { BUTTON, BUTTON_PRIMARY, RAISED, SURFACE } from "@/components/ui/control-classes"

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
   are ink; it started two steps deep (`defaultDepth`) until the 2026-10-02 audit;
   Escape is heard while the focus is inside the stack, not window-wide.
   Formulas:
   · position = the card's step number over the number of steps (in the aria-label)
   · a card `b` places behind the top sits b × 10px higher, at 1 − b × 0.04 of its size
   2026-10-02 audit: it starts closed (defaultDepth 0): the button at rest, the steps open on
   a press. It takes the Modal's parts so the Dialog family steps at one size: 400 wide, a
   36px corner over 12px padding (36 = 24 + 12, the 48px pills), the title 15px medium set
   12px in, the body 12.5px at 60%, and the actions as a grid of two 48px pills 8px apart,
   Back on the control material and the step's action filled. The top card is raised
   (white in light, 12% ink in dark) and the cards behind it sit on the 7% surface, where
   they faded to 6% and 4% before. The position dots stay; the "2 of 3" beside them said
   the same, so the words moved to the aria-label. A press moves the focus to the new top
   card's action, and back to the opening button when the stack closes.
   2026-10-02 round 2: the sample is a withdrawal in place of workspace deploy settings and
   a team plan: withdraw 2.5 ETH, confirm the address and network, approve with 2FA, each
   step recorded to the audit trail. The trigger reads "Withdraw ETH".
   · amount that arrives = amount − network fee   (2.5 − 0.0012 = 2.4988 ETH) */

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
  /** how many dialogs are open at the start; 0 (the default) shows only the opening button */
  defaultDepth?: number
  /** label of the button that opens the first step */
  trigger?: string
  onDepthChange?: (depth: number) => void
  className?: string
}

const DEFAULT_STEPS: DialogStackStep[] = [
  { title: "Withdraw 2.5 ETH", body: "Network fee 0.0012 ETH, so 2.4988 ETH arrives. Each step is recorded to the audit trail.", action: "Continue" },
  { title: "Confirm the address and network", body: "0x7a3f…c91e on Ethereum mainnet, on your whitelist since Aug 14.", action: "Address is right" },
  { title: "Approve with 2FA", body: "Confirm in your authenticator app. The approval is logged with a timestamp.", action: "Approve" },
]

/**
 * Dialogs that pile up instead of replacing each other. The top card takes input; the
 * steps before it stay visible behind.
 */
export function DialogStack({ steps = DEFAULT_STEPS, defaultDepth = 0, trigger = "Withdraw ETH", onDepthChange, className }: DialogStackProps) {
  const reduced = useReducedMotion()
  const [depth, setDepth] = useState(Math.max(0, Math.min(steps.length, defaultDepth)))
  const open = steps.slice(0, depth)
  const root = useRef<HTMLDivElement>(null)
  /** set by a press, so the focus follows to the new top card (or the opening button) */
  const moved = useRef(false)

  const go = (d: number) => {
    const next = Math.max(0, Math.min(steps.length, d))
    moved.current = true
    setDepth(next)
    onDepthChange?.(next)
  }

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    const id = window.setTimeout(() => root.current?.querySelector<HTMLElement>("[data-top]")?.focus({ preventScroll: true }), 30)
    return () => window.clearTimeout(id)
  }, [depth])

  return (
    <div
      ref={root}
      role="group"
      aria-label={depth ? `${steps[depth - 1].title}, step ${depth} of ${steps.length}` : "Dialogs closed"}
      onKeyDown={(e) => {
        if (e.key === "Escape" && depth > 0) go(depth - 1)
      }}
      className={cn("relative h-[236px] w-[400px] max-w-full tabular-nums", className)}
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
            <button type="button" data-top="" onClick={() => go(1)} className={cn("h-9 px-4 text-[13px] font-medium", BUTTON)}>
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
              aria-label={`${step.title}, step ${i + 1} of ${steps.length}`}
              aria-hidden={back > 0}
              /* 36 = 24 (the 48px pills) + 12 padding, the Modal's corner; the top card is
                 raised, the ones behind it on the surface, both solid so nothing shows through */
              className={cn(
                "absolute inset-x-0 bottom-0 origin-top rounded-[36px] p-3 transition-colors duration-200",
                back === 0 ? RAISED : cn(SURFACE, "pointer-events-none"),
              )}
              style={{ zIndex: 10 + i }}
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
                <div className="pl-3 pr-3 pt-1 text-[15px] font-medium text-foreground/90">{step.title}</div>
                <div className="mt-1.5 px-3 text-[12.5px] leading-relaxed text-foreground/60">{step.body}</div>

                <div aria-hidden className="mt-4 flex items-center gap-1.5 px-3">
                  {steps.map((s, k) => (
                    <span
                      key={s.title}
                      className="h-1 rounded-full"
                      style={{ width: k === i ? 14 : 4, background: `color-mix(in srgb, var(--foreground) ${k === i ? 90 : 20}%, transparent)` }}
                    />
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    tabIndex={back === 0 ? 0 : -1}
                    onClick={() => go(depth - 1)}
                    className={cn("h-12 px-5 text-[14px] font-medium", BUTTON)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    data-top={back === 0 ? "" : undefined}
                    tabIndex={back === 0 ? 0 : -1}
                    onClick={() => go(last ? 0 : depth + 1)}
                    className={BUTTON_PRIMARY}
                  >
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
