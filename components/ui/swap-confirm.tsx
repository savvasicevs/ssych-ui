"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

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
   · can be placed  linked, 0 < amount ≤ balance of the asset sold    Marks (2026-09-30): a token shows its real mark (TokenIcon), a company or a wallet its
   real logo (BrandIcon); two letters on an ink disc only where no mark exists.
   Library (2026-09-30): ships alone, so a mark is a disc in its --coin-<symbol> colour with
   its letters in white; `renderIcon` draws the real mark in its place. */

const EASE = [0.16, 1, 0.3, 1] as const
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
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
  /** the pair; the first is sold, the second received, until it is flipped */
  assets?: [SwapAsset, SwapAsset]
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
 * The convert ticket, open: what is sold on top, what arrives under it, then the rate, the
 * slippage allowed and the least that can arrive. The white button is the state of the
 * ticket and the only thing that places it.
 */
export function SwapConfirm({
  assets = DEFAULT_ASSETS,
  defaultAmount = "20",
  defaultLinked = true,
  slippage = 0.005,
  onConfirm,
  renderIcon,
  className,
}: SwapConfirmProps) {
  const reduced = useReducedMotion()
  const [flipped, setFlipped] = useState(false)
  const [turns, setTurns] = useState(0)
  const [amountStr, setAmountStr] = useState(defaultAmount)
  const [linked, setLinked] = useState(defaultLinked)
  const [phase, setPhase] = useState<"idle" | "linking" | "placing">("idle")
  /* counts the presses that write the amount (Half, Max, the flip), so the figures they move
     swap in; typing writes them at once, since a held key repeats */
  const [bump, setBump] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const sell = assets[flipped ? 1 : 0]
  const receive = assets[flipped ? 0 : 1]
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
    ready: `Confirm, sell ${upTo(amount, 4)} ${sell.symbol}`,
  }[state]
  const enabled = state === "link" || state === "ready"

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

  const head = (label: string, asset: SwapAsset, fill: boolean) => (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-foreground/45">{label}</span>
      <span className="flex items-center gap-1">
        <span className="text-[10.5px] text-foreground/45">
          Held {upTo(asset.balance, 4)} {asset.symbol}
        </span>
        {fill &&
          [
            { label: "Half", share: 0.5 },
            { label: "Max", share: 1 },
          ].map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => {
                setAmountStr(String(cut(asset.balance * c.share, 4)))
                setBump((b) => b + 1)
              }}
              aria-label={`${c.label} of the ${asset.symbol} held`}
              className="h-6 rounded-full px-2 text-[10.5px] text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 active:scale-[0.97] hover:bg-foreground/[0.08] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] focus-visible:text-foreground/90"
            >
              {c.label}
            </button>
          ))}
      </span>
    </div>
  )

  const token = (asset: SwapAsset) => {
    const mark = MARKS[asset.symbol.toUpperCase()]
    return (
    <span className="flex shrink-0 items-center gap-1.5">
      {renderIcon ? (
        renderIcon(asset.symbol, 24)
      ) : mark ? (
        <span
          aria-hidden
          className="grid h-6 w-6 place-items-center rounded-full text-[8.5px] font-semibold"
          style={{ background: mark.disc, color: mark.glyph ?? "var(--coin-glyph, #fff)" }}
        >
          {asset.symbol.slice(0, 2)}
        </span>
      ) : (
        <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-foreground/[0.12] text-[8.5px] font-semibold text-foreground/90">
          {asset.symbol.slice(0, 2)}
        </span>
      )}
      <span>
        <span className="block text-[12px] font-semibold leading-tight text-foreground/90">{asset.symbol}</span>
        <span className="block text-[9.5px] leading-tight text-foreground/45">{asset.name}</span>
      </span>
    </span>
    )
  }

  const line = (label: string, value: string, strong = false) => (
    <div className="flex items-baseline justify-between text-[11px]">
      <span className="text-foreground/45">{label}</span>
      <span className={cn("text-foreground/90", strong && "font-semibold")}>{value}</span>
    </div>
  )

  return (
    <div className={cn("w-[340px] max-w-full tabular-nums", className)} role="group" aria-label={`Sell ${sell.symbol} for ${receive.symbol}, ${verdict}`}>
      {/* 12 (the 24px Half and Max pills) + 10 top padding = 22 */}
      <div className="rounded-[22px] bg-foreground/[0.04] px-3 py-2.5 transition-colors duration-150 focus-within:bg-foreground/[0.06]">
        {head("You sell", sell, true)}
        <div className="mt-2 flex items-center gap-3">
          {token(sell)}
          <input
            value={amountStr}
            onChange={(e) => {
              if (/^\d*\.?\d{0,4}$/.test(e.target.value)) setAmountStr(e.target.value)
            }}
            placeholder="0"
            inputMode="decimal"
            aria-label={`Amount of ${sell.symbol} to sell`}
            className="min-w-0 flex-1 bg-transparent text-right text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90 caret-foreground outline-none transition-colors duration-150 placeholder:text-foreground/35"
            /* more than is held is a fail: the typed figure turns red (colour pass, 2026-09-30) */
            style={state === "short" ? { color: "var(--chart-down)" } : undefined}
          />
        </div>
        <div className="mt-1 text-right text-[11px] text-foreground/45">{usd(sellValue)}</div>
      </div>

      <div className="my-1.5 flex justify-center">
        <motion.button
          type="button"
          onClick={() => {
            setFlipped((f) => !f)
            setTurns((t) => t + 1)
            setAmountStr("")
            setBump((b) => b + 1)
          }}
          aria-label="Turn the pair around"
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

      {/* 22, the same as the sell panel it pairs with */}
      <div className="rounded-[22px] bg-foreground/[0.04] px-3 py-2.5">
        {head("You receive", receive, false)}
        <div className="mt-2 flex items-center gap-3">
          {token(receive)}
          {/* a press that writes the amount swaps the figure in (text swap: 4px, 2px blur, 150ms) */}
          <motion.span
            key={bump}
            initial={bump === 0 ? false : reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
            className={cn("min-w-0 flex-1 text-right text-[22px] font-semibold leading-none tracking-[-0.02em]", amount > 0 ? "text-foreground/90" : "text-foreground/35")}
          >
            {amount > 0 ? upTo(received, 4) : "0"}
          </motion.span>
        </div>
        <div className="mt-1 text-right text-[11px] text-foreground/45">{usd(received * receive.price)}</div>
      </div>

      <div role="status" className="mt-3 flex flex-col gap-1.5 px-1">
        {line("Rate", `1 ${sell.symbol} = ${upTo(rate, 4)} ${receive.symbol}`)}
        {line("Max slippage", `${(slippage * 100).toFixed(1)}%`)}
        {line("Commission", usd(0))}
        {line("Minimum received", `${upTo(minimum, 4)} ${receive.symbol}`, true)}
      </div>

      {/* the one solid control; its label is the state of the ticket */}
      <motion.button
        type="button"
        disabled={!enabled}
        aria-busy={phase !== "idle"}
        onClick={press}
        whileTap={enabled && !reduced ? { scale: 0.98 } : undefined}
        transition={reduced ? { duration: 0 } : LIFT_SPRING}
        className="mt-4 h-11 w-full rounded-full bg-foreground/[0.92] text-[13px] font-semibold text-background outline-none transition-[background-color,opacity] duration-200 enabled:cursor-pointer enabled:hover:bg-foreground enabled:focus-visible:bg-foreground disabled:cursor-not-allowed disabled:opacity-35"
      >
        <AnimatePresence mode="wait" initial={false}>
          {/* the label is the state: it swaps in place (text swap: 4px, 2px blur, 150ms); reduced
              motion keeps the cross-fade and drops the travel and the blur */}
          <motion.span
            key={state}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
            transition={{ duration: 0.15, ease: EASE }}
            className="block"
          >
            {(state === "linking" || state === "placing") && !reduced ? (
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
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
