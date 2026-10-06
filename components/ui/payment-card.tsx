"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { CreditCard } from "lucide-react"

import { BUTTON, RAISED, SURFACE } from "@/components/ui/control-classes"
import { TicketModal, modalField, modalPrimary } from "@/components/ui/swap-ticket-modal"
import { cn } from "@/lib/utils"

/* Payment Card, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: the payment method on file: which card, when it expires, when it is
   charged next, and the way to change it.
   Sketch used: src/components/lab/PaymentCardSheet.tsx.
   2026-10-02 audit, redesigned (his list: "the Update payment method button and the Visa card
   inside could be nicer"; "too big in the preview, blown out of proportion"): one surface
   card 300 wide and about 124 tall, where it was a 34px-round sheet 300 wide with a card
   tucked 58px above it. A raised block holds a small card face in the network's colour with
   its real mark drawn in SVG (Visa from the Simple Icons path, CC0; Mastercard as its two
   discs; American Express as its blue box), and beside it the expiry and the next payment.
   Each fact is said once: the face carries the mark and the last four, the line beside it the
   expiry (the sheet and the card both printed "Visa •••• 4242" before). Under the block, the
   control material's button "Update payment method" opens a popup with the card number,
   expiry and security code fields and the 48px primary; saving puts the new card on file.
   The one motion idea stays, small: pointing at the card lifts the face 2px on the lift spring.
   Corners nest (spec 13.10): the card is 24 = the raised block's 18 + the 6px gap, and the
   36px button (radius 18) sits 6px in from the bottom corners; the face is 6 = 18 − its 12px
   inset. Surface 7% (it was a 5% sheet).
   `expires` ("June 2031") is no longer printed; it stays in the accessible name. A new
   `renderIcon(brand, size)` draws another network's mark, `onSave` hears a saved card.
   Formulas: none; every figure is a prop or typed. The network of a typed number is read from
   its first digits (4 Visa, 51 to 55 and 22 to 27 Mastercard, 34 and 37 American Express).
   2026-10-02 round 2: (his standing rule, from this popup): a focused field showed the page's
   blue outline 3px out from its edge, which read as a second box with its own padding. The
   popup's fields (card number, expiry, security code) now show focus on their own edge: the
   hairline brightens to 20% in ink, no outline, no gap (modalField in swap-ticket-modal.tsx). */

const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
/** the card's ground per network; the hex is only the fallback of its custom property */
const FACE: Record<string, string> = {
  visa: "var(--card-visa, #1a1f71)",
  mastercard: "var(--card-mastercard, #232323)",
  amex: "var(--card-amex, #2e77bc)",
}
/** white marks on the coloured face, in both themes */
const GLYPH = "var(--coin-glyph, #fff)"

const keyOf = (brand: string) => {
  const b = brand.toLowerCase().replace(/[^a-z]/g, "")
  return b.startsWith("visa") ? "visa" : b.startsWith("master") ? "mastercard" : b.startsWith("amex") || b.startsWith("americanexpress") ? "amex" : "other"
}

/** the network's mark, drawn: `width` px wide, white on the card face */
function NetworkMark({ brand, width }: { brand: string; width: number }) {
  const key = keyOf(brand)
  if (key === "visa")
    return (
      <svg aria-hidden viewBox="0 8 24 8" width={width} height={(width * 8) / 24} fill={GLYPH}>
        {/* Visa wordmark, Simple Icons (CC0) */}
        <path d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z" />
      </svg>
    )
  if (key === "mastercard")
    return (
      <svg aria-hidden viewBox="0 0 32 20" width={width} height={(width * 20) / 32}>
        {/* the two overlapping discs, in their own red and yellow */}
        <circle cx="11" cy="10" r="9" fill="var(--card-mc-red, #eb001b)" />
        <circle cx="21" cy="10" r="9" fill="var(--card-mc-yellow, #f79e1b)" />
        <path d="M16 2.6a9 9 0 0 1 0 14.8a9 9 0 0 1 0-14.8z" fill="var(--card-mc-orange, #ff5f00)" />
      </svg>
    )
  if (key === "amex")
    return (
      <svg aria-hidden viewBox="0 0 36 12" width={width} height={(width * 12) / 36}>
        <text x="18" y="9.5" textAnchor="middle" fontSize="10" fontWeight="700" fontStyle="italic" fill={GLYPH} letterSpacing="0.4">
          AMEX
        </text>
      </svg>
    )
  return null
}

export interface PaymentCardProps {
  /** the card network, as it should be read */
  brand?: string
  last4?: string
  /** "June 2031"; read out to a screen reader, the face and line print `expiresShort` */
  expires?: string
  /** the same date as it is printed on a card, "06/31" */
  expiresShort?: string
  nextPayment?: string
  /** fired when Update payment method is pressed (the popup opens either way) */
  onUpdate?: () => void
  /** fired when a new card is saved from the popup */
  onSave?: (card: { brand: string; last4: string; expiresShort: string }) => void
  /** draws a network's mark at `size` px wide in place of the built-in one */
  renderIcon?: (brand: string, size: number) => ReactNode
  className?: string
}

const BRAND_NAME: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express" }
/** the network of a card number from its first digits */
const networkOf = (digits: string) =>
  /^4/.test(digits) ? "Visa" : /^(5[1-5]|2[2-7])/.test(digits) ? "Mastercard" : /^3[47]/.test(digits) ? "American Express" : ""

/**
 * The card on file as one small card: the face with the network's mark and the last four,
 * the expiry and the next charge beside it, and the button that changes it.
 */
export function PaymentCard({
  brand: brand0 = "Visa",
  last4: last40 = "4242",
  expires = "June 2031",
  expiresShort: expiresShort0 = "06/31",
  nextPayment = "Oct 8, 2026",
  onUpdate,
  onSave,
  renderIcon,
  className,
}: PaymentCardProps) {
  const reduced = useReducedMotion()
  const [card, setCard] = useState({ brand: brand0, last4: last40, expiresShort: expiresShort0 })
  const [lifted, setLifted] = useState(false)
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [cvc, setCvc] = useState("")

  const key = keyOf(card.brand)
  const face = FACE[key] ?? "color-mix(in srgb, var(--foreground) 18%, var(--background))"
  const digits = number.replace(/\D/g, "")
  const typedNetwork = networkOf(digits)
  const amex = typedNetwork === "American Express"
  const [mm, yy] = expiry.split("/")
  const validExpiry = /^\d{2}\/\d{2}$/.test(expiry) && +mm >= 1 && +mm <= 12
  const valid = digits.length === (amex ? 15 : 16) && validExpiry && cvc.length === (amex ? 4 : 3)

  const save = () => {
    const next = { brand: typedNetwork || "Card", last4: digits.slice(-4), expiresShort: `${mm}/${yy}` }
    setCard(next)
    onSave?.(next)
    setOpen(false)
    setNumber("")
    setExpiry("")
    setCvc("")
  }

  return (
    <div
      className={cn("w-[300px] max-w-full rounded-[24px] p-1.5 tabular-nums", SURFACE, className)}
      role="group"
      aria-label={`${BRAND_NAME[key] ?? card.brand} ending ${card.last4}, expires ${card.last4 === last40 ? expires : card.expiresShort}, next payment ${nextPayment}`}
      /* the lift is a hover answer, so only a pointer that hovers gives it */
      onPointerEnter={(e) => e.pointerType !== "touch" && setLifted(true)}
      onPointerLeave={() => setLifted(false)}
    >
      <div className={cn("flex items-center gap-3 rounded-[18px] p-3", RAISED)}>
        <motion.div
          aria-hidden
          className="relative flex h-[46px] w-[72px] shrink-0 flex-col justify-between rounded-[6px] px-2 py-1.5"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${GLYPH} 16%, transparent), transparent 55%), ${face}`,
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--foreground) 6%, transparent)",
          }}
          initial={false}
          animate={{ y: lifted && !reduced ? -2 : 0 }}
          transition={reduced ? { duration: 0 } : LIFT_SPRING}
        >
          {/* the contact chip */}
          <span className="block h-[8px] w-[11px] rounded-[2px]" style={{ background: `color-mix(in srgb, ${GLYPH} 45%, transparent)` }} />
          <span className="flex items-end justify-between">
            <span className="text-[8px] font-medium leading-none tracking-[0.04em]" style={{ color: `color-mix(in srgb, ${GLYPH} 85%, transparent)` }}>
              •••• {card.last4}
            </span>
            {renderIcon ? renderIcon(card.brand, 22) : <NetworkMark brand={card.brand} width={key === "mastercard" ? 18 : 22} />}
          </span>
        </motion.div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-[13px] font-medium text-foreground/90">Expires {card.expiresShort}</span>
          <span className="truncate text-[12px] text-foreground/60">
            Next payment <span className="text-foreground/90">{nextPayment}</span>
          </span>
        </div>
      </div>

      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true)
          onUpdate?.()
        }}
        className={cn("mt-1.5 h-9 w-full text-[12.5px] font-medium", BUTTON)}
      >
        <CreditCard size={14} aria-hidden className="text-foreground/70" />
        Update payment method
      </button>

      <TicketModal open={open} title="Update payment method" onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-2">
          <label className="relative block">
            <input
              value={number}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 16)
                setNumber(d.replace(/(\d{4})(?=\d)/g, "$1 "))
              }}
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="Card number"
              aria-label="Card number"
              className={cn(modalField, "pr-28")}
            />
            {typedNetwork && <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[12px] text-foreground/60">{typedNetwork}</span>}
          </label>
          <div className="flex gap-2">
            <input
              value={expiry}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 4)
                setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
              }}
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/YY"
              aria-label="Expiry, month and year"
              className={modalField}
            />
            <input
              value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="Security code"
              aria-label="Security code"
              className={modalField}
            />
          </div>
        </div>
        <button type="button" disabled={!valid} onClick={save} className={cn("mt-3", modalPrimary)}>
          {valid ? `Save ${typedNetwork || "card"} ending ${digits.slice(-4)}` : "Enter the card"}
        </button>
      </TicketModal>
    </div>
  )
}
