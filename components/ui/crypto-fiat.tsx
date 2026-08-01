import { useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUpDown } from "lucide-react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const ACCENT = "var(--chart-1)"
const TEXT = "var(--foreground)"
const TEXT_MUTED = "var(--muted-foreground)"

/** Number pop-in — each character blurs, pops and slides into place, staggered
 * left→right. Keyed by position + glyph, so only the digits that actually
 * changed re-flip: a keystroke pops one digit, a denomination swap cascades the
 * whole value. tabular-nums keeps the columns from breathing. */
function Digits({ text }: { text: string }) {
  const reduced = useReducedMotion()
  return (
    <span className="inline-flex tabular-nums">
      <AnimatePresence mode="popLayout">
        {text.split("").map((ch, i) => (
          <motion.span
            key={`${i}-${ch}`}
            layout
            initial={reduced ? false : { opacity: 0, y: 7, scale: 0.5, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -7, scale: 0.5, filter: "blur(4px)" }}
            transition={reduced ? { duration: 0 } : { duration: 0.34, ease: EASE, delay: 0.02 * i }}
            className="inline-block"
            style={{ whiteSpace: "pre" }}
          >
            {ch}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  )
}

/** Threshold curve, not a scale transform, so the type stays crisp at every
 * length. The 14px tier keeps very long amounts inside the field. */
const sizeFor = (len: number) => (len >= 27 ? 14 : len >= 22 ? 18 : len >= 14 ? 22 : len >= 10 ? 27 : 46)

export interface CryptoFiatProps {
  /** Unit ticker for the crypto side. */
  symbol?: string
  /** Unit price in the fiat currency — the counter value derives from it. */
  price?: number
  /** Prefilled fiat amount, digits only (no $). */
  defaultAmount?: string
  /** Fires with the raw digits and which denomination they are in. */
  onChange?: (raw: string, denomination: "fiat" | "crypto") => void
  className?: string
}

/**
 * Dual-denomination amount field. Type in fiat OR units; the toggle underneath
 * flips which side you are editing and carries the value through the rate, and
 * the counter-value rides along, popping only the digits that changed. The
 * headline number steps down through font-size tiers as it grows.
 */
export function CryptoFiat({
  symbol = "ETH",
  price = 3050,
  defaultAmount = "2500",
  onChange,
  className,
}: CryptoFiatProps) {
  const [isFiat, setIsFiat] = useState(true)
  // Prefilled: $2,500 at $3,050/ETH → 0.819672 ETH (counter = amount / price)
  const [raw, setRaw] = useState(defaultAmount)

  const n = parseFloat(raw) || 0
  const counter = useMemo(
    () =>
      isFiat
        ? `${(n / price).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${symbol}`
        : `$${(n * price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    [isFiat, n, price, symbol],
  )

  const display = isFiat ? (raw ? `$${raw}` : "") : raw
  const fontSize = sizeFor(display.length)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = (value: string, fiat: boolean) => {
    setRaw(value)
    onChange?.(value, fiat ? "fiat" : "crypto")
  }

  return (
    <div className={cn("flex w-[300px] flex-col items-center gap-1", className)}>
      {/* The invisible sizer span makes the field exactly as wide as its text, so
          the unit suffix sits after the last decimal at any length — no width
          estimation, no overlap. */}
      <div
        className="flex w-full min-w-0 cursor-text items-center justify-center overflow-hidden"
        onMouseDown={(e) => {
          if (e.target !== inputRef.current) {
            e.preventDefault()
            inputRef.current?.focus()
          }
        }}
      >
        <div className="relative min-w-0">
          <span aria-hidden className="invisible block whitespace-pre font-normal" style={{ fontSize, lineHeight: 1.15 }}>
            {display || (isFiat ? "$0" : `0 ${symbol}`)}
          </span>
          <input
            ref={inputRef}
            value={display}
            onChange={(e) => {
              const v = e.target.value.replace(/^\$/, "")
              if (/^\d*\.?\d*$/.test(v)) commit(v, isFiat)
            }}
            placeholder={isFiat ? "$0" : `0 ${symbol}`}
            inputMode="decimal"
            aria-label={isFiat ? "Fiat amount" : `${symbol} amount`}
            className="absolute inset-0 w-full bg-transparent text-center font-normal outline-none placeholder:opacity-100"
            style={{ fontSize, lineHeight: 1.15, color: raw ? TEXT : TEXT_MUTED, caretColor: ACCENT }}
          />
        </div>
        {!isFiat && raw && (
          <span className="pointer-events-none shrink-0 pl-2 text-[16px]" style={{ color: TEXT_MUTED }}>
            {symbol}
          </span>
        )}
      </div>

      <button
        type="button"
        aria-label="Switch denomination"
        onClick={() => {
          const next = !isFiat
          setIsFiat(next)
          const v = parseFloat(raw) || 0
          commit(!v ? "" : isFiat ? (v / price).toFixed(6).replace(/\.?0+$/, "") : (v * price).toFixed(2), next)
        }}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-[color-mix(in_srgb,var(--card-raised)_60%,transparent)]"
        style={{ color: TEXT_MUTED }}
      >
        <ArrowUpDown size={14} />
        <Digits text={counter} />
      </button>
    </div>
  )
}
