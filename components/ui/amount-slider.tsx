"use client"

import { useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import { InlineSlider } from "@/components/ui/inline-slider"

/* Amount Slider, written new through ssych-component (2026-09-29).
   What it is for: choosing how much of a balance to use, as a share of it. The share is
   always shown with the amount and the value it comes to.
   Read first: the amount.
   Sketch used: src/components/lab/AmountSliderPro.tsx. Kept: one value written by a drag or
   by a quarter stop, the share paired with the amount it resolves to and what it is worth.
   2026-10-02 audit: rebuilt on the Inline Slider material, so the Slider family has one
   look and one width (320). It was a second slider beside it: a 3px rail with a 14px round
   thumb, a fill that took the accent on hover, and four pills with their own thumb. Now the
   header has the three tiers of spec 14.1: the label row ("Amount" at 45%, the token's mark
   and symbol on the right), the amount as the 26px headline with its decimals at 35%, and
   its value in dollars as the 12px sub line. Under it one InlineSlider: "Share" inside the
   left, the percent inside the right, a 2 by 10 handle inside an ink fill, and the stops at
   25, 50, 75 and Max as 2px dots with their 10px labels under the track. The token's real
   mark comes in through `renderIcon`; with none the symbol stands alone. Props unchanged,
   plus the optional `renderIcon`.
   The pointer: drag the track (the handle follows pixel for pixel and settles on a whole
   percent), press it anywhere to send the handle there, press a stop label to jump; arrow
   keys move one percent, Page Up and Page Down ten, Home and End go to the ends. Reduced
   motion drops the settle.
   Formulas:
   · amount  balance × share ÷ 100
   · value   amount × price */

export interface AmountSliderProps {
  /** amount held */
  balance?: number
  symbol?: string
  /** price in dollars */
  price?: number
  /** opening share, 0 to 100 */
  defaultPercent?: number
  onChange?: (percent: number, amount: number) => void
  /** the token's real mark beside its symbol (TokenIcon in the library preview) */
  renderIcon?: (symbol: string, size: number) => ReactNode
  className?: string
}

const STOPS = [25, 50, 75, 100]

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const upTo = (n: number, dp: number) => n.toLocaleString("en-US", { maximumFractionDigits: dp })

/**
 * Share of balance selector: the amount read first, its dollar value under it, and one
 * inline slider with quarter stops that writes the share.
 */
export function AmountSlider({ balance = 4.1, symbol = "ETH", price = 3050, defaultPercent = 50, onChange, renderIcon, className }: AmountSliderProps) {
  const [pct, setPct] = useState(defaultPercent)
  const amount = (balance * pct) / 100
  const value = amount * price
  const [whole, decimals] = upTo(amount, 4).split(".")

  const set = (v: number) => {
    setPct(v)
    onChange?.(v, (balance * v) / 100)
  }

  return (
    <div
      role="group"
      aria-label={`Amount, ${upTo(amount, 4)} ${symbol}, ${usd(value)}, ${pct}% of ${upTo(balance, 4)} ${symbol}`}
      className={cn("w-[320px] max-w-full tabular-nums", className)}
    >
      <div className="mb-3 flex items-baseline justify-between text-[12px]">
        <span className="text-foreground/45">Amount</span>
        <span className="flex items-center gap-1.5 self-center font-medium text-foreground/90">
          {renderIcon?.(symbol, 14)}
          {symbol}
        </span>
      </div>
      {/* the amount changes in place as the share moves: a drag writes it live */}
      <div className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
        {whole}
        {decimals ? <span className="text-foreground/35">.{decimals}</span> : null}
      </div>
      <div className="mt-2 text-[12px] font-medium text-foreground/60">{usd(value)}</div>

      <InlineSlider
        className="mt-4"
        label="Share"
        ariaLabel={`Share of the ${symbol} balance`}
        min={0}
        max={100}
        step={1}
        value={pct}
        onChange={set}
        format={(v) => `${v}%`}
        stops={STOPS}
        formatStop={(v) => (v === 100 ? "Max" : `${v}%`)}
      />
    </div>
  )
}
