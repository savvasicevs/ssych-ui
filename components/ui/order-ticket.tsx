"use client"

import { useState } from "react"

import { Line, PILL, PrimaryButton, RowField, Segments, TICKET_WIDTH } from "@/components/ui/swap-ticket-field"
import { cn } from "@/lib/utils"

/* Order Ticket, written new through ssych-component (2026-09-29).
   What it is for: placing a limit or a market order with the cost worked out before
   the press: price, amount, total, fee and what leaves or reaches the account.
   Read first: the white button. Its label is the state of the ticket: what is missing,
   what falls short, or the order it will place.
   The pointer: the two switches slide a fill to the chosen side and type; the amount
   and the total are both typed fields and each rewrites the other through the price; the
   share pills fill the amount from the balance; the button presses in when it can be used.
   Sketch used: src/components/lab/OrderTicketPro.tsx. Kept: side and type, one amount
   driving the other through the price, the share pills worked from the largest order the
   balance allows, the fee and total lines, and sufficiency as a state of the button, not an
   error on a field. Left out: the stop type, time in force, post only and reduce only,
   the share slider and the ticking last price; this one is the limit and market ticket.
   Changed: no card or outlined field, fields are rows on a faint fill, the button is white.
   What you pay (or would hand over) turns red once it is more than the balance holds, the
   threshold the button's "Insufficient" names (2026-09-30).
   Reference ("trade ticket" on browsable, listings only, no code read): the idea of
   quick pills that fill the amount, and of the button's label being the validation state.
   Formulas:
   · price         the typed limit; for a market order the best ask (buy) or best bid (sell)
   · total         amount × price
   · amount        when the total is typed: total ÷ price, cut down to the size step
   · fee           total × fee rate
   · you pay       total + fee (buy) · you receive: total − fee (sell)
   · from market   (price − market price) ÷ market price × 100, limit orders only
   · largest       buy: balance ÷ (price × (1 + fee rate)) · sell: the amount held
   · share pills   largest × share, cut down to the size step
   · can be placed buy: total + fee ≤ balance · sell: amount ≤ the amount held
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit: cut from the ticket family's parts (swap-ticket-field.tsx). The fields
   are the family's 48px round row field (they were 8px corners no other ticket used); Buy and
   Sell, Limit and Market are the switch material, the side's colour a 6px dot instead of
   coloured text; the share pills are the control material; the primary is the one 48px white
   BUTTON_PRIMARY. The header's bid and ask are gone (the price field says the one that
   matters), the button reads "Buy BTC" (the amount is in its field), and under the fields only
   Free and You pay stay: the fee and the distance from the ask moved into You pay's tip.
   Formulas are unchanged; "from market" and "fee" are now read in that tip.
   2026-10-02 round 2: (his notes after the side by side): the dots by Buy and Sell are gone; the
   chosen side is its pill tinted in its hue (green Buy, red Sell, 14%) with the word in that
   hue, the other in ink, and the dot before the button's label is gone too. Switching Buy and
   Sell shifted the ticket: the balance line ("Free 25,000.00 USD" beside the four share pills)
   was wide enough to wrap to two lines on one side and not the other. That line is now one
   fixed 24px row that never wraps (the balance truncates before it could), with tighter share
   pills, so a side or type switch changes no size. The fields show focus on their own edge. */

const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const SHARES = [25, 50, 75, 100]

export type OrderSide = "buy" | "sell"
export type OrderType = "limit" | "market"

export interface Order {
  side: OrderSide
  type: OrderType
  price: number
  amount: number
  /** amount × price */
  total: number
  fee: number
}

export interface OrderTicketProps {
  symbol?: string
  /** the asset being bought or sold */
  base?: string
  /** the currency it is priced in */
  quote?: string
  /** best bid: what a market sell fills at */
  bid?: number
  /** best ask: what a market buy fills at */
  ask?: number
  /** free balance of the quote currency */
  quoteBalance?: number
  /** amount of the asset held */
  baseBalance?: number
  defaultSide?: OrderSide
  defaultType?: OrderType
  /** opening limit price, as typed */
  defaultPrice?: string
  /** opening amount, as typed */
  defaultAmount?: string
  /** fee as a fraction of the total */
  feeRate?: number
  priceDp?: number
  /** places the amount is cut to */
  sizeDp?: number
  onSubmit?: (order: Order) => void
  className?: string
}

const num = (n: number, dp: number) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
/** cut down, never up: an order must not round past what the balance allows */
const cut = (n: number, dp: number) => Math.floor(n * 10 ** dp + 1e-9) / 10 ** dp

/**
 * The spot ticket: buy or sell, limit or market, then price, amount and total as three
 * rows that keep each other true. The line under them carries what changes hands, and the
 * white button says what the ticket still needs or what it will do.
 */
export function OrderTicket({
  symbol = "BTC-USD",
  base = "BTC",
  quote = "USD",
  bid = 67412,
  ask = 67413,
  quoteBalance = 25000,
  baseBalance = 0.42,
  defaultSide = "buy",
  defaultType = "limit",
  defaultPrice = "67400",
  defaultAmount = "0.25",
  feeRate = 0.001,
  priceDp = 2,
  sizeDp = 4,
  onSubmit,
  className,
}: OrderTicketProps) {
  const [side, setSide] = useState<OrderSide>(defaultSide)
  const [type, setType] = useState<OrderType>(defaultType)
  const [priceStr, setPriceStr] = useState(defaultPrice)
  const [amountStr, setAmountStr] = useState(defaultAmount)
  const [totalStr, setTotalStr] = useState("")
  /** the field that was typed last; the other is worked from it */
  const [lead, setLead] = useState<"amount" | "total">("amount")

  const buy = side === "buy"
  const market = buy ? ask : bid
  const price = type === "market" ? market : parseFloat(priceStr) || 0
  const amount = lead === "amount" ? parseFloat(amountStr) || 0 : price > 0 ? cut((parseFloat(totalStr) || 0) / price, sizeDp) : 0
  const total = amount * price
  const fee = total * feeRate
  const settle = buy ? total + fee : total - fee
  const largest = buy ? (price > 0 ? quoteBalance / (price * (1 + feeRate)) : 0) : baseBalance
  const away = market > 0 && price > 0 ? ((price - market) / market) * 100 : 0

  const state =
    price <= 0 ? "price" : amount <= 0 ? "amount" : buy ? (total + fee > quoteBalance ? "short" : "ready") : amount > baseBalance ? "short" : "ready"
  const enabled = state === "ready"
  const verdict =
    state === "price"
      ? "Enter a price"
      : state === "amount"
        ? "Enter an amount"
        : state === "short"
          ? `Insufficient ${buy ? quote : base}`
          : `${buy ? "Buy" : "Sell"} ${base}`

  const fill = (share: number) => {
    const a = cut((largest * share) / 100, sizeDp)
    setLead("amount")
    setAmountStr(a > 0 ? String(a) : "")
  }

  /* the formula of You pay: the total, the fee and, for a limit, how far it sits from the market */
  const payTip = [
    `${num(amount, sizeDp)} × ${num(price, priceDp)} = ${num(total, 2)}`,
    `${buy ? "+" : "−"} fee ${(feeRate * 100).toFixed(2)}% = ${num(fee, 2)}`,
    type === "limit" ? `${away >= 0 ? "+" : "−"}${Math.abs(away).toFixed(2)}% from the ${buy ? "ask" : "bid"} (${num(market, priceDp)})` : `at the best ${buy ? "ask" : "bid"}`,
  ].join("; ")

  return (
    <div className={cn(TICKET_WIDTH, "tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)} role="group" aria-label={`${symbol} ${type} order, ${verdict}`}>
      <div className="mb-3 px-1 text-[12px] font-medium text-foreground/90">{symbol}</div>

      <Segments
        name="Side"
        value={side}
        onChange={setSide}
        options={[
          { value: "buy", label: "Buy", hue: GREEN },
          { value: "sell", label: "Sell", hue: RED },
        ]}
      />
      <Segments
        className="mt-1.5"
        name="Type"
        value={type}
        onChange={setType}
        options={[
          { value: "limit", label: "Limit" },
          { value: "market", label: "Market" },
        ]}
      />

      <div className="mt-3 flex flex-col gap-1.5">
        {type === "limit" ? (
          <RowField label="Price" unit={quote} value={priceStr} onChange={setPriceStr} places={priceDp} />
        ) : (
          <RowField label={buy ? "Best ask" : "Best bid"} unit={quote} value={num(market, priceDp)} />
        )}
        <RowField
          label="Amount"
          unit={base}
          value={lead === "amount" ? amountStr : amount > 0 ? String(amount) : ""}
          onChange={(v) => {
            setLead("amount")
            setAmountStr(v)
          }}
          places={sizeDp}
        />
        <RowField
          label="Total"
          unit={quote}
          value={lead === "total" ? totalStr : total > 0 ? total.toFixed(2) : ""}
          onChange={(v) => {
            setLead("total")
            setTotalStr(v)
          }}
          places={2}
        />
      </div>

      {/* one fixed row that never wraps, so a side switch cannot change the ticket's height */}
      <div className="mt-2 flex h-6 items-center justify-between gap-2 px-1">
        <span className="min-w-0 truncate whitespace-nowrap text-[12px] text-foreground/60">
          Free {buy ? `${num(quoteBalance, 2)} ${quote}` : `${num(baseBalance, sizeDp)} ${base}`}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          {SHARES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => fill(s)}
              aria-label={s === 100 ? "Use the largest amount the balance allows" : `Use ${s}% of the balance`}
              className={cn(PILL, "px-2")}
            >
              {s === 100 ? "Max" : `${s}%`}
            </button>
          ))}
        </span>
      </div>

      <div role="status" className="mt-3 whitespace-nowrap px-1">
        <Line label={buy ? "You pay" : "You receive"} value={`${num(Math.max(0, settle), 2)} ${quote}`} strong tip={payTip} hue={state === "short" ? RED : undefined} />
      </div>

      {/* the one loud control; its label is the state of the ticket */}
      <PrimaryButton
        className="mt-4"
        state={`${state}-${side}`}
        disabled={!enabled}
        onClick={() => onSubmit?.({ side, type, price, amount, total, fee })}
        label={verdict}
      />
    </div>
  )
}
