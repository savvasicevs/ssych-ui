"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { RowAction, useRowExit } from "@/components/ui/row-action"

/* Onboarding Checklist, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the check marks are filled discs, not outlined rings: a faint disc when open, a solid
     ink one with the tick cut out of it when done
   · done is green on the discs and on the bar: a done step is a pass (given back 2026-09-30)
   · the title is plain sentence-case text with no letter spacing
   · pointing at a step dims the others; the list, the bar and the count name themselves
   · every figure is tabular, colours come from tokens only, nothing moves for over 400ms
   Formula: progress = steps done ÷ steps, the width of the bar (read as "2 of 4" in its aria-label).
   2026-10-02 audit: a step does something now (his note: components still missed their
   interactions). Each open step carries a "Start" at the row's end, up on hover or focus
   and always shown on touch; it hands the step to `onStart` (which opens the task), holds a
   tick and "Started" for 420ms, then the step's disc fills and its tick draws. The disc and
   the label stay one button that ticks or unticks a step by hand. The "2 / 4" beside the
   title said what the bar says, so it moved into the bar's aria-label. Rows are 12.5px with
   20px discs, the sizes of the Setup Stepper, and a done step reads at 50% with its strike
   (it faded to 35%). New optional `onStart`.
   2026-10-02 round 2: the steps are an exchange account's onboarding in place of an email
   product's setup: verify identity, fund the account, create an API key, place your first
   order, with identity already done (1 of 4). The title reads "Start trading". */

const EASE = [0.16, 1, 0.3, 1] as const
/* done is a pass: the disc and the bar carry the up green (colour pass, 2026-09-30) */
const GREEN = "var(--chart-up)"

export interface ChecklistStep {
  id: string
  label: string
}

const DEFAULT_STEPS: ChecklistStep[] = [
  { id: "identity", label: "Verify your identity" },
  { id: "fund", label: "Fund the account" },
  { id: "key", label: "Create an API key" },
  { id: "order", label: "Place your first order" },
]

/**
 * Setup checklist: start a step from its row, or press a step to tick it by hand. The disc
 * fills, the tick draws in, the label steps back, and the thin bar keeps the score.
 */
export function OnboardingChecklist({
  steps = DEFAULT_STEPS,
  initiallyDone = ["identity"],
  title = "Start trading",
  onToggle,
  onStart,
  className,
}: {
  steps?: ChecklistStep[]
  /** Ids that start in the completed state. */
  initiallyDone?: string[]
  title?: string
  onToggle?: (id: string, done: boolean) => void
  /** the row's Start was pressed: open the task; the step ticks itself once it has */
  onStart?: (id: string) => void
  className?: string
}) {
  const reduced = useReducedMotion()
  const [done, setDone] = useState<Set<string>>(new Set(initiallyDone))
  const [hot, setHot] = useState<string | null>(null)
  const { leaving, start } = useRowExit()

  const mark = (id: string, value: boolean) =>
    setDone((prev) => {
      if (prev.has(id) === value) return prev
      const next = new Set(prev)
      if (value) next.add(id)
      else next.delete(id)
      onToggle?.(id, value)
      return next
    })

  const share = done.size / Math.max(1, steps.length)

  return (
    <div className={cn("w-[320px] max-w-full tabular-nums", className)} role="group" aria-label={`${title}, ${done.size} of ${steps.length} done`}>
      <div className="text-[13px] font-medium text-foreground/90">{title}</div>

      <div
        role="progressbar"
        aria-label={`Steps done, ${done.size} of ${steps.length}`}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done.size}
        className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-foreground/[0.06]"
      >
        <motion.div
          className="h-full origin-left rounded-full"
          style={{ background: GREEN }}
          animate={{ scaleX: share }}
          initial={false}
          transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }}
        />
      </div>

      <div className="mt-4 flex flex-col" onPointerLeave={() => setHot(null)}>
        {steps.map((s, i) => {
          const on = done.has(s.id)
          return (
            /* steps rise in once, 35ms apart, the stagger capped at the first eight */
            <motion.div
              key={s.id}
              className={cn(
                "group -mx-2 flex items-center gap-2 rounded-[12px] px-2 transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.04] has-[:focus-visible]:bg-foreground/[0.06]",
                hot !== null && hot !== s.id && "opacity-50",
              )}
              onPointerEnter={() => setHot(s.id)}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
            >
              <button
                type="button"
                onClick={() => mark(s.id, !on)}
                onFocus={() => setHot(s.id)}
                onBlur={() => setHot(null)}
                aria-pressed={on}
                aria-label={`${s.label}, ${on ? "done" : "to do"}`}
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left outline-none transition-transform duration-150 active:scale-[0.98] motion-reduce:active:scale-100"
              >
                <span
                  aria-hidden
                  className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors duration-150", !on && "bg-foreground/[0.08]")}
                  style={on ? { background: GREEN } : undefined}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <motion.path
                      d="M1.5 5.2 4 7.6 8.5 2.4"
                      stroke="var(--background)"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={false}
                      animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
                      // the disc fills first, then the tick draws in after it (transitions.dev checkbox)
                      transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: on ? 0.1 : 0 }}
                    />
                  </svg>
                </span>
                <span
                  className={cn(
                    "truncate text-[12.5px] transition-colors duration-200",
                    on ? "text-foreground/50 line-through decoration-foreground/25" : "text-foreground/70 group-hover:text-foreground/90",
                  )}
                >
                  {s.label}
                </span>
              </button>
              {/* the row's action, in its own end column so it never sits over the label */}
              <span className="flex w-[72px] shrink-0 justify-end">
                {!on && (
                  <RowAction
                    label="Start"
                    doneLabel="Started"
                    tone={GREEN}
                    aria-label={`Start: ${s.label}`}
                    done={leaving === s.id}
                    disabled={leaving !== null && leaving !== s.id}
                    onClick={() => {
                      onStart?.(s.id)
                      start(s.id, () => mark(s.id, true))
                    }}
                  />
                )}
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
