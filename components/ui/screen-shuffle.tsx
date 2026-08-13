"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const

export interface ShuffleScreen {
  id: string
  /** Product shot URL; falls back to a gradient mock when absent. */
  image?: string
  grad?: string
  tint?: string
}

const DEFAULT_SCREENS: ShuffleScreen[] = [
  { id: "overview", grad: "linear-gradient(135deg, #1b2a4a 0%, #0e1526 55%, var(--surface) 100%)", tint: "rgba(90,170,255,0.5)" },
  { id: "markets", grad: "linear-gradient(135deg, #123a33 0%, #0c1f1d 55%, var(--surface) 100%)", tint: "rgba(42,161,115,0.5)" },
  { id: "reports", grad: "linear-gradient(135deg, #3a2a12 0%, #201709 55%, var(--surface) 100%)", tint: "rgba(185,134,52,0.55)" },
  { id: "billing", grad: "linear-gradient(135deg, #32204a 0%, #1a1128 55%, var(--surface) 100%)", tint: "rgba(167,139,250,0.5)" },
  { id: "settings", grad: "linear-gradient(135deg, #14273e 0%, #0d1726 55%, var(--surface) 100%)", tint: "rgba(140,196,255,0.45)" },
]

const SX = 26 // per-slot x offset
const SY = 20 // per-slot y offset
const SCALE = 0.055 // per-slot shrink

/**
 * A stacked-screens loop as a live component: screens hold a 3D-ish stack;
 * every few seconds the front one arcs out to the right and settles at the
 * back while the rest step forward. Click advances immediately. Depth is
 * scale + blur + dim, no real z. Pass `image` per screen for real product
 * shots; the default slots are gradient mocks.
 */
export function ScreenShuffle({
  screens = DEFAULT_SCREENS,
  stepMs = 2600,
  caption = "click to shuffle",
  className,
}: {
  screens?: ShuffleScreen[]
  /** Auto-advance interval; ignored when the user prefers reduced motion. */
  stepMs?: number
  caption?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const n = screens.length

  useEffect(() => {
    if (reduced) return
    timer.current = setInterval(() => setStep((s) => s + 1), stepMs)
    return () => clearInterval(timer.current)
  }, [reduced, stepMs])

  return (
    <button
      type="button"
      aria-label="Advance the screen stack"
      onClick={() => setStep((s) => s + 1)}
      className={cn("relative h-[300px] w-full max-w-[520px] cursor-pointer", className)}
      style={{ perspective: 1200 }}
    >
      {screens.map((screen, i) => {
        const slot = (((i - step) % n) + n) % n
        const front = slot === 0
        return (
          <motion.div
            key={screen.id}
            className="absolute left-1/2 top-1/2 w-[360px] overflow-hidden rounded-xl border border-foreground/[0.04]"
            style={{ aspectRatio: "1495 / 1024", transformOrigin: "50% 60%" }}
            animate={{
              x: `calc(-50% + ${slot * SX}px)`,
              y: `calc(-50% - ${slot * SY}px)`,
              scale: 1 - slot * SCALE,
              rotateZ: (slot - (n - 1) / 2) * 1.2,
              filter: `blur(${slot * 0.7}px) brightness(${1 - slot * 0.14})`,
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
                <div className="flex h-[14%] items-center gap-1.5 border-b border-foreground/[0.07] px-[5%]">
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
                  <div className="flex-1 rounded-lg border border-foreground/[0.07] bg-background/25" />
                </div>
              </div>
            )}
            <span
              className="pointer-events-none absolute inset-0"
              style={{ background: "linear-gradient(160deg, color-mix(in srgb, var(--foreground) 5%, transparent), transparent 40%)" }}
            />
          </motion.div>
        )
      })}
      {caption && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-foreground/30">{caption}</span>}
    </button>
  )
}
