"use client"

import { useState } from "react"

import { Tip } from "@/components/ui/amount-tip"
import { InlineSlider } from "@/components/ui/inline-slider"
import { AmountBox, Line, PILL, PILL_32, PrimaryButton, Segments, TICKET_WIDTH, amountText, ink } from "@/components/ui/swap-ticket-field"
import { ModalLine, TicketModal, modalPrimary } from "@/components/ui/swap-ticket-modal"
import { cn } from "@/lib/utils"

/* Leverage Ticket, written new through ssych-component (2026-09-29).
   What it is for: opening a leveraged position with the price that would liquidate it
   in view before anything is confirmed.
   Read first: the margin you type, the one large figure; then the liquidation price
   under the slider.
   The pointer: drag the leverage slider or use the arrow keys;
   the position size, the contracts, the fee and the liquidation price follow at once, and
   the strip shows the room between entry and liquidation closing as leverage climbs. The
   white button's label is the validation state.
   Sketch used: src/components/lab/LeverageTicketPro.tsx. Kept: side, collateral and
   leverage as the three inputs, the same liquidation formula with its maintenance rate,
   the live position value, size, fee and distance, and the bar that shrinks as leverage
   climbs. Changed: no card or outlined field; the slider is the library's own, in ink,
   where the sketch used the browser's own in blue and amber; the button is white and says why it
   cannot be pressed, where the sketch's was tinted and always live.
   No reference was named for this one.
   Formulas:
   · position size   margin × leverage
   · contracts       position size ÷ entry
   · liquidation     entry × (1 − 1 ÷ leverage + maintenance) for a long,
                     entry × (1 + 1 ÷ leverage − maintenance) for a short
   · distance        (liquidation − entry) ÷ entry × 100, signed
   · fee             position size × fee rate
   · strip           |distance| ÷ 50%, so 2× fills it
   · can be placed   margin ≥ the minimum and margin + fee ≤ balance
   Colour pass (2026-09-30): long and short are a direction, so a ticket that can be placed
   wears it on the button, green for a long and red for a short, the ink on it from
   --on-accent / --on-danger; until then the button is the quiet white control.
   2026-10-01: the caption under the strip ("Liquidation" and "Entry" at its two ends) is
   gone; the entry is in the top row and the liquidation price sits over the strip.
   2026-10-02: the leverage slider is the library's Inline Slider (his call: it should look
   like the sliders made for the library). A fully round 28px track filled to the value,
   "Leverage" inside on the left, the multiple inside on the right, the handle inside the
   fill, and the marks 1×, 10×, 25× and 50× as stops under it that still set the value
   when pressed. The thin line, the round white thumb and the label row above it are gone.
   Drag, the arrow keys, Home and End work as before, and every figure is computed the same.
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit: cut from the ticket family's parts (swap-ticket-field.tsx) so the three
   tickets and the three swaps share one field, one switch and one 48px white primary
   (BUTTON_PRIMARY); the green and red button fill is gone and the side shows as a 6px dot in
   the switch and on the button. Long and Short are the switch material with the side's colour
   as a dot, not as coloured text. Under the slider only the position size and the
   liquidation price stay; contracts, fee, entry and maintenance moved into a Details popup,
   the free margin into the Max button's tip. The button reads "Long at 10×", since the
   contracts are in Details and no figure is printed twice. The margin field is the family's
   amount field (28 = the 32px Max pill's 16 + 12). Formulas are unchanged.
   Formulas, where each is shown:
   · position size   margin × leverage (line; its tip shows the product)
   · liquidation     as above (line with its distance; the tip shows the product)
   · contracts, fee  in Details
   · free margin     the Max tip; Max fills balance ÷ (1 + leverage × fee rate)
   2026-10-02 round 2: (his notes after the side by side): the dots by Long and Short are gone;
   the chosen side is its own pill tinted in its hue (green for Long, red for Short, 14%) with
   the word in that hue, the other in ink. The dot before the button's label is gone too. The
   1×, 10×, 25× and 50× labels under the slider are removed; drag, the arrow keys, Home and End
   still set the leverage. The margin field shows focus on its own edge. Switching the side
   changes no size: every line keeps its height. Formulas are unchanged. */

const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export type LeverageSide = "long" | "short"

export interface LeverageOrder {
  side: LeverageSide
  margin: number
  leverage: number
  /** margin × leverage */
  notional: number
  /** notional ÷ entry */
  contracts: number
  liquidation: number
}

export interface LeverageTicketProps {
  symbol?: string
  /** the asset the contracts are counted in */
  base?: string
  /** the currency the margin is posted in */
  quote?: string
  /** the price the position would open at */
  entry?: number
  /** free margin in the account */
  balance?: number
  defaultSide?: LeverageSide
  /** opening margin, as typed */
  defaultMargin?: string
  defaultLeverage?: number
  maxLeverage?: number
  /** the smallest margin the venue takes */
  minMargin?: number
  /** maintenance margin rate, as a fraction of the entry price */
  maintenance?: number
  /** taker fee, as a fraction of the position size */
  feeRate?: number
  onSubmit?: (order: LeverageOrder) => void
  className?: string
}

const num = (n: number, dp: number) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * A leveraged order on the page: side, margin, a leverage slider, and under it the
 * position that would open and the price that would close it by force. Everything follows
 * the slider as it moves; the white button reads the state of the ticket.
 */
export function LeverageTicket({
  symbol = "BTC-PERP",
  base = "BTC",
  quote = "USDC",
  entry = 67412.5,
  balance = 2500,
  defaultSide = "long",
  defaultMargin = "500",
  defaultLeverage = 10,
  maxLeverage = 50,
  minMargin = 10,
  maintenance = 0.005,
  feeRate = 0.0005,
  onSubmit,
  className,
}: LeverageTicketProps) {
  const [side, setSide] = useState<LeverageSide>(defaultSide)
  const [typed, setTyped] = useState(defaultMargin)
  const [lev, setLev] = useState(clamp(Math.round(defaultLeverage), 1, maxLeverage))
  const [details, setDetails] = useState(false)

  const long = side === "long"
  const margin = parseFloat(typed) || 0
  const notional = margin * lev
  const contracts = entry > 0 ? notional / entry : 0
  const liquidation = Math.max(0, long ? entry * (1 - 1 / lev + maintenance) : entry * (1 + 1 / lev - maintenance))
  const distance = entry > 0 ? ((liquidation - entry) / entry) * 100 : 0
  const fee = notional * feeRate
  const room = clamp(Math.abs(distance) / 50, 0, 1) * 100
  const maxMargin = Math.floor((balance / (1 + lev * feeRate)) * 100) / 100

  const state = margin <= 0 ? "empty" : margin < minMargin ? "small" : margin + fee > balance ? "short" : "ready"
  const enabled = state === "ready"
  const verdict =
    state === "empty"
      ? "Enter margin"
      : state === "small"
        ? `Margin under ${num(minMargin, 0)} ${quote}`
        : state === "short"
          ? `Insufficient ${quote}`
          : `${long ? "Long" : "Short"} at ${lev}×`

  return (
    <div
      className={cn(TICKET_WIDTH, "tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}
      role="group"
      aria-label={`${symbol} ${side} at ${lev} times, liquidation ${num(liquidation, 2)}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2 px-1 text-[12px]">
        <span className="flex items-baseline gap-2">
          <span className="font-medium text-foreground/90">{symbol}</span>
          <span className="text-foreground/60">Entry {num(entry, 2)}</span>
        </span>
        <button type="button" onClick={() => setDetails(true)} aria-haspopup="dialog" className={PILL}>
          Details
        </button>
      </div>

      <Segments
        name="Side"
        value={side}
        onChange={setSide}
        options={[
          { value: "long", label: "Long", hue: GREEN },
          { value: "short", label: "Short", hue: RED },
        ]}
      />

      <AmountBox
        className="mt-2"
        label="Margin"
        aside={
          <Tip tip={`Free ${num(balance, 2)} ${quote}; Max keeps the fee: ${num(balance, 2)} ÷ (1 + ${lev} × ${(feeRate * 100).toFixed(2)}%) = ${num(maxMargin, 2)}`}>
            <button type="button" onClick={() => setTyped(String(maxMargin))} aria-label={`Use all the free margin, ${num(balance, 2)} ${quote}, fee included`} className={PILL_32}>
              Max
            </button>
          </Tip>
        }
      >
        <input
          value={typed}
          onChange={(e) => {
            const v = e.target.value
            if (/^\d*\.?\d{0,2}$/.test(v)) setTyped(v)
          }}
          placeholder="0"
          inputMode="decimal"
          aria-label={`Margin in ${quote}`}
          className={amountText("lead", !typed)}
        />
        <span className="shrink-0 text-[13px] font-semibold text-foreground/90">{quote}</span>
      </AmountBox>

      {/* the library's slider material (spec 14.5): name and value inside the track, the
          handle inside the fill; no stop labels under it (round 2) */}
      <div className="mt-4">
        <InlineSlider
          label="Leverage"
          ariaLabel="Leverage"
          min={1}
          max={maxLeverage}
          step={1}
          value={lev}
          onChange={(v) => setLev(clamp(Math.round(v), 1, maxLeverage))}
          format={(v) => `${v}×`}
        />
      </div>

      <div role="status" className="mt-3 flex flex-col gap-1.5 px-1">
        <Line label="Position size" value={`${num(notional, 2)} ${quote}`} tip={`margin × leverage = ${num(margin, 2)} × ${lev}`} />
        <Line
          label="Liquidation price"
          tip={`entry × (1 ${long ? "−" : "+"} 1 ÷ ${lev} ${long ? "+" : "−"} ${(maintenance * 100).toFixed(1)}% maintenance) = ${num(entry, 2)} × ${(liquidation / entry).toFixed(4)}`}
          value={
            <span className="flex items-baseline gap-1.5">
              <span className="text-[11px] font-medium" style={{ color: ink(distance >= 0 ? GREEN : RED) }}>
                {distance >= 0 ? "+" : "−"}
                {Math.abs(distance).toFixed(2)}%
              </span>
              <span className="text-[13px] font-semibold">{num(liquidation, 2)}</span>
            </span>
          }
        />
        {/* entry sits at one end; the fill is the room left before liquidation. It follows
            the slider at once (keys and drags repeat), on transform only */}
        <div aria-hidden className="flex h-[3px] rounded-full bg-foreground/[0.1]">
          <span
            className="w-full rounded-full"
            style={{
              transform: `scaleX(${room / 100})`,
              transformOrigin: long ? "right" : "left",
              background: `color-mix(in srgb, ${long ? RED : GREEN} 70%, transparent)`,
            }}
          />
        </div>
      </div>

      {/* the one loud control; its label is the state of the ticket */}
      <PrimaryButton
        className="mt-4"
        state={`${state}-${side}`}
        disabled={!enabled}
        onClick={() => onSubmit?.({ side, margin, leverage: lev, notional, contracts, liquidation })}
        label={verdict}
      />

      <TicketModal open={details} title={`${symbol}, ${long ? "long" : "short"} at ${lev}×`} onClose={() => setDetails(false)}>
        <div className="flex flex-col pb-1">
          <ModalLine label="Entry" value={`${num(entry, 2)} ${quote}`} />
          <ModalLine label="Position size" value={`${num(notional, 2)} ${quote}`} />
          <ModalLine label="Contracts" value={`${num(contracts, 4)} ${base}`} />
          <ModalLine label={`Fee ${(feeRate * 100).toFixed(2)}%`} value={`${num(fee, 2)} ${quote}`} />
          <ModalLine label="Maintenance rate" value={`${(maintenance * 100).toFixed(1)}%`} />
          <ModalLine label="Liquidation" value={`${num(liquidation, 2)} ${quote}`} />
        </div>
        <button type="button" className={cn("mt-2", modalPrimary)} onClick={() => setDetails(false)}>
          Done
        </button>
      </TicketModal>
    </div>
  )
}
