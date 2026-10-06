"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { popupHost, scrimStyle } from "@/components/ui/popup-host"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { BUTTON, BUTTON_PRIMARY, ICON_BUTTON, RAISED } from "@/components/ui/control-classes"

/* Modal, extracted from the library shell (2026-09-30).
   What it is for: the library's dialog. A title, a body, a row of actions with the loud one
   on the right, and a close in the corner.
   Read first: the title, then the filled button.
   2026-10-02 audit: redesigned as the dashboards' Modal (src/components/lab/screen/Modal.tsx),
   whose look is copied here because a library file cannot import the lab. It replaces a
   second modal that had an 8% outline, two corners on one panel (37 at the top, 39 at the
   bottom), mixed insets (20, 12, 16 and 20 with offsets), a 4px gap between "Not now" and
   "Remove", and three control heights (a 32px mark, a 28px close, 36px buttons). Now:
   · no outline: the panel stands off by its raised fill (white in light, 12% ink in dark)
     over a dimmed, blurred page (his note: no outline)
   · one corner, 36 = 24 (the 48px pills) + 12 (the panel's padding), and one 12px inset all
     round: the title sits 12px further in at the top left (pl-3 pt-1), the body at the same
     12px, the actions on the panel's 12px edge (his notes: the padding, the sizes)
   · the actions are a grid of 48px pills 8px apart, the secondary and the primary at equal
     width (his note: the gap between Not now and Remove)
   · the close is a 36px icon button, the title 15px medium, the body 13px at 70%
   · `backdrop` is on by default: it opens in a portal over a scrim, the way a modal works;
     `backdrop={false}` still renders it in the flow. `icon` still works but is drawn only
     when given, at the close's 36px. Every prop of the version before holds; `width` is new.
   The pointer: the buttons are the library's controls (the secondary lifts its fill, the
   primary brightens, the close gains a faint disc, each sinks 0.97 on press). Escape and a
   press on the scrim close it. Focus lands on the first action when it opens, stays inside
   (Tab wraps at both ends) and goes back to what opened it for a keyboard user.
   Motion: the panel rises 10px from 0.98 with its fade in 250ms on [0.16, 1, 0.3, 1] and
   leaves in 150ms; the scrim fades in 150ms. Reduced motion keeps the fades alone.
   No figures are derived here.
   2026-10-02 round 2: the sample is a trading confirmation in place of the library's own
   "Remove this component?": "Cancel all 12 open orders?" with Keep orders and Cancel all.
   The 12 is the sum named in the body (7 on BTC-PERP, 3 on ETH-PERP, 2 on SOL-PERP). */

const EASE = [0.16, 1, 0.3, 1] as const

export interface ModalAction {
  label: string
  /** the filled one; one per dialog */
  primary?: boolean
  onClick?: () => void
  disabled?: boolean
}

export interface ModalProps {
  open?: boolean
  onClose?: () => void
  title?: string
  /** an icon left of the title, on a 36px disc; omit for no mark (the default) */
  icon?: ReactNode
  children?: ReactNode
  actions?: ModalAction[]
  /** dim and blur the page and centre the dialog over it, in a portal (the default);
   *  false renders the panel in the flow */
  backdrop?: boolean
  /** the panel's width in px */
  width?: number
  className?: string
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const DEFAULT_ACTIONS: ModalAction[] = [{ label: "Keep orders" }, { label: "Cancel all", primary: true }]

/**
 * The library's dialog: title, body, a row of 48px actions, focus kept inside, Escape to
 * close. Over a dimmed page by default; `backdrop={false}` sets it in the flow.
 */
export function Modal({
  open = true,
  onClose,
  title = "Cancel all 12 open orders?",
  icon,
  children = <p>7 on BTC-PERP, 3 on ETH-PERP and 2 on SOL-PERP leave the book at once. Open positions and their stop losses stay as they are.</p>,
  actions = DEFAULT_ACTIONS,
  backdrop = true,
  width = 400,
  className,
}: ModalProps) {
  const reduced = useReducedMotion()
  const uid = useId()
  const panel = useRef<HTMLDivElement>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const opener = useRef<Element | null>(null)
  const keyboard = useRef(false)
  /* read through a ref: an inline onClose is a new function each render */
  const close = useRef(onClose)
  close.current = onClose
  /* the portal lands in the body of the document this modal renders in (a preview iframe
     included), found once mounted; inside a [data-popup-root] box (the library's Browse all
     card) it lands in that box, so the scrim covers the component, not the page
     (ui/popup-host.ts) */
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(popupHost(anchor.current)), [])

  /* focus: the first action on open; back to the opener on close, for a keyboard user */
  useEffect(() => {
    if (!open) return
    const doc = anchor.current?.ownerDocument ?? document
    opener.current = doc.activeElement
    keyboard.current = !!(opener.current as HTMLElement | null)?.matches?.(":focus-visible")
    const id = window.setTimeout(() => {
      const box = panel.current
      const first = box?.querySelector<HTMLElement>("[data-action]") ?? box?.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus({ preventScroll: true })
    }, 30)
    return () => {
      window.clearTimeout(id)
      const back = opener.current
      if (keyboard.current && back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true })
    }
  }, [open])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation()
      close.current?.()
      return
    }
    if (e.key !== "Tab" || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = panel.current.ownerDocument.activeElement
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
      key="panel"
      ref={panel}
      role="dialog"
      aria-modal={backdrop || undefined}
      aria-labelledby={`${uid}-title`}
      aria-describedby={children ? `${uid}-body` : undefined}
      onKeyDown={onKey}
      initial={{ opacity: 0, y: reduced ? 0 : 10, scale: reduced ? 1 : 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: reduced ? 0 : 6, scale: reduced ? 1 : 0.98, transition: { duration: 0.15 } }}
      transition={reduced ? { duration: 0.15 } : { duration: 0.25, ease: EASE }}
      /* 36 = 24 (the 48px pills) + 12 (p-3) */
      className={cn("relative w-full overflow-hidden rounded-[36px] p-3 text-foreground", RAISED, className)}
      style={{ maxWidth: width }}
    >
      <div className="mb-3 flex items-center gap-2.5 pl-3 pt-1">
        {icon && <span className="-ml-3 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-foreground/80">{icon}</span>}
        <p id={`${uid}-title`} className="min-w-0 flex-1 text-[15px] font-medium text-foreground/90">
          {title}
        </p>
        <button
          type="button"
          data-close=""
          onClick={() => close.current?.()}
          aria-label="Close"
          className={cn("grid h-9 w-9 shrink-0 place-items-center active:scale-[0.97] motion-reduce:active:scale-100", ICON_BUTTON, "transition-[color,background-color,scale]")}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {children && (
        <div id={`${uid}-body`} className="px-3 text-[13px] leading-relaxed text-foreground/70">
          {children}
        </div>
      )}
      {actions.length > 0 && (
        <div className="mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              data-action=""
              disabled={a.disabled}
              onClick={a.onClick ?? (() => close.current?.())}
              className={a.primary ? BUTTON_PRIMARY : cn("h-12 px-5 text-[14px] font-medium", BUTTON)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )

  if (!backdrop)
    return (
      <>
        <span ref={anchor} hidden />
        <AnimatePresence>{open && dialog}</AnimatePresence>
      </>
    )

  return (
    <>
      <span ref={anchor} hidden />
      {host &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="scrim"
                className="fixed inset-0 z-[100] grid place-items-center bg-foreground/[0.2] p-4 backdrop-blur-sm dark:bg-background/70"
                /* in a Browse all card the scrim covers the part of the card that shows
                   (ui/popup-host.ts); elsewhere undefined, the plain inset-0 */
                style={scrimStyle(host)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.15 }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) close.current?.()
                }}
              >
                {dialog}
              </motion.div>
            )}
          </AnimatePresence>,
          host,
        )}
    </>
  )
}
