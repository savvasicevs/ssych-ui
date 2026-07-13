import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { CreditCard } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"

const SURFACE_DEEP = "#080B12"

/**
 * Payment sheet in the Fey register: the card lives in a pocket and lifts out
 * on hover, the sheet below carries the facts. One motion idea (the card
 * leaving its slot) — everything else stays still.
 */
export function PaymentSheet({
  brand = "VISA",
  last4 = "1111",
  expires = "June 2031",
  nextPayment = "Sep 8, 2024",
  onUpdate,
  className,
}: {
  brand?: string
  last4?: string
  expires?: string
  nextPayment?: string
  onUpdate?: () => void
  className?: string
}) {
  const reduced = useReducedMotion()
  const [lifted, setLifted] = useState(false)

  return (
    <div className={cn("w-[300px]", className)} onMouseEnter={() => setLifted(true)} onMouseLeave={() => setLifted(false)}>
      <div className="relative">
        {/* the card, tucked behind the sheet */}
        <motion.div
          className="absolute left-1/2 top-0 z-0 h-[120px] w-[200px] -translate-x-1/2 rounded-xl border border-white/[0.05] p-4"
          style={{ background: "linear-gradient(150deg, #1b1e27 0%, #101319 60%, #0c0f15 100%)" }}
          initial={false}
          animate={{ y: lifted ? -54 : -30, rotate: lifted ? -1.2 : 0 }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}
        >
          <span className="text-[13px] font-semibold italic tracking-wide text-white/85">{brand}</span>
        </motion.div>

        {/* the sheet — covers the card's lower half like a slot */}
        <div
          className="relative z-10 mt-16 rounded-xl border border-white/[0.04] px-5 pb-4 pt-6"
          style={{
            background: SURFACE_DEEP,
            boxShadow: "0 -18px 30px -18px rgba(0,0,0,0.9), 0 24px 50px -24px rgba(0,0,0,0.8)",
          }}
        >
          <div className="text-center">
            <div className="text-[15px] font-semibold tracking-wide text-white/90">
              Visa <span className="tracking-[0.18em]">••••</span> {last4}
            </div>
            <div className="mt-1 text-[11.5px] text-white/40">Expires {expires}</div>
            <button
              type="button"
              onClick={onUpdate}
              className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-white/[0.04] bg-white/[0.03] px-3.5 py-1.5 text-[11.5px] text-white/75 transition-all duration-200 hover:bg-white/[0.06] hover:text-white active:scale-[0.98]"
            >
              <CreditCard className="h-3 w-3 text-white/45" />
              Update payment method
            </button>
          </div>
          <div className="mt-5 border-t border-white/[0.04] pt-3 text-center">
            <span className="text-[11px] text-white/35">Next payment: {nextPayment}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
