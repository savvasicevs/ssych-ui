import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "#34C28A"

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
 * Setup checklist: click a step to complete it — the check draws in, the
 * label settles to ink, and the thin progress bar plus counter keep the
 * derivable score (done / total).
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
    <div className={cn("w-[320px]", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">{title}</span>
        <span className="tabular-nums text-[11px] text-white/45">
          {done.size} / {steps.length}
        </span>
      </div>

      <div className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full origin-left rounded-full"
          style={{ background: GREEN, opacity: 0.85 }}
          animate={{ scaleX: share }}
          initial={false}
          transition={reduced ? { duration: 0 } : { duration: 0.6, ease: EASE }}
        />
      </div>

      <div className="mt-4 flex flex-col">
        {steps.map((s) => {
          const on = done.has(s.id)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.02]"
            >
              <span
                className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors duration-300"
                style={{
                  borderColor: on ? "rgba(42,161,115,0.6)" : "rgba(255,255,255,0.14)",
                  background: on ? "rgba(42,161,115,0.12)" : "transparent",
                }}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                  <motion.path
                    d="M1.5 5.2 4 7.6 8.5 2.4"
                    stroke={GREEN}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={false}
                    animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE }}
                  />
                </svg>
              </span>
              <span
                className={cn(
                  "text-[13px] transition-colors duration-300",
                  on ? "text-white/35 line-through decoration-white/20" : "text-white/75 group-hover:text-white/90",
                )}
              >
                {s.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
