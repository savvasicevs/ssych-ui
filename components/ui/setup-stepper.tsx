"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { BUTTON_PRIMARY } from "@/components/ui/control-classes"

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
   Formulas (read in the aria-labels):
   · finished = steps before the open one (sample: 1 of 4), every step once finished
   · position = open step + 1 of steps (sample: 2 of 4)
   2026-10-02 audit: the smaller size is the component's own now (264 wide, 20px coins),
   where the preview used to zoom it to 0.88; the coins and the 12.5px rows match the
   Onboarding Checklist. The line "Step 2 of 4 · 1 finished" beside the button is gone, the
   rail says both. The button is the shared 48px primary at a fixed width: "Continue" moves
   one on, and on the last step "Finish" is live and checks the last coin too (it used to
   say "Done" while disabled); once finished it reads "Start over". The label swaps in place
   (4px, 2px blur, 150ms). Detail lines read at 60%. New optional `onFinish`.
   2026-10-02 round 2: the steps are an AI ops setup in place of an email domain setup, so
   it no longer repeats the Onboarding Checklist: connect a model provider, upload an eval
   set, run the first eval, set an alert threshold. The sample still opens on step 2 with 1
   of 4 finished. */

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
  /** told when the last step is finished */
  onFinish?: () => void
  className?: string
}

const DEFAULT_STEPS: SetupStep[] = [
  { title: "Connect a model provider", body: "Anthropic, OpenAI or Google keys." },
  { title: "Upload an eval set", body: "480 test cases as one JSONL file." },
  { title: "Run the first eval", body: "Claude Opus 5.5 against the set." },
  { title: "Set an alert threshold", body: "Page on call under an 85% pass rate." },
]

const solid = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, var(--background))`

/**
 * A setup rail in the Resend register (sample: an AI ops setup): numbered coins down a hairline, the open step
 * with its detail, finished steps checked. Any step can be pressed; the rail follows.
 */
export function SetupStepper({ steps = DEFAULT_STEPS, initialActive = 1, onChange, onFinish, className }: SetupStepperProps) {
  const reduced = useReducedMotion()
  const last = steps.length - 1
  const [active, setActive] = useState(Math.max(0, Math.min(last, initialActive)))
  const [hot, setHot] = useState<number | null>(null)
  /** every step finished, the last one included */
  const [complete, setComplete] = useState(false)

  const go = (i: number) => {
    const to = Math.max(0, Math.min(last, i))
    setComplete(false)
    setActive(to)
    onChange?.(to)
  }
  const next = () => {
    if (complete) return go(0)
    if (active < last) return go(active + 1)
    setComplete(true)
    onFinish?.()
  }
  const cta = complete ? "Start over" : active === last ? "Finish" : "Continue"

  return (
    <div
      className={cn("w-[264px] max-w-full tabular-nums", className)}
      role="group"
      aria-label={complete ? `Setup, all ${steps.length} steps finished` : `Setup, step ${active + 1} of ${steps.length}, ${active} finished: ${steps[active]?.title ?? ""}`}
    >
      <ol className="flex flex-col" onPointerLeave={() => setHot(null)}>
        {steps.map((s, i) => {
          const done = complete || i < active
          const on = !complete && i === active
          return (
            <li key={s.title} className="relative transition-opacity duration-200" style={{ opacity: hot !== null && hot !== i ? 0.45 : 1 }}>
              {/* the rail to the next coin: a faint track, and the ink that fills it once this step is behind */}
              {i < last && (
                <span aria-hidden className="absolute bottom-0 left-[9.5px] top-[20px] w-px bg-foreground/[0.08]">
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
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-medium transition-colors duration-200"
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
                <span className="pt-[2px]">
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
                      className="mt-0.5 block text-[11px] text-foreground/60"
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

      {/* one width whatever it says; the label swaps in place */}
      <button type="button" onClick={next} className={BUTTON_PRIMARY}>
        <motion.span key={cta} className="inline-block" {...SWAP} initial={reduced ? { opacity: 0 } : SWAP.initial}>
          {cta}
        </motion.span>
      </button>
    </div>
  )
}
