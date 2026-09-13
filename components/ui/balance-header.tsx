"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-2)"
const RED = "var(--chart-down)"
const SANS = "inherit"
const TEXT = "var(--foreground)"
const TEXT_MUTED = "var(--muted-foreground)"

/** Σ of the sample book the portfolio family quotes from */
const DEFAULT_TOTAL = 64025.65
const DEFAULT_CHANGE = 1204.32

const usd = (n: number, dp = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`

export interface BalanceHeaderProps {
  /** the headline figure */
  total?: number
  /** absolute move over the period, signed */
  change?: number
  /** pass to own the percent; unpassed it derives from the move and the balance it moved from */
  changePct?: number
  /** draw the tinted delta pill under the total */
  delta?: boolean
  /** the period the move answers for */
  period?: string
  className?: string
}

/**
 * A wallet's headline number: a quiet eyebrow over the total with its cents
 * stepped back so the eye lands on the dollars, the move carried in a tinted
 * pill beneath, and a privacy toggle that stays out of the way until you reach
 * for it, then masks every figure to dots.
 */
export function BalanceHeader({
  total = DEFAULT_TOTAL,
  change = DEFAULT_CHANGE,
  changePct,
  delta = true,
  period = "24h",
  className,
}: BalanceHeaderProps) {
  const [hidden, setHidden] = useState(false)
  const reduced = useReducedMotion()
  const up = change >= 0
  const hue = up ? GREEN : RED
  const mask = "••••••"
  /* the move over the balance it moved FROM, so the pill's two numbers agree */
  const pct = changePct ?? (change / (total - change)) * 100

  const [whole, cents] = usd(total).split(".")

  const rise = (delay: number) => ({
    initial: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 },
    animate: { opacity: 1, y: 0 },
    transition: reduced ? { duration: 0 } : { duration: 0.5, ease: EASE, delay },
  })

  return (
    <div className={cn("group flex flex-col items-center", className)} style={{ fontFamily: SANS }}>
      <motion.span {...rise(0)} className="text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: TEXT_MUTED }}>
        Total balance
      </motion.span>

      {/* the toggle floats at the trailing edge so it never nudges the number off-axis */}
      <div className="relative mt-2 flex items-center justify-center">
        <motion.h2
          {...rise(0.06)}
          className="text-[44px] font-semibold leading-none tracking-[-0.03em] tabular-nums"
          style={{ color: TEXT }}
        >
          {hidden ? (
            mask
          ) : (
            <>
              {whole}
              {cents && (
                <span style={{ color: TEXT_MUTED }} className="text-[26px] font-semibold">
                  .{cents}
                </span>
              )}
            </>
          )}
        </motion.h2>
        <button
          type="button"
          onClick={() => setHidden((h) => !h)}
          aria-label={hidden ? "Show balances" : "Hide balances"}
          aria-pressed={hidden}
          className="absolute left-full ml-3 grid h-8 w-8 place-items-center rounded-lg opacity-0 transition-opacity duration-200 hover:bg-foreground/[0.05] focus-visible:opacity-100 group-hover:opacity-100"
          style={{ color: TEXT_MUTED }}
        >
          {hidden ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>

      {delta && (
        <motion.div {...rise(0.14)} className="mt-3.5 flex items-center gap-2">
          <span
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums"
            style={{ color: hue, background: `color-mix(in srgb, ${hue} 13%, transparent)` }}
          >
            {up ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
            {hidden ? mask : `${usd(Math.abs(change))} · ${pct.toFixed(1)}%`}
          </span>
          <span className="text-[12px]" style={{ color: TEXT_MUTED }}>
            {period}
          </span>
        </motion.div>
      )}
    </div>
  )
}
