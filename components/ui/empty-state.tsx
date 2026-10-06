"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { BUTTON_PRIMARY } from "@/components/ui/control-classes"
import { EmptyStateDialog, type EmptyStateDigest } from "@/components/ui/empty-state-dialog"

/* Empty State, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no outlined panel: the dotted field stays as the ground, but it fades out to the page
     at its edges, so there is no box to see
   · the icon chip lost its outline and inner shadow: the glyph stands alone in label ink
   · the action is a round fill with no outline
   · it names itself to a screen reader and the message is a status
   · it settles in once on mount and honours reduced motion (it had neither)
   Props are the same.
   2026-10-02 audit: the action is the shared primary at 36px (it is the one action here),
   12.5px, where it was a hand made 6% pill at 11px; the hint is a sentence with a capital
   ("Your first send shows up here.") at 11.5px and 60%, so it can be read; the default
   width is 400.
   2026-10-02 round 2: his note was to do something real, on topic, with the popup. The
   default is now a trader's empty alerts list ("No price alerts yet", a bell), and its one
   action opens a popup in the library Modal's look (empty-state-dialog.tsx) that subscribes
   an email to market alerts: the field shows focus on its own edge, a digest is chosen from
   three rows (price alerts, the daily close, a weekly recap), and Subscribe plays out into a
   confirm state in place. `onAction` still works: a host that passes it gets the press and
   no popup. New: `digests` and `onSubscribe(email, digest)`. */

const EASE = [0.16, 1, 0.3, 1] as const
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const

const DOTS = "radial-gradient(color-mix(in srgb, var(--foreground) 9%, transparent) 1px, transparent 1px) 0 0 / 14px 14px"
const FADE = "radial-gradient(closest-side, black 35%, transparent 100%)"

/** a bell: the alerts list is empty */
const BellGlyph = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15L6 16.5zM10 20.5a2.2 2.2 0 0 0 4 0"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * "Nothing yet": a dotted field that fades into the page, a glyph, one line of ink, one
 * quiet line under it and a single action. Without `onAction`, the action opens a popup
 * that subscribes an email to market alerts.
 */
export function EmptyState({
  icon = BellGlyph,
  title = "No price alerts yet",
  hint = "Get an email the moment a market on your watchlist crosses your level.",
  action = "Create an alert",
  onAction,
  digests,
  onSubscribe,
  className,
}: {
  icon?: ReactNode
  title?: string
  hint?: string
  /** Button label; pass null to render no action. */
  action?: string | null
  /** the host's own action; without it the button opens the built-in email alerts popup */
  onAction?: () => void
  /** the popup's digest choices (price alerts, daily close, weekly recap by default) */
  digests?: EmptyStateDigest[]
  /** told when the popup subscribes an address */
  onSubscribe?: (email: string, digest: EmptyStateDigest) => void
  className?: string
}) {
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  return (
    <div
      className={cn("relative flex w-[400px] max-w-full flex-col items-center px-8 py-12 tabular-nums", className)}
      role="group"
      aria-label={title}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: DOTS, maskImage: FADE, WebkitMaskImage: FADE }}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE }}
      />
      <motion.div
        className="relative flex flex-col items-center"
        initial={reduced ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: 0.035 }}
      >
        <span className="grid h-6 w-6 place-items-center text-foreground/45">{icon}</span>
        <div role="status" className="mt-3 flex flex-col items-center text-center">
          <span className="text-[13px] font-medium text-foreground/90">{title}</span>
          <span className="mt-1 text-[11.5px] text-foreground/60">{hint}</span>
        </div>
        {action && (
          <motion.button
            type="button"
            onClick={onAction ?? (() => setOpen(true))}
            aria-haspopup={onAction ? undefined : "dialog"}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            transition={LIFT_SPRING}
            className={cn(BUTTON_PRIMARY, "mt-5 h-9 w-auto px-4 text-[12.5px] active:scale-100")}
          >
            {action}
          </motion.button>
        )}
      </motion.div>
      {!onAction && <EmptyStateDialog open={open} onClose={() => setOpen(false)} digests={digests} onSubscribe={onSubscribe} />}
    </div>
  )
}
