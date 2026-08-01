import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const SURFACE = "var(--card)"

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
 * Auto-cycling news module: timestamp whisper, a bold ink headline, the source
 * below, dot pagination. A dot click jumps and resets the clock; reduced
 * motion stops the auto-cycle.
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
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    if (reduced) return
    timer.current = setInterval(() => setI((n) => (n + 1) % items.length), cycleMs)
    return () => clearInterval(timer.current)
  }, [reduced, items.length, cycleMs])

  const jump = (n: number) => {
    setI(n)
    if (timer.current) {
      clearInterval(timer.current)
      if (!reduced) timer.current = setInterval(() => setI((m) => (m + 1) % items.length), cycleMs)
    }
  }

  const item = items[i]

  return (
    <div className={cn("w-full max-w-[380px]", className)}>
      <div className="text-[10px] tracking-[0.1em] text-foreground/40">{title}</div>
      <div
        className="mt-3 rounded-lg border border-foreground/[0.04] px-5 py-5"
        style={{ background: SURFACE, boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)" }}
      >
        <div className="relative min-h-[108px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={i}
              initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE }}
            >
              <div className="text-[10px] text-foreground/35">{item.time}</div>
              <p className="mt-2 text-[14.5px] font-semibold leading-snug text-foreground/90">{item.headline}</p>
              <div className="mt-3 text-[10px] text-foreground/35">{item.source}</div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5">
        {items.map((_, n) => (
          <button
            key={n}
            type="button"
            aria-label={`Story ${n + 1}`}
            aria-current={n === i}
            onClick={() => jump(n)}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              n === i ? "w-5 bg-foreground" : "w-1.5 bg-foreground/25 hover:bg-foreground/45",
            )}
          />
        ))}
      </div>
    </div>
  )
}
