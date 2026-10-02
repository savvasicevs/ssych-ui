"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Setup Stepper, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: a short setup in order, showing which step is open, which are behind
   and which are still to come.
   Read first: the open step. It is the only title at full ink and the only one with its
   line of detail under it.
   The pointer: point at a step and the others dim. Press any step to go to it; Continue
   moves one on. The rail between the numbers fills as far as the open step, and a step
   left behind draws its check.
   Lab sketch: src/components/lab/SetupStepper.tsx. Kept: numbered coins on a vertical
   rail, a fill that climbs to the open step, the check that draws on a finished step, the
   detail under the open step, Continue. Changed: coins were outlined in green and blue,
   they are fills of one ink (finished is solid, open is mid, to come is faint); the rail
   fill was blue and sized by a fixed 82%, it is ink and drawn as one segment per gap, so
   it always ends on a coin; Continue is the white button and reads "Done" on the last
   step.
   Colour pass (2026-09-30): a finished step is done, so its coin is green again under the
   drawn check; open and to come stay ink.
   Formulas:
   · finished = steps before the open one (sample: 1 of 4)
   · position = open step + 1 of steps (sample: 2 of 4) */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
/** words that change in place re-enter 4px out of a 2px blur over 150ms */
const SWAP = {
  initial: { opacity: 0, y: 4, filter: "blur(2px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.15, ease: EASE },
} as const

export interface SetupStep {
  title: string
  body: string
}

export interface SetupStepperProps {
  steps?: SetupStep[]
  /** index of the step open at the start */
  initialActive?: number
  onChange?: (index: number) => void
  className?: string
}

const DEFAULT_STEPS: SetupStep[] = [
  { title: "Add your domain", body: "Name and region for sending." },
  { title: "Fill in DNS records", body: "DKIM and SPF at your provider." },
  { title: "Verify records", body: "Propagation is checked for you." },
  { title: "Send your first email", body: "One POST to /emails." },
]

const solid = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, var(--background))`

/**
 * A setup rail in the Resend register: numbered coins down a hairline, the open step
 * with its detail, finished steps checked. Any step can be pressed; the rail follows.
 */
export function SetupStepper({ steps = DEFAULT_STEPS, initialActive = 1, onChange, className }: SetupStepperProps) {
  const reduced = useReducedMotion()
  const last = steps.length - 1
  const [active, setActive] = useState(Math.max(0, Math.min(last, initialActive)))
  const [hot, setHot] = useState<number | null>(null)

  const go = (i: number) => {
    const to = Math.max(0, Math.min(last, i))
    setActive(to)
    onChange?.(to)
  }

  return (
    <div className={cn("w-full max-w-[300px] tabular-nums", className)} role="group" aria-label={`Setup, step ${active + 1} of ${steps.length}: ${steps[active]?.title ?? ""}`}>
      <ol className="flex flex-col" onPointerLeave={() => setHot(null)}>
        {steps.map((s, i) => {
          const done = i < active
          const on = i === active
          return (
            <li key={s.title} className="relative transition-opacity duration-200" style={{ opacity: hot !== null && hot !== i ? 0.45 : 1 }}>
              {/* the rail to the next coin: a faint track, and the ink that fills it once this step is behind */}
              {i < last && (
                <span aria-hidden className="absolute bottom-0 left-[10.5px] top-[22px] w-px bg-foreground/[0.08]">
                  <motion.span
                    className="block h-full w-full origin-top bg-foreground/70"
                    initial={false}
                    animate={{ scaleY: done ? 1 : 0 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
                  />
                </span>
              )}
              <button
                type="button"
                aria-current={on ? "step" : undefined}
                aria-label={`Step ${i + 1}, ${s.title}, ${done ? "finished" : on ? "open" : "to come"}`}
                onClick={() => go(i)}
                onPointerEnter={() => setHot(i)}
                onFocus={() => setHot(i)}
                onBlur={() => setHot(null)}
                className="group relative flex w-full items-start gap-3.5 rounded-lg pb-5 text-left outline-none"
              >
                <span
                  aria-hidden
                  className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[10px] font-medium transition-colors duration-200"
                  style={{
                    background: done ? GREEN : solid(on ? 22 : 8),
                    color: on ? "var(--foreground)" : "color-mix(in srgb, var(--foreground) 45%, transparent)",
                  }}
                >
                  {done ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <motion.path
                        d="M1.5 5.2 4 7.6 8.5 2.4"
                        stroke="var(--background)"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={reduced ? false : { pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="pt-[3px]">
                  <span
                    className={cn(
                      "block text-[12.5px] transition-colors duration-200",
                      on ? "font-medium text-foreground/90" : "text-foreground/45 group-hover:text-foreground/90 group-focus-visible:text-foreground/90",
                    )}
                  >
                    {s.title}
                  </span>
                  {on && (
                    <motion.span
                      className="mt-0.5 block text-[11px] text-foreground/45"
                      initial={reduced ? false : { opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
                    >
                      {s.body}
                    </motion.span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => go(active + 1)}
          disabled={active === last}
          className="h-7 rounded-full bg-foreground px-3.5 text-[11px] font-medium text-background outline-none transition-[opacity,scale] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 motion-reduce:active:scale-100"
        >
          <motion.span key={active === last ? "done" : "continue"} className="inline-block" {...SWAP} initial={reduced ? { opacity: 0 } : SWAP.initial}>
            {active === last ? "Done" : "Continue"}
          </motion.span>
        </button>
        <span role="status" className="text-[10.5px] text-foreground/45">
          <motion.span key={active} className="inline-block" {...SWAP} initial={reduced ? { opacity: 0 } : SWAP.initial}>
            Step {active + 1} of {steps.length} · {active} finished
          </motion.span>
        </span>
      </div>
    </div>
  )
}
