"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* News Card, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card: no outline, no inner shadow, no surface. The story sits on the page
   · the title is sentence case at normal spacing (it was letter-spaced)
   · the story dots moved up beside the title, so the block is one column with nothing
     hanging under it; each dot has a larger press area and names its story
   · pointing at the story, or focusing a dot, holds the cycle so it can be read
   · every figure is tabular, so the times line up from story to story
   · the swap is 0.2s (it was 0.35s) and the dot change 200ms (it was 300ms)
   · the block names itself to a screen reader; the story is a status that only speaks
     when the reader changed it, not on every automatic turn
   Props are the same. */

const EASE = [0.16, 1, 0.3, 1] as const

export interface NewsItem {
  time: string
  headline: string
  source: string
}

const DEFAULT_ITEMS: NewsItem[] = [
  { time: "12 hours ago", headline: "Quarterly index rebalance shifts sector weights across the top 20.", source: "Sample Wire" },
  { time: "18 hours ago", headline: "Developer API requests double after the public pricing launch.", source: "Sample Ledger" },
  { time: "1 day ago", headline: "Trading volume crosses $230M on the session, a record for the quarter.", source: "Sample Times" },
]

/**
 * Turning news: the time, one headline in strong ink, its source. Stories turn on their
 * own; pointing at the story holds it, a dot jumps to a story and restarts the clock.
 */
export function NewsCard({
  items = DEFAULT_ITEMS,
  title = "Market news",
  cycleMs = 5200,
  className,
}: {
  items?: NewsItem[]
  title?: string
  /** Auto-advance interval; ignored when the user prefers reduced motion. */
  cycleMs?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const [i, setI] = useState(0)
  const [held, setHeld] = useState(false)
  /** bumped by a jump, so the clock starts again from that story */
  const [turn, setTurn] = useState(0)

  const count = items.length
  const turning = !reduced && !held && count > 1

  useEffect(() => {
    if (!turning) return
    const t = setInterval(() => setI((n) => (n + 1) % count), cycleMs)
    return () => clearInterval(t)
  }, [turning, count, cycleMs, turn])

  const jump = (n: number) => {
    setI(n)
    setTurn((t) => t + 1)
  }

  const at = Math.min(i, Math.max(0, count - 1))
  const item = items[at]

  return (
    <div
      className={cn("w-full max-w-[380px] tabular-nums", className)}
      role="group"
      aria-label={`${title}, story ${count ? at + 1 : 0} of ${count}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium text-foreground/45">{title}</span>
        <span className="-mr-1 flex items-center" onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
          {items.map((it, n) => (
            <button
              key={n}
              type="button"
              aria-label={`Story ${n + 1} of ${count}: ${it.headline}`}
              aria-current={n === at}
              onClick={() => jump(n)}
              className="group grid h-5 place-items-center px-[3px] outline-none"
            >
              {/* the dot grows by a layout transform, never a width tween; the others slide aside with it */}
              <motion.span
                layout={!reduced}
                transition={{ layout: { duration: 0.2, ease: EASE } }}
                style={{ borderRadius: 999 }}
                className={cn(
                  "block h-1.5 transition-colors duration-200 motion-reduce:transition-none",
                  n === at
                    ? "w-5 bg-foreground/90"
                    : "w-1.5 bg-foreground/25 group-hover:bg-foreground/45 group-focus-visible:bg-foreground/45",
                )}
              />
            </button>
          ))}
        </span>
      </div>

      {item ? (
        <div
          role="status"
          aria-live={turning ? "off" : "polite"}
          className="relative mt-3 min-h-[108px]"
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={at}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={
                reduced
                  ? { opacity: 0, transition: { duration: 0.12 } }
                  : { opacity: 0, y: -4, filter: "blur(2px)", transition: { duration: 0.15, ease: EASE } }
              }
              transition={{ duration: 0.2, ease: EASE }}
            >
              <div className="text-[10px] text-foreground/35">{item.time}</div>
              <p className="mt-2 text-[14.5px] font-semibold leading-snug text-foreground/90">{item.headline}</p>
              <div className="mt-3 text-[10px] text-foreground/45">{item.source}</div>
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  )
}
