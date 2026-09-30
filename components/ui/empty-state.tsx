"use client"

import { type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Empty State, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no outlined panel: the dotted field stays as the ground, but it fades out to the page
     at its edges, so there is no box to see
   · the icon chip lost its outline and inner shadow: the glyph stands alone in label ink
   · the action is a round fill with no outline
   · it names itself to a screen reader and the message is a status
   · it settles in once on mount and honours reduced motion (it had neither)
   Props are the same. */

const EASE = [0.16, 1, 0.3, 1] as const
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const

const DOTS = "radial-gradient(color-mix(in srgb, var(--foreground) 9%, transparent) 1px, transparent 1px) 0 0 / 14px 14px"
const FADE = "radial-gradient(closest-side, black 35%, transparent 100%)"

const EnvelopeGlyph = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M3 8l9 5 9-5M4.8 5h14.4c1 0 1.8.8 1.8 1.8v10.4c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8V6.8C3 5.8 3.8 5 4.8 5z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * "Nothing yet": a dotted field that fades into the page, a glyph, one line of ink, one
 * quiet line under it and a single action.
 */
export function EmptyState({
  icon = EnvelopeGlyph,
  title = "No emails sent yet",
  hint = "your first send appears here in real time",
  action = "Send a test email",
  onAction,
  className,
}: {
  icon?: ReactNode
  title?: string
  hint?: string
  /** Button label; pass null to render no action. */
  action?: string | null
  onAction?: () => void
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <div
      className={cn("relative flex w-full max-w-[420px] flex-col items-center px-8 py-12 tabular-nums", className)}
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
          <span className="mt-1 text-[11px] text-foreground/45">{hint}</span>
        </div>
        {action && (
          <motion.button
            type="button"
            onClick={onAction}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            transition={LIFT_SPRING}
            className="mt-5 rounded-full bg-foreground/[0.06] px-3.5 py-1.5 text-[11px] font-medium text-foreground/90 outline-none transition-colors duration-150 hover:bg-foreground/[0.1] focus-visible:bg-foreground/[0.1] motion-reduce:transition-none"
          >
            {action}
          </motion.button>
        )}
      </motion.div>
    </div>
  )
}
