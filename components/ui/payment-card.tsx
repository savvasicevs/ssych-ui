"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Payment Card, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: the payment method on file: which card, when it expires, when it is
   charged next, and the way to change it.
   Read first: the card line, "Visa •••• 4242".
   The pointer: pointing at the sheet, or tabbing to its button, lifts the card out of its
   pocket so its face can be read; leaving lets it settle back. The button takes a fill.
   Shown open and in flow, with no overlay behind it.
   Sketch used: src/components/lab/PaymentCardSheet.tsx. Kept: the one motion idea, a card
   tucked behind a sheet that lifts out on hover, and the facts on the sheet. Changed: no
   outlines and no shadows, the card and the sheet are fills mixed from tokens (the card
   was a gradient of fixed colours), the card face now carries the masked number and the
   expiry, the decorative icon on the button is gone. Rounder (2026-10-01): the sheet is
   34, was 8, and the card 20, was 8.
   Sample data fixed: the sketch charged next on Sep 8, 2024 a card read in 2026; the next
   payment is now Oct 8, 2026. The card ends 4242 and expires June 2031.
   Formulas: none, every figure is a prop. */

const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
/** opaque grounds, so the sheet hides the half of the card behind it */
const SHEET = "color-mix(in srgb, var(--foreground) 5%, var(--background))"
const CARD = "color-mix(in srgb, var(--foreground) 13%, var(--background))"

export interface PaymentCardProps {
  /** the card network, as it should be read */
  brand?: string
  last4?: string
  /** "June 2031" on the sheet */
  expires?: string
  /** the same date as it is printed on a card, "06/31" */
  expiresShort?: string
  nextPayment?: string
  onUpdate?: () => void
  className?: string
}

/**
 * The card on file, kept in a pocket: the sheet carries the facts, and pointing at it
 * lifts the card out far enough to read its face.
 */
export function PaymentCard({
  brand = "Visa",
  last4 = "4242",
  expires = "June 2031",
  expiresShort = "06/31",
  nextPayment = "Oct 8, 2026",
  onUpdate,
  className,
}: PaymentCardProps) {
  const reduced = useReducedMotion()
  const [lifted, setLifted] = useState(false)

  return (
    <div
      className={cn("w-[300px] max-w-full pt-[58px] tabular-nums", className)}
      role="group"
      aria-label={`${brand} ending ${last4}, expires ${expires}, next payment ${nextPayment}`}
      /* the lift is a hover answer, so only a pointer that hovers gives it; a tap focuses
         the button, which lifts the card as well */
      onPointerEnter={(e) => e.pointerType !== "touch" && setLifted(true)}
      onPointerLeave={() => setLifted(false)}
      onFocus={() => setLifted(true)}
      onBlur={() => setLifted(false)}
    >
      <div className="relative">
        {/* the card, tucked behind the sheet */}
        <motion.div
          aria-hidden
          /* 20, rounder with the sheet so the tab reads as its top edge; it holds text only */
          className="absolute left-1/2 top-0 z-0 flex h-[120px] w-[200px] flex-col justify-between rounded-[20px] px-3.5 pb-3.5 pt-2.5"
          style={{ background: CARD, x: "-50%" }}
          initial={false}
          animate={{ y: lifted ? -54 : -30, rotate: lifted ? -1.2 : 0 }}
          transition={reduced ? { duration: 0 } : LIFT_SPRING}
        >
          <span className="text-[13px] font-semibold text-foreground/90">{brand}</span>
          <span className="flex items-baseline justify-between pb-[58px] text-[10px] text-foreground/45">
            <span>•••• {last4}</span>
            <span>{expiresShort}</span>
          </span>
        </motion.div>

        {/* the sheet covers the card's lower half like a slot.
            14 (the 28px Update pill) + 20 side padding = 34 */}
        <div className="relative z-10 rounded-[34px] px-5 pb-4 pt-6 text-center" style={{ background: SHEET }}>
          <div className="text-[13px] font-semibold text-foreground/90">
            {brand} •••• {last4}
          </div>
          <div className="mt-1 text-[11px] text-foreground/45">Expires {expires}</div>
          <button
            type="button"
            onClick={onUpdate}
            className="mx-auto mt-4 block h-7 rounded-full bg-foreground/[0.08] px-3.5 text-[11.5px] font-medium text-foreground/90 outline-none transition-[background-color,transform,translate,scale,rotate] duration-150 ease-out hover:bg-foreground/[0.14] focus-visible:bg-foreground/[0.14] active:scale-[0.97] motion-reduce:active:scale-100"
          >
            Update payment method
          </button>
          <div className="mt-5 border-t border-foreground/[0.05] pt-3 text-[10.5px] text-foreground/45">
            Next payment <span className="text-foreground/90">{nextPayment}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
