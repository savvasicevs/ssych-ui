"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Cross Chain Swap, written new through ssych-component (2026-09-29).
   What it is for: swapping an asset on one network for an asset on another, with the
   network named on both sides, so "USDC on Ethereum" is never just "USDC".
   Read first: the figure under "You get". It is the whole quote.
   The pointer: the asset pill opens its list in place and a pick closes it; picking the
   asset the other side holds turns the route around; the round button flips both sides,
   network included; the address row is a button; the white button says what is missing
   or what it will do.
   Sketch used: src/components/lab/CrossChainSwap.tsx. Kept: asset on network pairs, the
   network as a readout that follows the asset, a flip that really swaps both sides, the
   quote worked from one price table, the receive address row. Left out: the Swap, Buy/Sell
   and Earn tabs, the settings gear and the order type button, none of which did anything.
   Changed: no card, asset and network marks keep their own colour (Token Icon; letters on
   ink where no mark is on file), the list opens in the flow in place of
   a floating menu, the button is white and carries the state, a route fee is a line of its
   own (the sketch priced the route at no fee), and the ticket opens with an amount in it.
   Formulas:
   · pay value    amount × pay price
   · route fee    pay value × fee rate
   · you get      (pay value − route fee) ÷ get price
   · get value    you get × get price
   · rate         pay price ÷ get price
   · can be sent  0 < amount ≤ balance of the pay asset
   Library (2026-09-30): ships alone, so a mark is a disc in its --coin-<symbol> colour with
   its letters in white; `renderIcon` draws the real mark in its place. */

const EASE = [0.16, 1, 0.3, 1] as const
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
/** a balance the amount runs past is a threshold crossed, so it reads red */
const RED = "var(--chart-down)"

export interface ChainAsset {
  symbol: string
  name: string
  /** the network the asset lives on */
  chain: string
  /** the network's own token, drawn as its mark */
  chainSymbol: string
  /** price in dollars */
  price: number
  /** amount held */
  balance: number
  /** the wallet's address on that network, already shortened */
  address: string
}

export interface CrossChainQuote {
  pay: ChainAsset
  get: ChainAsset
  amount: number
  /** in dollars */
  fee: number
  /** amount of the get asset */
  out: number
}

export interface CrossChainSwapProps {
  assets?: ChainAsset[]
  /** index of the asset paid with */
  defaultPay?: number
  /** index of the asset received */
  defaultGet?: number
  /** opening amount, as typed */
  defaultAmount?: string
  /** route fee as a fraction of the value paid */
  feeRate?: number
  onSwap?: (quote: CrossChainQuote) => void
  onEditAddress?: (asset: ChainAsset) => void
  /** draws an asset or network mark in place of the built-in disc */
  renderIcon?: (symbol: string, size: number) => ReactNode
  className?: string
}

const DEFAULT_ASSETS: ChainAsset[] = [
  { symbol: "ETH", name: "Ethereum", chain: "Ethereum", chainSymbol: "ETH", price: 3050, balance: 4.1, address: "0x8f3C…9aD1" },
  { symbol: "BTC", name: "Bitcoin", chain: "Bitcoin", chainSymbol: "BTC", price: 64619, balance: 0.42, address: "bc1qxy…0wlh" },
  { symbol: "SOL", name: "Solana", chain: "Solana", chainSymbol: "SOL", price: 148, balance: 28, address: "7xKXtg…gAsU" },
  { symbol: "USDC", name: "USD Coin", chain: "Ethereum", chainSymbol: "ETH", price: 1, balance: 1500, address: "0x8f3C…9aD1" },
  { symbol: "BNB", name: "BNB", chain: "BNB Chain", chainSymbol: "BNB", price: 578, balance: 3.7, address: "0x8f3C…9aD1" },
  { symbol: "XRP", name: "XRP", chain: "XRP Ledger", chainSymbol: "XRP", price: 2.2, balance: 340, address: "rN7n7o…k9tt" },
]

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const upTo = (n: number, dp: number) => n.toLocaleString("en-US", { maximumFractionDigits: dp })

/* the brand colour of each mark, only ever the fallback of its --coin-<symbol> property;
   a glyph colour is given where white would not read on the disc */
const MARKS: Record<string, { disc: string; glyph?: string }> = {
  ETH: { disc: "var(--coin-eth, #627eea)" },
  BTC: { disc: "var(--coin-btc, #f7931a)" },
  SOL: { disc: "var(--coin-sol, #9945ff)" },
  USDC: { disc: "var(--coin-usdc, #2775ca)" },
  USDT: { disc: "var(--coin-usdt, #26a17b)" },
  BNB: { disc: "var(--coin-bnb, #f3ba2f)", glyph: "var(--coin-bnb-glyph, #000)" },
  XRP: { disc: "var(--coin-xrp, #23292f)" },
  AVAX: { disc: "var(--coin-avax, #e84142)" },
  ARB: { disc: "var(--coin-arb, #28a0f0)" },
  OP: { disc: "var(--coin-op, #ff0420)" },
  POL: { disc: "var(--coin-pol, #8247e5)" },
}

function Mark({ symbol, quiet = false, renderIcon }: { symbol: string; quiet?: boolean; renderIcon?: (symbol: string, size: number) => ReactNode }) {
  if (renderIcon) return <>{renderIcon(symbol, 24)}</>
  const mark = MARKS[symbol.toUpperCase()]
  if (mark)
    return (
      <span
        aria-hidden
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[8px] font-semibold"
        style={{ background: mark.disc, color: mark.glyph ?? "var(--coin-glyph, #fff)" }}
      >
        {symbol.slice(0, 3)}
      </span>
    )
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[8px] font-semibold",
        quiet ? "bg-foreground/[0.06] text-foreground/45" : "bg-foreground/[0.12] text-foreground/90",
      )}
    >
      {symbol.slice(0, 3)}
    </span>
  )
}

/**
 * The bridge ticket: each side is an asset on a network, the amount paid is typed and the
 * amount received is worked from the prices less the route fee. The flip turns the whole
 * route around and the white button carries the state of the ticket.
 */
export function CrossChainSwap({
  assets = DEFAULT_ASSETS,
  defaultPay = 0,
  defaultGet = 1,
  defaultAmount = "1.5",
  feeRate = 0.001,
  onSwap,
  onEditAddress,
  renderIcon,
  className,
}: CrossChainSwapProps) {
  const reduced = useReducedMotion()
  const [payAt, setPayAt] = useState(defaultPay)
  const [getAt, setGetAt] = useState(defaultGet)
  const [amountStr, setAmountStr] = useState(defaultAmount)
  const [open, setOpen] = useState<"pay" | "get" | null>(null)
  const [turns, setTurns] = useState(0)

  const pay = assets[payAt] ?? assets[0]
  const get = assets[getAt] ?? assets[0]
  const amount = parseFloat(amountStr) || 0
  const payValue = amount * pay.price
  const fee = payValue * feeRate
  const out = get.price > 0 ? (payValue - fee) / get.price : 0
  const rate = get.price > 0 ? pay.price / get.price : 0

  const state = amount <= 0 ? "amount" : amount > pay.balance ? "short" : "ready"
  const verdict = state === "amount" ? "Enter an amount" : state === "short" ? `Insufficient ${pay.symbol}` : `Swap ${pay.symbol} for ${get.symbol}`

  const flip = () => {
    setPayAt(getAt)
    setGetAt(payAt)
    setOpen(null)
    setTurns((t) => t + 1)
  }
  const pick = (side: "pay" | "get", i: number) => {
    if (i === (side === "pay" ? getAt : payAt)) flip()
    else if (side === "pay") setPayAt(i)
    else setGetAt(i)
    setOpen(null)
  }

  const side = (key: "pay" | "get", label: string, asset: ChainAsset, at: number) => (
    <div>
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[11px] text-foreground/45">{label}</span>
        <span
          className="text-[10.5px] text-foreground/45 transition-colors duration-150 motion-reduce:transition-none"
          style={key === "pay" && state === "short" ? { color: RED } : undefined}
        >
          Balance {upTo(asset.balance, 4)} {asset.symbol}
        </span>
      </div>
      {/* 16 (the 32px asset pill) + 10 top padding = 26 */}
      <div className="mt-1.5 rounded-[26px] bg-foreground/[0.04] px-3 py-2.5 transition-colors duration-150 focus-within:bg-foreground/[0.06]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => (o === key ? null : key))}
            aria-expanded={open === key}
            aria-label={`${label}: ${asset.symbol} on ${asset.chain}, change asset`}
            className="flex h-8 items-center gap-1.5 rounded-full bg-foreground/[0.08] pl-1 pr-2.5 outline-none transition-colors duration-150 hover:bg-foreground/[0.12] focus-visible:bg-foreground/[0.12]"
          >
            <Mark symbol={asset.symbol} renderIcon={renderIcon} />
            <span className="text-[12px] font-semibold text-foreground/90">{asset.symbol}</span>
            <svg aria-hidden width="8" height="8" viewBox="0 0 8 8" fill="none" className={cn("transition-transform duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", open === key && "rotate-180")}>
              <path d="M1 2.5 4 5.5 7 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/45" />
            </svg>
          </button>
          <span className="text-[11px] text-foreground/45">on</span>
          {/* the network is a readout: it follows the asset and cannot be pressed */}
          <span className="flex h-8 items-center gap-1.5 pr-1">
            <Mark symbol={asset.chainSymbol} quiet renderIcon={renderIcon} />
            <span className="text-[12px] text-foreground/70">{asset.chain}</span>
          </span>
        </div>

        {/* the list opens in the flow: the grid row grows from 0fr to 1fr over 250ms and the
            chevron turns with it; closed, it is inert so nothing in it takes focus */}
        <div
          className="grid transition-[grid-template-rows,opacity] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ gridTemplateRows: open === key ? "1fr" : "0fr", opacity: open === key ? 1 : 0 }}
          inert={open !== key}
        >
            <div className="min-h-0 overflow-hidden">
              <div role="listbox" aria-label={`${label}, assets`} className="grid grid-cols-3 gap-1 pt-2">
                {assets.map((a, i) => {
                  const on = i === at
                  return (
                    <button
                      key={`${a.symbol}-${a.chain}`}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => pick(key, i)}
                      className={cn(
                        "rounded-[4px] px-2 py-1.5 text-left outline-none transition-colors duration-150 hover:bg-foreground/[0.08] focus-visible:bg-foreground/[0.08]",
                        on && "bg-foreground/[0.08]",
                      )}
                    >
                      <span className="block text-[11.5px] font-semibold text-foreground/90">{a.symbol}</span>
                      <span className="block truncate text-[9.5px] text-foreground/45">on {a.chain}</span>
                    </button>
                  )
                })}
              </div>
            </div>
        </div>

        {key === "pay" ? (
          <input
            value={amountStr}
            onChange={(e) => {
              if (/^\d*\.?\d{0,8}$/.test(e.target.value)) setAmountStr(e.target.value)
            }}
            placeholder="0"
            inputMode="decimal"
            aria-label={`Amount of ${asset.symbol} to pay`}
            className="mt-2 w-full bg-transparent text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90 caret-foreground outline-none placeholder:text-foreground/35"
          />
        ) : (
          <div className={cn("mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em]", out > 0 ? "text-foreground/90" : "text-foreground/35")}>
            {out > 0 ? upTo(out, 6) : "0"}
          </div>
        )}
        <div className="mt-1.5 text-[11px] text-foreground/45">≈ {usd(key === "pay" ? payValue : out * asset.price)}</div>
      </div>
    </div>
  )

  const line = (label: string, value: string) => (
    <div className="flex items-baseline justify-between text-[11px]">
      <span className="text-foreground/45">{label}</span>
      <span className="text-foreground/90">{value}</span>
    </div>
  )

  return (
    <div
      className={cn("w-[340px] max-w-full tabular-nums", className)}
      role="group"
      aria-label={`Swap ${pay.symbol} on ${pay.chain} for ${get.symbol} on ${get.chain}, ${verdict}`}
    >
      {side("pay", "Pay with", pay, payAt)}

      <div className="my-1.5 flex justify-center">
        <motion.button
          type="button"
          onClick={flip}
          aria-label="Turn the route around"
          animate={{ rotate: turns * 180 }}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={reduced ? { duration: 0 } : { rotate: { duration: 0.3, ease: EASE }, scale: LIFT_SPRING }}
          className="grid h-7 w-7 place-items-center rounded-full bg-foreground/[0.08] text-foreground/70 outline-none transition-colors duration-150 hover:bg-foreground/[0.12] hover:text-foreground/90 focus-visible:bg-foreground/[0.12]"
        >
          <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1.5v9M2.5 7 6 10.5 9.5 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
      </div>

      {side("get", "You get", get, getAt)}

      <div role="status" className="mt-3 flex flex-col gap-1.5 px-1">
        {line("Rate", `1 ${pay.symbol} = ${upTo(rate, 6)} ${get.symbol}`)}
        {line(`Route fee · ${(feeRate * 100).toFixed(2)}%`, usd(fee))}
      </div>

      <button
        type="button"
        onClick={() => onEditAddress?.(get)}
        aria-label={`Receive address on ${get.chain}, ${get.address}, edit`}
        className="group mt-2 flex w-full items-baseline justify-between border-t border-foreground/[0.05] px-1 pt-2 text-[11px] outline-none"
      >
        <span className="text-foreground/45">Receive on {get.chain}</span>
        <span className="text-foreground/70 transition-colors duration-150 group-hover:text-foreground group-focus-visible:text-foreground">
          {get.address} <span className="text-foreground/45 transition-colors duration-150 group-hover:text-foreground/90">· Edit</span>
        </span>
      </button>

      {/* the one solid control; its label is the state of the ticket */}
      <motion.button
        type="button"
        disabled={state !== "ready"}
        onClick={() => onSwap?.({ pay, get, amount, fee, out })}
        whileTap={state === "ready" && !reduced ? { scale: 0.97 } : undefined}
        transition={reduced ? { duration: 0 } : LIFT_SPRING}
        className="mt-4 h-11 w-full rounded-full bg-foreground/[0.92] text-[13px] font-semibold text-background outline-none transition-[background-color,opacity] duration-200 enabled:cursor-pointer enabled:hover:bg-foreground enabled:focus-visible:bg-foreground disabled:cursor-not-allowed disabled:opacity-35"
      >
        {/* the state swaps in place: a 4px rise through a 2px blur */}
        <motion.span
          key={verdict}
          className="inline-block"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          {verdict}
        </motion.span>
      </motion.button>
    </div>
  )
}
