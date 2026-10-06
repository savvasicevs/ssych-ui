"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { BUTTON, ICON_BUTTON } from "@/components/ui/control-classes"
import { rowWash, useRowExit } from "@/components/ui/row-action"
import { Tip } from "@/components/ui/browser-window-tip"

/* Alert Stack, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no outline and no drop shadow on the rows, and none on the restore control: each row
     is one flat fill, and the pile reads through the rows behind stepping back in strength
   · the sparkle is gone: it said nothing about the alert
   · pointing at a row in the open fan keeps it full and dims the others
   · the fan opens for the keyboard too, the pile names itself and says how many are left
   · every figure is tabular
   2026-10-02 audit: his note said the roundness no longer matched the rest, so the corners
   nest again. A row is 44px tall and holds a 24px round dismiss 10px in from its top, bottom
   and right, so its corner is 12 + 10 = 22, half its height: the rows are pills. The samples
   were three "coming soon" lines; they are now real alerts, each with a 6px dot in the hue of
   its direction (up, warning, done). Dismiss is the shared icon button with a "Dismiss" tip,
   and it plays out: the row holds a tick and "Dismissed" on a 10% wash for 420ms, then slides
   16px and leaves. Restore is the shared secondary button at h-7. Width 320, the card step. */

const EASE = [0.16, 1, 0.3, 1] as const
const SMOOTH = [0.22, 1, 0.36, 1] as const
/* the house re-settle spring: the rows are a physical pile */
const SETTLE = { type: "spring", stiffness: 300, damping: 30 } as const
/* the lift spring, for presses */
const PRESS = { type: "spring", stiffness: 500, damping: 30 } as const
/* solid, so a row hides the ones stacked under it */

export type AlertTone = "up" | "down" | "warn" | "neutral"
export interface AlertItem {
  label: string
  /** the dot's hue: up and down for a direction, warn for a limit near, neutral for a fact */
  tone?: AlertTone
}

const TONE: Record<AlertTone, string> = {
  up: "var(--chart-up, #34c28a)",
  down: "var(--chart-down, #e06a6a)",
  warn: "var(--chart-amber, #e8b45a)",
  neutral: "color-mix(in srgb, var(--foreground) 45%, transparent)",
}

const DEFAULT_ALERTS: AlertItem[] = [
  { label: "BTC crossed $65,000", tone: "up" },
  { label: "Margin at 82%", tone: "warn" },
  { label: "Order 84133 filled", tone: "neutral" },
]

const asItem = (a: string | AlertItem): AlertItem => (typeof a === "string" ? { label: a } : a)

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
  /** plain strings still work (a neutral row with no dot); an item can carry a tone */
  alerts?: (string | AlertItem)[]
  onDismiss?: (alert: string) => void
  className?: string
}) {
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [hot, setHot] = useState<string | null>(null)
  const [rows, setRows] = useState(() => alerts.map(asItem))
  const { leaving, start } = useRowExit()
  const count = `${rows.length} ${rows.length === 1 ? "alert" : "alerts"}`

  const dismiss = (label: string) =>
    start(label, () => {
      setRows((r) => r.filter((x) => x.label !== label))
      setHot(null)
      onDismiss?.(label)
    })

  return (
    <div
      className={cn("w-[320px] tabular-nums", className)}
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
          onClick={() => setRows(alerts.map(asItem))}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduced ? { duration: 0.15 } : { duration: 0.25, ease: EASE, scale: PRESS }}
          className={cn(BUTTON, "mx-auto flex h-7 px-3 text-[11.5px]")}
        >
          Restore alerts
        </motion.button>
      ) : (
        <div className="relative" style={{ height: open ? rows.length * 52 - 8 : 44 + (rows.length - 1) * 7 }}>
          <AnimatePresence initial={false}>
            {rows.map(({ label, tone }, i) => {
              const done = leaving === label
              return (
                <motion.div
                  key={label}
                  /* rounded-full: 22 = the 24px dismiss's 12 + its 10px inset (spec 13.10) */
                  /* light (his call, 2026-10-02): white cards on top of each other, a hairline
                     and a light shadow each; dark keeps the 7% ground */
                  className="absolute inset-x-0 top-0 flex h-11 items-center gap-2.5 rounded-full bg-background pl-4 pr-2.5 shadow-[0_0_0_1px_var(--light-outline,rgba(0,0,0,0.09)),0_2px_6px_rgba(0,0,0,0.06)] dark:bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] dark:shadow-none"
                  style={{ zIndex: rows.length - i }}
                  onPointerEnter={() => setHot(label)}
                  initial={false}
                  animate={{
                    y: open ? i * 52 : i * 7,
                    scale: open ? 1 : 1 - i * 0.035,
                    opacity: open ? (hot !== null && hot !== label ? 0.5 : 1) : i > 2 ? 0 : 1 - i * 0.28,
                  }}
                  exit={reduced ? { opacity: 0, transition: { duration: 0.15 } } : { opacity: 0, x: 16, transition: { duration: 0.3, ease: SMOOTH } }}
                  transition={reduced ? { duration: 0 } : { ...SETTLE, opacity: { duration: 0.18, ease: EASE } }}
                >
                  {/* the hold's wash sits under the text, in the row's own corner */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full transition-opacity duration-150"
                    style={{ background: rowWash("var(--foreground)"), opacity: done ? 1 : 0 }}
                  />
                  {tone && <span aria-hidden className="relative h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE[tone] }} />}
                  <span className="relative flex-1 truncate text-[12.5px] text-foreground/90">{label}</span>
                  {done ? (
                    <span className="relative inline-flex h-6 items-center gap-1 pr-1.5 text-[11px] font-medium text-foreground/90" role="status">
                      <Check className="h-3 w-3" strokeWidth={2.2} aria-hidden />
                      Dismissed
                    </span>
                  ) : (
                    <Tip tip="Dismiss" side="left" className="relative">
                      <button
                        type="button"
                        aria-label={`Dismiss "${label}"`}
                        disabled={leaving !== null}
                        onFocus={() => setHot(label)}
                        onClick={() => dismiss(label)}
                        className={cn(ICON_BUTTON, "h-6 w-6 text-foreground/45 active:scale-[0.97] motion-reduce:active:scale-100")}
                      >
                        <X className="h-3 w-3" strokeWidth={2} aria-hidden />
                      </button>
                    </Tip>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
