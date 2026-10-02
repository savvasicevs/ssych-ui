"use client"

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/* the library's controls, copied from src/components/library/controls.ts so this file ships alone */
const BUTTON =
  "rounded-full bg-foreground/[0.08] shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--foreground)_6%,transparent)] text-foreground/80 transition-colors duration-200 hover:bg-foreground/[0.12] hover:text-foreground"
const BUTTON_PRIMARY =
  "rounded-full bg-foreground/[0.92] text-background shadow-[inset_0_1px_0_0_var(--foreground),inset_0_-1px_0_0_color-mix(in_srgb,var(--background)_16%,transparent)] transition-colors duration-200 hover:bg-foreground"
const ICON_BUTTON = "text-foreground/45 transition-colors duration-200 hover:bg-foreground/[0.06] hover:text-foreground/80"
/* top: 16 (the 32px icon disc) + 20 padding + 1 border = 37;
   bottom: 18 (the 36px action pills) + 20 padding + 1 border = 39 */
const CARD_RADIUS = "rounded-t-[37px] rounded-b-[39px]"

/* Modal, extracted from the library shell (2026-09-30).
   What it is for: the library's dialog. A title, a body, a row of
   actions with the loud one on the right, and a close in the corner.
   Read first: the title, then the white button.
   The pointer: the buttons are the library's controls (the secondary lifts its fill, the
   primary brightens, the close gains a faint disc). Tab stays inside the dialog and wraps
   at both ends; Escape closes it. Focus lands on the first control when it opens and goes
   back to what opened it when it closes.
   Taken from: src/components/library/FeedbackModal.tsx and RequestComponentModal.tsx
   (the shell: 420px wide, the header row with its 32px mark and 15px title, the 12px line
   under the title, the close button top right, the 20px side padding, the entrance
   opacity 0 → 1 with y 14 and scale 0.97 over 200ms on [0.4, 0, 0.2, 1]). Their forms are
   not here.
   Changed, because controls.ts wins over the shell: the buttons are BUTTON and
   BUTTON_PRIMARY (36px pills), not the black/white pills with an opacity hover; the
   header's mark is the thumb's material, not a blue disc; the corner is the card's 24px,
   not 16; the header's hairline divider is spacing instead (fills, not lines), so the
   panel's own 8% hairline is the one outline; the title is plain text, not an <h2>, since
   the page owns the headings; the close is 28px, the compact control; the 12px line under the title is gone
   (2026-10-01), the title and the body say it.
   Decided: it renders open and in the flow, with no backdrop and no portal, so it can be
   looked at on a page. `aria-modal` is only set when `backdrop` is on, since in the flow
   the rest of the page is still there.
   Motion (2026-09-30): the dialog opens from 0.96 and a fade in 250ms and closes in 150ms,
   both on the smooth-out (the shell's [0.4, 0, 0.2, 1] eased in); the scrim follows the
   same pair; every button sinks 0.97 on press. Reduced motion keeps the fade alone. */

const SMOOTH = [0.22, 1, 0.36, 1] as const
/** press feedback on the library's controls: colour as before, plus a 0.97 sink */
const PRESS = "transition-[color,background-color,scale] duration-200 active:scale-[0.97] motion-reduce:active:scale-100"

export interface ModalAction {
  label: string
  /** the white one; one per dialog */
  primary?: boolean
  onClick?: () => void
  disabled?: boolean
}

export interface ModalProps {
  open?: boolean
  onClose?: () => void
  title?: string
  /** an icon for the 32px mark left of the title; omit for no mark */
  icon?: ReactNode
  children?: ReactNode
  actions?: ModalAction[]
  /** dim the page and centre the dialog on it, the way the shell shows it */
  backdrop?: boolean
  className?: string
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const DEFAULT_ACTIONS: ModalAction[] = [{ label: "Not now" }, { label: "Remove", primary: true }]

/**
 * The library's dialog: title, body, actions, focus kept inside, Escape to close. In the
 * flow by default; `backdrop` centres it over a dimmed page.
 */
export function Modal({
  open = true,
  onClose,
  title = "Remove this component?",
  icon,
  children = (
    <p className="text-[13px] leading-relaxed text-foreground/55">
      Copies already installed keep working. The registry entry and its preview clip are taken down within the hour.
    </p>
  ),
  actions = DEFAULT_ACTIONS,
  backdrop = false,
  className,
}: ModalProps) {
  const reduced = useReducedMotion()
  const uid = useId()
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)

  /* focus: the first control on open, back to the opener on close */
  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus({ preventScroll: true })
    return () => {
      const back = opener.current
      if (back instanceof HTMLElement && document.contains(back)) back.focus({ preventScroll: true })
    }
  }, [open])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation()
      onClose?.()
      return
    }
    if (e.key !== "Tab" || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !panel.current.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const dialog = (
    <motion.div
      ref={panel}
      role="dialog"
      aria-modal={backdrop || undefined}
      aria-labelledby={`${uid}-title`}
      aria-describedby={children ? `${uid}-body` : undefined}
      onKeyDown={onKey}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0.15 } } : { opacity: 0, scale: 0.96, transition: { duration: 0.15, ease: SMOOTH } }}
      transition={{ duration: 0.25, ease: SMOOTH }}
      className={cn("relative w-full max-w-[420px] overflow-hidden border border-foreground/[0.08] bg-[var(--surface)] text-foreground", CARD_RADIUS, className)}
    >
      <div className="flex items-start gap-2.5 px-5 pt-5">
        {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-foreground/80">{icon}</span>}
        <p id={`${uid}-title`} className="min-w-0 flex-1 text-[15px] font-semibold text-foreground/90">
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={cn("-mr-1.5 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", ICON_BUTTON, PRESS)}
        >
          <X className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </button>
      </div>
      <div id={`${uid}-body`} className="px-5 pb-4 pt-3">
        {children}
      </div>
      {actions.length > 0 && (
        <div className="flex items-center justify-end gap-1 px-5 pb-5">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={a.disabled}
              onClick={a.onClick ?? onClose}
              className={cn(
                "h-9 px-4 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40",
                a.primary ? BUTTON_PRIMARY : BUTTON,
                PRESS,
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )

  return (
    <AnimatePresence>
      {open &&
        (backdrop ? (
          <motion.div
            key="scrim"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15, ease: SMOOTH } }}
            transition={{ duration: 0.25, ease: SMOOTH }}
          >
            {/* blur: the page the dialog opened over, dimmed and softened behind the scrim */}
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
            {dialog}
          </motion.div>
        ) : (
          dialog
        ))}
    </AnimatePresence>
  )
}
