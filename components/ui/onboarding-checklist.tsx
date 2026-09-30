"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Onboarding Checklist, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the check marks are filled discs, not outlined rings: a faint disc when open, a solid
     ink one with the tick cut out of it when done
   · done is green on the discs and on the bar: a done step is a pass (given back 2026-09-30)
   · the title is plain sentence-case text with no letter spacing
   · pointing at a step dims the others; the list, the bar and the count name themselves
   · every figure is tabular, colours come from tokens only, nothing moves for over 400ms */

const EASE = [0.16, 1, 0.3, 1] as const
/* done is a pass: the disc and the bar carry the up green (colour pass, 2026-09-30) */
const GREEN = "var(--chart-up)"

export interface ChecklistStep {
  id: string
  label: string
}

const DEFAULT_STEPS: ChecklistStep[] = [
  { id: "domain", label: "Verify your domain" },
  { id: "key", label: "Create an API key" },
  { id: "send", label: "Send your first email" },
  { id: "webhook", label: "Add a delivery webhook" },
]

/**
 * Setup checklist: press a step to complete it. The disc fills, the tick draws in, the
 * label steps back, and the thin bar plus the count keep the score (done / total).
 */
export function OnboardingChecklist({
  steps = DEFAULT_STEPS,
  initiallyDone = ["domain"],
  title = "Get set up",
  onToggle,
  className,
}: {
  steps?: ChecklistStep[]
  /** Ids that start in the completed state. */
  initiallyDone?: string[]
  title?: string
  onToggle?: (id: string, done: boolean) => void
  className?: string
}) {
  const reduced = useReducedMotion()
  const [done, setDone] = useState<Set<string>>(new Set(initiallyDone))
  const [hot, setHot] = useState<string | null>(null)

  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onToggle?.(id, next.has(id))
      return next
    })

  const share = done.size / Math.max(1, steps.length)

  return (
    <div className={cn("w-[320px] tabular-nums", className)} role="group" aria-label={`${title}, ${done.size} of ${steps.length} done`}>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-foreground/90">{title}</span>
        <span role="status" className="text-[11px] text-foreground/45">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={done.size}
              className="inline-block"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
              transition={{ duration: 0.15, ease: EASE }}
            >
              {done.size} / {steps.length}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Steps done"
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
              className="flex flex-col"
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
            >
            <button
              type="button"
              onClick={() => toggle(s.id)}
              onPointerEnter={() => setHot(s.id)}
              onFocus={() => setHot(s.id)}
              onBlur={() => setHot(null)}
              aria-pressed={on}
              className={cn(
                "group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-left outline-none transition-[opacity,background-color,transform,translate,scale,rotate] duration-200 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] active:scale-[0.98]",
                hot !== null && hot !== s.id && "opacity-50",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full transition-colors duration-150",
                  !on && "bg-foreground/[0.08]",
                )}
                style={on ? { background: GREEN } : undefined}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
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
                  "text-[13px] transition-colors duration-200",
                  on ? "text-foreground/35 line-through decoration-foreground/20" : "text-foreground/70 group-hover:text-foreground/90",
                )}
              >
                {s.label}
              </span>
            </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
