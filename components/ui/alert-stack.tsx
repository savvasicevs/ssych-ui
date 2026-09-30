"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/* Alert Stack, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no outline and no drop shadow on the rows, and none on the restore control: each row
     is one flat fill, and the pile reads through the rows behind stepping back in strength
   · the sparkle is gone: it said nothing about the alert
   · pointing at a row in the open fan keeps it full and dims the others
   · the fan opens for the keyboard too, the pile names itself and says how many are left
   · every figure is tabular */

const EASE = [0.16, 1, 0.3, 1] as const
/* the house re-settle spring: the rows are a physical pile */
const SETTLE = { type: "spring", stiffness: 300, damping: 30 } as const
/* the lift spring, for presses */
const PRESS = { type: "spring", stiffness: 500, damping: 30 } as const
/* solid, so a row hides the ones stacked under it */
const GROUND = "color-mix(in srgb, var(--foreground) 7%, var(--background))"

const DEFAULT_ALERTS = [
  "Realtime quotes are coming soon",
  "Options chains are coming soon",
  "Screener alerts are coming soon",
]

/**
 * Collapsed notification deck: rows sit stacked with a peeking edge, fan open under the
 * pointer, and each dismiss re-settles the pile. Dismiss everything and a quiet restore
 * control appears.
 */
export function AlertStack({
  alerts = DEFAULT_ALERTS,
  onDismiss,
  className,
}: {
  alerts?: string[]
  onDismiss?: (alert: string) => void
  className?: string
}) {
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [hot, setHot] = useState<string | null>(null)
  const [rows, setRows] = useState(alerts)
  const count = `${rows.length} ${rows.length === 1 ? "alert" : "alerts"}`

  return (
    <div
      className={cn("w-[300px] tabular-nums", className)}
      role="group"
      aria-label={`Alerts, ${count}`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => {
        setOpen(false)
        setHot(null)
      }}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false)
          setHot(null)
        }
      }}
    >
      <span role="status" className="sr-only text-[11px]">
        {count}
      </span>
      {rows.length === 0 ? (
        /* the restore control arrives once the last row has gone, and presses with the lift spring */
        <motion.button
          type="button"
          onClick={() => setRows(alerts)}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={reduced ? { duration: 0.15 } : { duration: 0.25, ease: EASE, scale: PRESS }}
          className="mx-auto block rounded-full bg-foreground/[0.08] px-3 py-1.5 text-[11px] text-foreground/45 outline-none transition-colors duration-150 hover:bg-foreground/[0.12] hover:text-foreground/90 focus-visible:bg-foreground/[0.12]"
        >
          Restore alerts
        </motion.button>
      ) : (
        <div className="relative" style={{ height: open ? rows.length * 52 - 8 : 44 + (rows.length - 1) * 7 }}>
          <AnimatePresence initial={false}>
            {rows.map((label, i) => (
              <motion.div
                key={label}
                className="absolute inset-x-0 top-0 flex h-11 items-center gap-2.5 rounded-lg pl-3.5 pr-2.5"
                style={{ background: GROUND, zIndex: rows.length - i }}
                onPointerEnter={() => setHot(label)}
                initial={false}
                animate={{
                  y: open ? i * 52 : i * 7,
                  scale: open ? 1 : 1 - i * 0.035,
                  opacity: open ? (hot !== null && hot !== label ? 0.5 : 1) : i > 2 ? 0 : 1 - i * 0.28,
                }}
                // toast-style dismiss: slide out with a soft cross-blur, quick and smooth
                exit={{ opacity: 0, x: 24, filter: "blur(2px)", transition: { duration: reduced ? 0 : 0.2, ease: EASE } }}
                transition={reduced ? { duration: 0 } : { ...SETTLE, opacity: { duration: 0.18, ease: EASE } }}
              >
                <span className="flex-1 truncate text-[12.5px] text-foreground/90">{label}</span>
                <button
                  type="button"
                  aria-label={`Dismiss "${label}"`}
                  onFocus={() => setHot(label)}
                  onClick={() => {
                    setRows((r) => r.filter((x) => x !== label))
                    setHot(null)
                    onDismiss?.(label)
                  }}
                  className="rounded-full p-1.5 text-foreground/35 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] focus-visible:text-foreground/90 active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  <X className="h-3 w-3" strokeWidth={2} aria-hidden />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
