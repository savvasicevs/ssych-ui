"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { AmountBox, FlipButton, Line, PILL, PrimaryButton, TICKET_WIDTH, amountText } from "@/components/ui/swap-ticket-field"
import { TicketSelect } from "@/components/ui/swap-ticket-modal"
import { cn } from "@/lib/utils"

/* Swap Confirm, written new through ssych-component (2026-09-29).
   What it is for: converting one holding into another and seeing, before the press, what
   arrives, at what rate and the least that can arrive.
   Read first: the figure under "You receive".
   The pointer: the amount is typed; Half and Max fill it from the balance; the round button
   turns the pair around; the white button walks its states (link account, linking, enter
   an amount, insufficient, confirm, placing) and says which one it is in.
   Sketch used: src/components/lab/SwapModal.tsx. Kept: the two panels, the typed amount
   with Half and Max, the flip, the whole button state machine and the rate line. It was
   a modal; here the content is open and in the flow, with no overlay.
   Left out: the Market, Limit and Stop tabs and the settings gear (they changed nothing),
   the spinner, the funding account chip.
   Changed: the Buy and Sell switch is gone. In the sketch it only recoloured the button and
   renamed the panel that is paid from as "Buy", which was wrong; the panels are now "You
   sell" and "You receive" and the flip changes direction. The rate is worked from the two
   prices (the sketch typed 0.5487 beside them). Slippage became two lines that add up.
   Formulas:
   · sell value     amount × price of the asset sold
   · you receive    sell value ÷ price of the asset received
   · rate           price sold ÷ price received
   · minimum        you receive × (1 − max slippage)
   · can be placed  linked, 0 < amount ≤ balance of the asset sold
   Marks (2026-09-30): a token shows its real mark (TokenIcon), a company or a wallet its
   real logo (BrandIcon); two letters on an ink disc only where no mark exists.
   Library (2026-09-30): ships alone, so a mark is a disc in its --coin-<symbol> colour with
   its letters in white; `renderIcon` draws the real mark in its place.
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit: the confirm member of the swap family, cut from the same parts as Swap
   Ticket and Cross Chain Swap (swap-ticket-field.tsx, swap-ticket-modal.tsx) at 320 wide:
   the amount field (28 = the 32px chip's 16 + 12), the flip on the seam, the 48px white
   BUTTON_PRIMARY. The figure under You receive is read first, so it is the 22px one and the
   typed amount 17px. Under the fields only Rate and Minimum received stay; the slippage is
   in the minimum's formula and the $0.00 commission line is gone. The ready label is
   "Confirm" (the amount is in its field). Each side's chip opens the shared dropdown over a
   book of holdings (new prop `choices`), so the pair can be changed; picking the asset the
   other side holds turns the pair around. Formulas are unchanged.
   Shown where: rate on its line (tip: price ÷ price); minimum on its line (tip: you receive
   × (1 − slippage)).
   2026-10-02 round 2: (his notes after the side by side, for every swap): the held line ran
   under the flip arrow at the seam. Half and Max moved from that line into the amount row,
   right of the typed figure, and both fields keep a clear lane over the arrow (AmountBox
   `seam`), so nothing touches it. The amount field shows focus on its own edge. Formulas are
   unchanged. */

const LINK_MS = 1100
const PLACE_MS = 1400

export interface SwapAsset {
  symbol: string
  name: string
  /** price in dollars */
  price: number
  /** amount held */
  balance: number
}

export interface SwapOrder {
  sell: SwapAsset
  receive: SwapAsset
  amount: number
  received: number
  minimum: number
}

export interface SwapConfirmProps {
  /** the pair; the first is sold, the second received, until it is flipped or changed */
  assets?: [SwapAsset, SwapAsset]
  /** the holdings either side can be changed to; the pair is added when missing */
  choices?: SwapAsset[]
  /** opening amount, as typed */
  defaultAmount?: string
  /** whether the account is linked when it opens */
  defaultLinked?: boolean
  /** the worst fill accepted, as a fraction */
  slippage?: number
  onConfirm?: (order: SwapOrder) => void
  /** draws a token, company or wallet mark in place of the built-in disc */
  renderIcon?: (symbol: string, size: number) => ReactNode
  className?: string
}

const DEFAULT_ASSETS: [SwapAsset, SwapAsset] = [
  { symbol: "MSFT", name: "Microsoft Corp", price: 415.6, balance: 76.0132 },
  { symbol: "AAPL", name: "Apple Inc", price: 228.02, balance: 12.402 },
]

const DEFAULT_CHOICES: SwapAsset[] = [
  ...DEFAULT_ASSETS,
  { symbol: "NVDA", name: "NVIDIA Corp", price: 121.44, balance: 40 },
  { symbol: "GOOGL", name: "Alphabet Inc", price: 167.3, balance: 8.5 },
  { symbol: "AMZN", name: "Amazon.com Inc", price: 186.9, balance: 5.25 },
  { symbol: "TSLA", name: "Tesla Inc", price: 178.52, balance: 3 },
]

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const upTo = (n: number, dp: number) => n.toLocaleString("en-US", { maximumFractionDigits: dp })
const cut = (n: number, dp: number) => Math.floor(n * 10 ** dp + 1e-9) / 10 ** dp

/* the brand colour of each mark, only ever the fallback of its --coin-<symbol> property;
   a glyph colour is given where white would not read on the disc; a symbol with no brand
   colour (AAPL) stays letters on an ink disc */
const MARKS: Record<string, { disc: string; glyph?: string }> = {
  MSFT: { disc: "var(--coin-msft, #00a4ef)" },
  GOOGL: { disc: "var(--coin-googl, #4285f4)" },
  AMZN: { disc: "var(--coin-amzn, #ff9900)", glyph: "var(--coin-amzn-glyph, #000)" },
  NVDA: { disc: "var(--coin-nvda, #76b900)" },
  TSLA: { disc: "var(--coin-tsla, #cc0000)" },
  META: { disc: "var(--coin-meta, #0467df)" },
  BTC: { disc: "var(--coin-btc, #f7931a)" },
  ETH: { disc: "var(--coin-eth, #627eea)" },
  SOL: { disc: "var(--coin-sol, #9945ff)" },
  USDC: { disc: "var(--coin-usdc, #2775ca)" },
}

/**
 * The convert ticket, open: what is sold on top, what arrives under it, then the rate and the
 * least that can arrive. The white button is the state of the ticket and the only thing that
 * places it.
 */
export function SwapConfirm({
  assets = DEFAULT_ASSETS,
  choices,
  defaultAmount = "20",
  defaultLinked = true,
  slippage = 0.005,
  onConfirm,
  renderIcon,
  className,
}: SwapConfirmProps) {
  const reduced = useReducedMotion()
  const book = (() => {
    const list = [...(choices ?? (assets === DEFAULT_ASSETS ? DEFAULT_CHOICES : assets))]
    for (const a of assets) if (!list.some((c) => c.symbol === a.symbol)) list.push(a)
    return list
  })()
  const [sell, setSell] = useState<SwapAsset>(assets[0])
  const [receive, setReceive] = useState<SwapAsset>(assets[1])
  const [amountStr, setAmountStr] = useState(defaultAmount)
  const [linked, setLinked] = useState(defaultLinked)
  const [phase, setPhase] = useState<"idle" | "linking" | "placing">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const amount = parseFloat(amountStr) || 0
  const sellValue = amount * sell.price
  const received = receive.price > 0 ? sellValue / receive.price : 0
  const rate = receive.price > 0 ? sell.price / receive.price : 0
  const minimum = received * (1 - slippage)

  const state =
    phase === "linking" ? "linking" : !linked ? "link" : phase === "placing" ? "placing" : amount <= 0 ? "amount" : amount > sell.balance ? "short" : "ready"
  const verdict = {
    linking: "Linking…",
    link: "Link account",
    placing: "Placing…",
    amount: "Enter an amount",
    short: `Insufficient ${sell.symbol}`,
    ready: "Confirm",
  }[state]
  const enabled = state === "link" || state === "ready"

  const flip = () => {
    setSell(receive)
    setReceive(sell)
    setAmountStr("")
  }
  const pick = (side: "sell" | "receive", symbol: string) => {
    const a = book.find((c) => c.symbol === symbol)
    if (!a) return
    if (a.symbol === (side === "sell" ? receive : sell).symbol) return flip()
    if (side === "sell") {
      setSell(a)
      setAmountStr("")
    } else setReceive(a)
  }

  const press = () => {
    if (state === "link") {
      setPhase("linking")
      timer.current = setTimeout(() => {
        setLinked(true)
        setPhase("idle")
      }, LINK_MS)
    } else if (state === "ready") {
      onConfirm?.({ sell, receive, amount, received, minimum })
      setPhase("placing")
      timer.current = setTimeout(() => {
        setPhase("idle")
        setAmountStr("")
      }, PLACE_MS)
    }
  }

  const mark = (asset: SwapAsset, size: number) => {
    if (renderIcon) return <span className="inline-flex shrink-0">{renderIcon(asset.symbol, size)}</span>
    const m = MARKS[asset.symbol.toUpperCase()]
    return (
      <span
        aria-hidden
        className={cn("grid shrink-0 place-items-center rounded-full font-semibold", !m && "bg-foreground/[0.12] text-foreground/90")}
        style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.35)), background: m?.disc, color: m ? (m.glyph ?? "var(--coin-glyph, #fff)") : undefined }}
      >
        {asset.symbol.slice(0, 2)}
      </span>
    )
  }
  const options = book.map((a) => ({ value: a.symbol, label: a.symbol, hint: a.name, icon: mark(a, 22) }))
  const chip = (side: "sell" | "receive", asset: SwapAsset) => (
    <TicketSelect
      look="chip"
      label={side === "sell" ? "Holding to sell" : "Holding to receive"}
      value={asset.symbol}
      options={options}
      onChange={(v) => pick(side, v)}
      trigger={
        <>
          {mark(asset, 24)}
          <span className="text-foreground/90">{asset.symbol}</span>
        </>
      }
    />
  )

  return (
    <div className={cn(TICKET_WIDTH, "tabular-nums", className)} role="group" aria-label={`Sell ${sell.symbol} for ${receive.symbol}, ${verdict}`}>
      <div className="relative flex flex-col gap-1">
        <AmountBox
          label="You sell"
          aside={chip("sell", sell)}
          seam="bottom"
          foot={usd(sellValue)}
          footAside={<span className="truncate">Held {upTo(sell.balance, 4)}</span>}
        >
          <input
            value={amountStr}
            onChange={(e) => {
              if (/^\d*\.?\d{0,4}$/.test(e.target.value)) setAmountStr(e.target.value)
            }}
            placeholder="0"
            inputMode="decimal"
            aria-label={`Amount of ${sell.symbol} to sell`}
            className={amountText("second", !amountStr)}
            /* more than is held is a fail: the typed figure turns red (colour pass, 2026-09-30) */
            style={state === "short" ? { color: "var(--chart-down)" } : undefined}
          />
          {/* Half and Max sit in the amount row, clear of the flip on the seam */}
          <span className="flex shrink-0 items-center gap-1">
            {[
              { label: "Half", share: 0.5 },
              { label: "Max", share: 1 },
            ].map((c) => (
              <button key={c.label} type="button" onClick={() => setAmountStr(String(cut(sell.balance * c.share, 4)))} aria-label={`${c.label} of the ${sell.symbol} held`} className={PILL}>
                {c.label}
              </button>
            ))}
          </span>
        </AmountBox>
        <FlipButton onClick={flip} label="Turn the pair around" />
        <AmountBox label="You receive" seam="top" aside={chip("receive", receive)} foot={usd(received * receive.price)} footAside={<span>Held {upTo(receive.balance, 4)}</span>}>
          <span className={cn(amountText("lead", amount <= 0), "truncate")}>{amount > 0 ? upTo(received, 4) : "0"}</span>
        </AmountBox>
      </div>

      <div role="status" className="flex flex-col gap-1.5 px-1 pt-3">
        <Line label="Rate" value={`1 ${sell.symbol} = ${upTo(rate, 4)} ${receive.symbol}`} tip={`${sell.symbol} price ÷ ${receive.symbol} price = ${usd(sell.price)} ÷ ${usd(receive.price)}`} />
        <Line
          label="Minimum received"
          strong
          value={`${upTo(minimum, 4)} ${receive.symbol}`}
          tip={`you receive × (1 − ${(slippage * 100).toFixed(1)}% max slippage) = ${upTo(received, 4)} × ${(1 - slippage).toFixed(3)}`}
        />
      </div>

      {/* the one loud control; its label is the state of the ticket */}
      <PrimaryButton
        className="mt-4"
        state={state}
        disabled={!enabled}
        busy={phase !== "idle"}
        onClick={press}
        label={
          (state === "linking" || state === "placing") && !reduced ? (
            /* while it links or places, a highlight sweeps the label (transitions.dev shimmer text) */
            <motion.span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, color-mix(in srgb, var(--background) 55%, transparent) 35%, var(--background) 50%, color-mix(in srgb, var(--background) 55%, transparent) 65%)",
                backgroundSize: "200% 100%",
              }}
              initial={{ backgroundPosition: "100% 0%" }}
              animate={{ backgroundPosition: "-100% 0%" }}
              transition={{ duration: 1.2, ease: "linear", repeat: Infinity }}
            >
              {verdict}
            </motion.span>
          ) : (
            verdict
          )
        }
      />
    </div>
  )
}
