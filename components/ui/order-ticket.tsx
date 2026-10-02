"use client"

import { useId, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

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
   · can be placed buy: total + fee ≤ balance · sell: amount ≤ the amount held */

const EASE = [0.16, 1, 0.3, 1] as const
const TAB_EASE = [0.22, 1, 0.36, 1] as const
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
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
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

function Field({
  label,
  unit,
  value,
  onChange,
  places,
}: {
  label: string
  unit: string
  value: string
  /** leave out for a field that only shows a figure */
  onChange?: (v: string) => void
  places: number
}) {
  const typed = new RegExp(`^\\d*\\.?\\d{0,${places}}$`)
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg bg-foreground/[0.04] px-3 transition-colors duration-150 focus-within:bg-foreground/[0.07]">
      <span className="shrink-0 text-[11px] text-foreground/45">{label}</span>
      <input
        value={value}
        onChange={(e) => {
          if (typed.test(e.target.value)) onChange?.(e.target.value)
        }}
        readOnly={!onChange}
        tabIndex={onChange ? 0 : -1}
        placeholder="0"
        inputMode="decimal"
        aria-label={`${label} in ${unit}`}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-right text-[13px] font-semibold caret-foreground outline-none placeholder:text-foreground/35",
          onChange ? "text-foreground/90" : "text-foreground/45",
        )}
      />
      <span className="w-8 shrink-0 text-[11px] text-foreground/45">{unit}</span>
    </label>
  )
}

/**
 * The spot ticket: buy or sell, limit or market, then price, amount and total as three
 * rows that keep each other true. The lines under them carry the fee and what changes
 * hands, and the white button says what the ticket still needs or what it will do.
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
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
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
          : `${buy ? "Buy" : "Sell"} ${num(amount, sizeDp)} ${base}`

  const fill = (share: number) => {
    const a = cut((largest * share) / 100, sizeDp)
    setLead("amount")
    setAmountStr(a > 0 ? String(a) : "")
  }

  const pills = <T extends string>(name: string, options: readonly T[], value: T, set: (v: T) => void, text: (v: T) => string, hue?: (v: T) => string) => (
    <div role="radiogroup" aria-label={name} className="grid" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => {
        const on = o === value
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => set(o)}
            className={cn(
              "group relative h-7 rounded-full text-[11.5px] font-medium outline-none transition-colors duration-200",
              on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90",
            )}
            style={on && hue ? { color: ink(hue(o)) } : undefined}
          >
            {on &&
              (reduced ? (
                <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
              ) : (
                <motion.span
                  aria-hidden
                  layoutId={`${uid}-${name}`}
                  className="absolute inset-0 rounded-full bg-foreground/[0.08]"
                  transition={{ duration: 0.25, ease: TAB_EASE }}
                />
              ))}
            <span className="relative inline-block transition-transform duration-150 group-active:scale-[0.97] motion-reduce:transition-none motion-reduce:group-active:scale-100">{text(o)}</span>
          </button>
        )
      })}
    </div>
  )

  const line = (label: string, value: string, strong = false, hue?: string) => (
    <div className="flex items-baseline justify-between text-[11px]">
      <span className="text-foreground/45">{label}</span>
      <span className={cn(strong ? "font-semibold text-foreground/90" : "text-foreground/90")} style={hue ? { color: ink(hue) } : undefined}>
        {value}
      </span>
    </div>
  )

  return (
    <div
      className={cn("w-[320px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}
      role="group"
      aria-label={`${symbol} ${type} order, ${verdict}`}
    >
      <div className="mb-3 flex items-baseline justify-between px-1">
        <span className="text-[13px] font-medium text-foreground/90">{symbol}</span>
        <span className="text-[11px] text-foreground/45">
          Bid {num(bid, priceDp)} · ask {num(ask, priceDp)}
        </span>
      </div>

      {pills(
        "Side",
        ["buy", "sell"] as const,
        side,
        setSide,
        (s) => (s === "buy" ? "Buy" : "Sell"),
        (s) => (s === "buy" ? GREEN : RED),
      )}
      <div className="mt-1">{pills("Type", ["limit", "market"] as const, type, setType, (t) => (t === "limit" ? "Limit" : "Market"))}</div>

      <div className="mt-3 flex flex-col gap-1">
        {type === "limit" ? (
          <Field label="Price" unit={quote} value={priceStr} onChange={setPriceStr} places={priceDp} />
        ) : (
          <Field label={buy ? "Best ask" : "Best bid"} unit={quote} value={num(market, priceDp)} places={priceDp} />
        )}
        <Field
          label="Amount"
          unit={base}
          value={lead === "amount" ? amountStr : amount > 0 ? String(amount) : ""}
          onChange={(v) => {
            setLead("amount")
            setAmountStr(v)
          }}
          places={sizeDp}
        />
        <Field
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

      <div className="mt-2 flex items-center justify-between px-1">
        {/* a side switch swaps the balance in place: 4px, 2px blur, 150ms */}
        <motion.span
          key={side}
          className="text-[10.5px] text-foreground/45"
          initial={reduced || side === defaultSide ? false : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          Free {buy ? `${num(quoteBalance, 2)} ${quote}` : `${num(baseBalance, sizeDp)} ${base}`}
        </motion.span>
        <span className="flex items-center">
          {SHARES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => fill(s)}
              aria-label={s === 100 ? "Use the largest amount the balance allows" : `Use ${s}% of the balance`}
              className="h-6 rounded-full px-2 text-[10.5px] text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.08] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] focus-visible:text-foreground/90 active:scale-[0.97] motion-reduce:active:scale-100"
            >
              {s === 100 ? "Max" : `${s}%`}
            </button>
          ))}
        </span>
      </div>

      <div role="status" className="mt-3 flex flex-col gap-1.5 px-1">
        {type === "limit" &&
          line(
            buy ? "From the ask" : "From the bid",
            `${away >= 0 ? "+" : "−"}${Math.abs(away).toFixed(2)}%`,
            false,
            price > 0 ? (away >= 0 ? GREEN : RED) : undefined,
          )}
        {line(`Fee · ${(feeRate * 100).toFixed(2)}%`, `${num(fee, 2)} ${quote}`)}
        {line(buy ? "You pay" : "You receive", `${num(Math.max(0, settle), 2)} ${quote}`, true, state === "short" ? RED : undefined)}
      </div>

      {/* the one solid control; its label is the state of the ticket */}
      <motion.button
        type="button"
        disabled={!enabled}
        onClick={() => onSubmit?.({ side, type, price, amount, total, fee })}
        whileTap={enabled && !reduced ? { scale: 0.98 } : undefined}
        transition={reduced ? { duration: 0 } : LIFT_SPRING}
        className="mt-4 h-11 w-full rounded-full bg-foreground/[0.92] text-[13px] font-semibold text-background outline-none transition-[background-color,opacity] duration-200 enabled:cursor-pointer enabled:hover:bg-foreground enabled:focus-visible:bg-foreground disabled:cursor-not-allowed disabled:opacity-35"
      >
        <AnimatePresence mode="wait" initial={false}>
          {/* keyed by the state and the side, so typing changes the figure without replaying the swap */}
          <motion.span
            key={`${state}-${side}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
            transition={{ duration: reduced ? 0.1 : 0.15, ease: EASE }}
            className="block"
          >
            {verdict}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
