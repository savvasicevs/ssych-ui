"use client"

import { useState, type ReactNode } from "react"
import { ChevronRight, Settings } from "lucide-react"

import { ChainPicker } from "@/components/ui/cross-chain-swap-picker"

import { ICON_BUTTON } from "@/components/ui/control-classes"
import { AmountBox, FlipButton, Line, PILL, PrimaryButton, Segments, TICKET_WIDTH, amountText } from "@/components/ui/swap-ticket-field"
import { TicketModal, modalField, modalPrimary, modalSecondary } from "@/components/ui/swap-ticket-modal"
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
   its letters in white; `renderIcon` draws the real mark in its place.
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit, redesigned (his list: "things should be clickable; more functionality"):
   the cross-chain member of the swap family, cut from the same parts as Swap Ticket and Swap
   Confirm (swap-ticket-field.tsx, swap-ticket-modal.tsx) at 320 wide. Each side is the
   family's amount field (28 = the 32px chips' 16 + 12) holding two dropdowns: the asset, and
   the network, which lists only the networks that asset lives on (USDC on Ethereum, Arbitrum or
   Optimism); the network was a readout and the asset list a cramped grid in the field. Max
   sits on the balance line. The receive figure is the quote read first (22px), the typed
   amount 17px. Under the fields: the rate and a route line (time and fee), each with its
   formula on hover; the receive address is a row that opens a popup to edit or paste it
   (it called an `onEditAddress` nobody passed). A gear opens the slippage. The primary is
   the family's 48px white button and reads "Swap ETH on Ethereum for BTC". The sample book
   gained ETH and USDC on Arbitrum and Optimism so the network choice has something to choose.
   Formulas (added):
   · route time   confirmation time of the pay network + of the get network, in whole
                  minutes, at least 1 (SETTLE below, or a chain's own `settle`)
   · minimum      you get × (1 − slippage), in the settings popup
   2026-10-02 round 2: (his notes: "the Bitcoin is right under the arrow, and the chains look
   weird in there. Maybe on hover you're able to change the token and the chain, and the chain
   is a little bit more minimal"; and for every swap, the balance overlaps the flip arrow).
   Each side is one chip (cross-chain-swap-picker.tsx): the token's mark with the network's mark
   small on its corner, the symbol and a chevron; pointing at it says what it holds and that it
   changes both, pressing it opens one picker with a compact row of network marks on top and
   every token on every network under it. The second full pill for the network is gone; the
   network is named quietly in the field's label ("Pay from Ethereum", "Get on Bitcoin"). Max
   moved from the balance line into the amount row, and both fields keep a clear lane over the
   flip (AmountBox `seam`), so neither the chip nor the balance sits under the arrow. The
   address popup's field shows focus on its own edge. A pick goes straight to its entry
   (token and network at once); picking what the other side holds still turns the route
   around. Formulas are unchanged. */

const RED = "var(--chart-down)"
const SLIPPAGES = ["0.1%", "0.5%", "1%"] as const
type Slip = (typeof SLIPPAGES)[number]

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
  /** minutes a transfer on this network takes to confirm (SETTLE has the defaults) */
  settle?: number
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
  /** fired when the receive address popup opens, and with the new address when it is saved */
  onEditAddress?: (asset: ChainAsset, address?: string) => void
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
  { symbol: "ETH", name: "Ethereum", chain: "Optimism", chainSymbol: "OP", price: 3050, balance: 0.85, address: "0x8f3C…9aD1" },
  { symbol: "ETH", name: "Ethereum", chain: "Arbitrum", chainSymbol: "ARB", price: 3050, balance: 1.2, address: "0x8f3C…9aD1" },
  { symbol: "USDC", name: "USD Coin", chain: "Optimism", chainSymbol: "OP", price: 1, balance: 620, address: "0x8f3C…9aD1" },
  { symbol: "USDC", name: "USD Coin", chain: "Arbitrum", chainSymbol: "ARB", price: 1, balance: 240, address: "0x8f3C…9aD1" },
]

/** minutes to confirm a transfer, by network: sample figures for the route line */
const SETTLE: Record<string, number> = {
  Ethereum: 1,
  Bitcoin: 10,
  Solana: 0.2,
  "BNB Chain": 0.3,
  "XRP Ledger": 0.1,
  Optimism: 0.3,
  Arbitrum: 0.3,
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const upTo = (n: number, dp: number) => n.toLocaleString("en-US", { maximumFractionDigits: dp })
const settleOf = (a: ChainAsset) => a.settle ?? SETTLE[a.chain] ?? 1

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

function Mark({ symbol, size = 24, renderIcon }: { symbol: string; size?: number; renderIcon?: (symbol: string, size: number) => ReactNode }) {
  if (renderIcon) return <span className="inline-flex shrink-0">{renderIcon(symbol, size)}</span>
  const mark = MARKS[symbol.toUpperCase()]
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold", !mark && "bg-foreground/[0.12] text-foreground/90")}
      style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.33)), background: mark?.disc, color: mark ? (mark.glyph ?? "var(--coin-glyph, #fff)") : undefined }}
    >
      {symbol.slice(0, 3)}
    </span>
  )
}

/**
 * The bridge ticket: each side is an asset on a network, both picked from dropdowns; the
 * amount paid is typed and the amount received is worked from the prices less the route fee.
 * The flip turns the whole route around, the address row opens its own popup, and the white
 * button carries the state of the ticket.
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
  const [payAt, setPayAt] = useState(defaultPay)
  const [getAt, setGetAt] = useState(defaultGet)
  const [amountStr, setAmountStr] = useState(defaultAmount)
  const [slip, setSlip] = useState<Slip>("0.5%")
  const [settings, setSettings] = useState(false)
  /** addresses typed by hand, by network */
  const [typedAddress, setTypedAddress] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  const pay = assets[payAt] ?? assets[0]
  const get = assets[getAt] ?? assets[0]
  const amount = parseFloat(amountStr) || 0
  const payValue = amount * pay.price
  const fee = payValue * feeRate
  const out = get.price > 0 ? (payValue - fee) / get.price : 0
  const rate = get.price > 0 ? pay.price / get.price : 0
  const minutes = Math.max(1, Math.ceil(settleOf(pay) + settleOf(get)))
  const slipPct = parseFloat(slip)
  const address = typedAddress[get.chain] ?? get.address

  const state = amount <= 0 ? "amount" : amount > pay.balance ? "short" : "ready"
  const verdict = state === "amount" ? "Enter an amount" : state === "short" ? `Insufficient ${pay.symbol}` : `Swap ${pay.symbol} on ${pay.chain} for ${get.symbol}`

  const flip = () => {
    setPayAt(getAt)
    setGetAt(payAt)
  }
  /* an index for a side's new asset or network; picking what the other side holds turns the route around */
  const choose = (side: "pay" | "get", i: number) => {
    if (i < 0) return
    if (i === (side === "pay" ? getAt : payAt)) flip()
    else if (side === "pay") setPayAt(i)
    else setGetAt(i)
  }
  const markOf = (symbol: string, size: number) => <Mark symbol={symbol} size={size} renderIcon={renderIcon} />
  const chip = (side: "pay" | "get") => (
    <ChainPicker
      assets={assets}
      value={side === "pay" ? payAt : getAt}
      onPick={(i) => choose(side, i)}
      label={side === "pay" ? "Asset to pay with" : "Asset to get"}
      mark={markOf}
    />
  )
  /** the field's label with its network named quietly after it */
  const named = (word: string, joint: string, a: ChainAsset) => (
    <>
      {word} <span className="text-foreground/45">{joint} {a.chain}</span>
    </>
  )

  return (
    <div className={cn(TICKET_WIDTH, "tabular-nums", className)} role="group" aria-label={`Swap ${pay.symbol} on ${pay.chain} for ${get.symbol} on ${get.chain}, ${verdict}`}>
      <div className="mb-2 flex items-center justify-between pl-1">
        <span className="text-[12px] font-medium text-foreground/90">Cross-chain swap</span>
        <button type="button" aria-label="Swap settings" aria-haspopup="dialog" onClick={() => setSettings(true)} className={cn("h-8 w-8", ICON_BUTTON)}>
          <Settings size={15} aria-hidden />
        </button>
      </div>

      <div className="relative flex flex-col gap-1">
        <AmountBox
          label={named("Pay", "from", pay)}
          aside={chip("pay")}
          seam="bottom"
          foot={usd(payValue)}
          footAside={
            <span className="truncate" style={state === "short" ? { color: RED } : undefined}>
              Balance {upTo(pay.balance, 4)}
            </span>
          }
        >
          <input
            value={amountStr}
            onChange={(e) => {
              if (/^\d*\.?\d{0,8}$/.test(e.target.value)) setAmountStr(e.target.value)
            }}
            placeholder="0"
            inputMode="decimal"
            aria-label={`Amount of ${pay.symbol} to pay`}
            className={amountText("second", !amountStr)}
          />
          {/* Max sits in the amount row, clear of the flip on the seam */}
          <button type="button" onClick={() => setAmountStr(String(pay.balance))} aria-label={`Use the full balance, ${upTo(pay.balance, 4)} ${pay.symbol}`} className={cn("shrink-0", PILL)}>
            Max
          </button>
        </AmountBox>
        <FlipButton onClick={flip} label="Turn the route around" />
        <AmountBox label={named("Get", "on", get)} seam="top" aside={chip("get")} foot={usd(out * get.price)} footAside={<span>Balance {upTo(get.balance, 4)}</span>}>
          <span className={cn(amountText("lead", out <= 0), "truncate")}>{out > 0 ? upTo(out, 6) : "0"}</span>
        </AmountBox>
      </div>

      <div role="status" className="flex flex-col gap-1.5 px-1 pt-3">
        <Line label="Rate" value={`1 ${pay.symbol} = ${upTo(rate, 6)} ${get.symbol}`} tip={`${pay.symbol} price ÷ ${get.symbol} price = ${usd(pay.price)} ÷ ${usd(get.price)}`} />
        <Line
          label="Route"
          value={`About ${minutes} min, fee ${usd(fee)}`}
          tip={`time: ${pay.chain} ${settleOf(pay)} min + ${get.chain} ${settleOf(get)} min, rounded up; fee: ${usd(payValue)} × ${(feeRate * 100).toFixed(2)}%`}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          setDraft(address)
          setEditing(true)
          onEditAddress?.(get)
        }}
        aria-haspopup="dialog"
        aria-label={`Receive address on ${get.chain}, ${address}, edit`}
        className="group mt-1.5 flex w-full items-center justify-between gap-2 rounded-full px-1 py-1 text-[12px] outline-none"
      >
        <span className="text-foreground/60">Receive on {get.chain}</span>
        <span className="flex items-center gap-1 text-foreground/90 transition-colors duration-150 group-hover:text-foreground group-focus-visible:text-foreground">
          {address}
          <ChevronRight size={14} aria-hidden className="text-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </button>

      {/* the one loud control; its label is the state of the ticket */}
      <PrimaryButton
        className="mt-3"
        state={state === "ready" ? `ready-${pay.symbol}-${pay.chain}-${get.symbol}` : state}
        disabled={state !== "ready"}
        onClick={() => onSwap?.({ pay, get, amount, fee, out })}
        label={verdict}
      />

      <TicketModal open={editing} title={`Receive on ${get.chain}`} onClose={() => setEditing(false)}>
        <div className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Your ${get.chain} address`} aria-label={`Address on ${get.chain}`} className={modalField} />
          <button
            type="button"
            className={modalSecondary}
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText()
                if (text.trim()) setDraft(text.trim())
              } catch {
                /* the page may not read the clipboard; the field still takes a typed address */
              }
            }}
          >
            Paste
          </button>
        </div>
        <p className="px-3 pt-2 text-[12px] text-foreground/60">Only {get.chain} addresses. Funds sent to another network are lost.</p>
        <button
          type="button"
          disabled={!draft.trim()}
          className={cn("mt-3", modalPrimary)}
          onClick={() => {
            setTypedAddress((m) => ({ ...m, [get.chain]: draft.trim() }))
            onEditAddress?.(get, draft.trim())
            setEditing(false)
          }}
        >
          Save address
        </button>
      </TicketModal>

      <TicketModal open={settings} title="Swap settings" onClose={() => setSettings(false)}>
        <div className="px-3 pb-2 text-[12px] text-foreground/60">Max slippage</div>
        <Segments name="Max slippage" value={slip} onChange={setSlip} options={SLIPPAGES.map((s) => ({ value: s, label: s }))} />
        <p className="px-3 pt-2 text-[12px] text-foreground/60">
          {out > 0 ? `The least you get is ${upTo(out * (1 - slipPct / 100), 6)} ${get.symbol}: ${upTo(out, 6)} × (1 − ${slip}).` : "Enter an amount to see the least you get."}
        </p>
        <button type="button" className={cn("mt-3", modalPrimary)} onClick={() => setSettings(false)}>
          Done
        </button>
      </TicketModal>
    </div>
  )
}
