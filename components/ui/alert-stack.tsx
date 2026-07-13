import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Sparkle, X } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

const SURFACE_RAISED = "linear-gradient(180deg, #10141E 0%, #0A0E16 100%)"

const DEFAULT_ALERTS = [
  "Realtime quotes are coming soon",
  "Options chains are coming soon",
  "Screener alerts are coming soon",
]

/**
 * Collapsed notification deck in the Fey register: rows sit stacked with a
 * peeking edge, fan open on hover, and each dismiss re-settles the pile.
 * Dismiss everything and a quiet restore control appears.
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
  const [rows, setRows] = useState(alerts)

  return (
    <div
      className={cn("w-[300px]", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {rows.length === 0 ? (
        <button
          type="button"
          onClick={() => setRows(alerts)}
          className="mx-auto block rounded-full border border-white/[0.04] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/40 transition-all duration-150 hover:bg-white/[0.06] hover:text-white/75 active:scale-[0.98]"
        >
          Restore alerts
        </button>
      ) : (
        <div className="relative" style={{ height: open ? rows.length * 52 - 8 : 44 + (rows.length - 1) * 7 }}>
          <AnimatePresence initial={false}>
            {rows.map((label, i) => (
              <motion.div
                key={label}
                className="absolute inset-x-0 top-0 flex h-11 items-center gap-2.5 rounded-xl border border-white/[0.05] px-3.5"
                style={{
                  background: SURFACE_RAISED,
                  zIndex: rows.length - i,
                  boxShadow: "0 10px 24px -12px rgba(0,0,0,0.8)",
                }}
                initial={false}
                animate={{
                  y: open ? i * 52 : i * 7,
                  scale: open ? 1 : 1 - i * 0.035,
                  opacity: open ? 1 : i > 2 ? 0 : 1 - i * 0.18,
                }}
                exit={{ opacity: 0, x: 24, transition: { duration: reduced ? 0 : 0.2 } }}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
              >
                <Sparkle className="h-3.5 w-3.5 shrink-0 text-white/45" />
                <span className="flex-1 truncate text-[12.5px] text-white/80">{label}</span>
                <button
                  type="button"
                  aria-label={`Dismiss "${label}"`}
                  onClick={() => {
                    setRows((r) => r.filter((x) => x !== label))
                    onDismiss?.(label)
                  }}
                  className="rounded p-1 text-white/30 transition-colors duration-150 hover:text-white/70"
                >
                  <X className="h-3 w-3" weight="bold" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
