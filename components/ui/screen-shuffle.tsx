"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { usePointed } from "@/components/ui/use-pointed"

/* 2026-10-02 audit: the stack shuffled on its own every 2.6s from mount; it now rests still
   and shuffles only while the pointer is on it (usePointed; in view on touch), and on a
   click. The sample screens were four raw hex gradients with blue, green, amber and violet
   tints; they are now one ink at five strengths from tokens (the way Project Index draws its
   covers), and a real product shot still goes in through `image`. The screens are 18px
   corners with no outline, a fill only, and the inner panel lost its outline too. The
   "click to shuffle" caption is gone by default: the cursor and the motion say it (`caption`
   still draws one if an install passes it).
   2026-10-02 round 2: a light look, the dark one unchanged. The depth dim was a brightness
   filter, which on a white page turned the back screens grey; it is now a layer of the
   background over each screen at the same strength (14% a slot), so dark reads exactly as
   before (black at k over a screen equals brightness 1 − k) and light washes the back screens
   toward white at 60% of that. In light the screens are white (--ss-step 0, the mocks' 7% step
   in dark) with a quiet 1px outline at 8% ink and a soft drop shadow, the mocks' corner light
   is a softer ink (--ss-ink, half ink into the background), and the top-left sheen, which only
   reads on black, draws in dark only. */

const EASE = [0.16, 1, 0.3, 1] as const

export interface ShuffleScreen {
  id: string
  /** Product shot URL; falls back to a gradient mock when absent. */
  image?: string
  grad?: string
  tint?: string
}

/** a sample screen: one soft light of ink from a corner over the surface step (7% in dark,
 *  white in light); --ss-ink and --ss-step fall back to the dark values where they are not set */
const mock = (at: string, ink: number) =>
  `radial-gradient(120% 140% at ${at}, color-mix(in srgb, var(--ss-ink, var(--foreground)) ${ink}%, transparent), transparent 60%), color-mix(in srgb, var(--foreground) var(--ss-step, 7%), var(--background))`
const tint = (ink: number) => `color-mix(in srgb, var(--foreground) ${ink}%, transparent)`

const DEFAULT_SCREENS: ShuffleScreen[] = [
  { id: "overview", grad: mock("20% 10%", 16), tint: tint(40) },
  { id: "markets", grad: mock("80% 15%", 13), tint: tint(34) },
  { id: "reports", grad: mock("30% 85%", 11), tint: tint(28) },
  { id: "billing", grad: mock("70% 80%", 9), tint: tint(24) },
  { id: "settings", grad: mock("50% 0%", 12), tint: tint(30) },
]

const SX = 26 // per-slot x offset
const SY = 20 // per-slot y offset
const SCALE = 0.055 // per-slot shrink

/**
 * A stacked-screens loop as a live component: screens hold a 3D-ish stack;
 * while it is pointed at, every few seconds the front one arcs out to the right
 * and settles at the back while the rest step forward. Click advances immediately. Depth is
 * scale + blur + dim, no real z. Pass `image` per screen for real product
 * shots; the default slots are gradient mocks.
 */
export function ScreenShuffle({
  screens = DEFAULT_SCREENS,
  stepMs = 2600,
  caption,
  className,
}: {
  screens?: ShuffleScreen[]
  /** Auto-advance interval while pointed at; ignored when the user prefers reduced motion. */
  stepMs?: number
  /** a line under the stack; none by default */
  caption?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const { ref, live, bind } = usePointed<HTMLButtonElement>()
  const n = screens.length

  useEffect(() => {
    if (reduced || !live) return
    timer.current = setInterval(() => setStep((s) => s + 1), stepMs)
    return () => clearInterval(timer.current)
  }, [reduced, stepMs, live])

  return (
    <button
      ref={ref}
      {...bind}
      type="button"
      aria-label="Advance the screen stack"
      onClick={() => setStep((s) => s + 1)}
      className={cn(
        "relative h-[300px] w-full max-w-[520px] cursor-pointer [--ss-ink:color-mix(in_srgb,var(--foreground)_50%,var(--background))] [--ss-step:0%] dark:[--ss-ink:var(--foreground)] dark:[--ss-step:7%]",
        className,
      )}
      style={{ perspective: 1200 }}
    >
      {screens.map((screen, i) => {
        const slot = (((i - step) % n) + n) % n
        const front = slot === 0
        return (
          <motion.div
            key={screen.id}
            className="absolute left-1/2 top-1/2 w-[360px] overflow-hidden rounded-[18px] shadow-[0_0_0_1px_var(--light-outline,color-mix(in_srgb,var(--foreground)_10%,transparent)),0_14px_32px_-14px_rgba(0,0,0,0.2)] dark:shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_12%,transparent)]"
            style={{ aspectRatio: "1495 / 1024", transformOrigin: "50% 60%" }}
            animate={{
              x: `calc(-50% + ${slot * SX}px)`,
              y: `calc(-50% - ${slot * SY}px)`,
              scale: 1 - slot * SCALE,
              rotateZ: (slot - (n - 1) / 2) * 1.2,
              filter: `blur(${slot * 0.7}px)`,
              zIndex: n - slot,
            }}
            transition={
              reduced
                ? { duration: 0 }
                : front
                  ? { duration: 0.8, ease: EASE } // arriving at the front
                  : { duration: 0.7, ease: EASE, delay: 0.08 }
            }
          >
            {screen.image ? (
              <img src={screen.image} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            ) : (
              /* gradient mock screen — chrome bar + skeleton content */
              <div className="absolute inset-0" style={{ background: screen.grad }}>
                <div className="flex h-[14%] items-center gap-1.5 border-b border-foreground/[0.05] px-[5%]">
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground/12" />
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground/12" />
                  <span className="ml-3 h-[22%] w-[26%] rounded-full bg-foreground/[0.08]" />
                </div>
                <div className="flex h-[86%] gap-[4%] p-[5%]">
                  <div className="flex w-[30%] flex-col gap-[8%]">
                    <span className="h-[9%] w-full rounded-full" style={{ background: screen.tint }} />
                    <span className="h-[9%] w-4/5 rounded-full bg-foreground/[0.10]" />
                    <span className="h-[9%] w-3/5 rounded-full bg-foreground/[0.07]" />
                    <span className="h-[9%] w-4/6 rounded-full bg-foreground/[0.05]" />
                  </div>
                  <div className="flex-1 rounded-[10px] bg-foreground/[0.06]" />
                </div>
              </div>
            )}
            <span
              className="pointer-events-none absolute inset-0 hidden dark:block"
              style={{ background: "linear-gradient(160deg, color-mix(in srgb, var(--foreground) 5%, transparent), transparent 40%)" }}
            />
            {/* depth: the background laid over the screen, 14% a slot (60% of that in light) */}
            <span className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-100">
              <motion.span
                className="absolute inset-0 bg-background"
                initial={false}
                animate={{ opacity: slot * 0.14 }}
                transition={
                  reduced ? { duration: 0 } : front ? { duration: 0.8, ease: EASE } : { duration: 0.7, ease: EASE, delay: 0.08 }
                }
              />
            </span>
          </motion.div>
        )
      })}
      {caption && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[11px] text-foreground/45">{caption}</span>}
    </button>
  )
}
