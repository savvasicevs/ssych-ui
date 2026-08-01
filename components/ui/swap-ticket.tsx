import { useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUpDown, ChevronDown, Settings, X } from "lucide-react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-2)"
const RED = "var(--chart-down)"
const ACCENT = "var(--chart-1)"
const PANEL = "var(--panel)"
const RAISED = "var(--card-raised)"
const HAIRLINE = "var(--border)"
const TEXT = "var(--foreground)"
const TEXT_MUTED = "var(--muted-foreground)"

const usd = (n: number, dp = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`

export interface SwapToken {
  symbol: string
  name: string
  /** Disc fill — a CSS colour or, better, a custom property you own. */
  color: string
  /** Unit price in the quote currency, used for the rate and the fiat line. */
  price: number
  balance: number
}

/** Generic majors, so the ticket ships with a coherent sample book. Brand hues
 * are overridable custom properties — set `--coin-eth` etc. to re-skin the discs. */
const TOKENS: SwapToken[] = [
  { symbol: "ETH", name: "Ethereum", color: "var(--coin-eth, #627eea)", price: 3050, balance: 4.1 },
  { symbol: "BTC", name: "Bitcoin", color: "var(--coin-btc, #f7931a)", price: 64200, balance: 0.18 },
  { symbol: "USDC", name: "USD Coin", color: "var(--coin-usdc, #2775ca)", price: 1, balance: 8200 },
  { symbol: "USDT", name: "Tether", color: "var(--coin-usdt, #26a17b)", price: 1, balance: 1500 },
  { symbol: "SOL", name: "Solana", color: "var(--coin-sol, #9945ff)", price: 148, balance: 32 },
]

/** Hand-drawn currency marks, so the component ships with zero asset files.
 * Anything without a mark falls back to a two-letter monogram. */
const GLYPHS: Record<string, () => ReactNode> = {
  ETH: () => (
    <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="currentColor">
      <path opacity="0.9" d="M12 2 5.5 12.2 12 16l6.5-3.8L12 2Z" />
      <path opacity="0.65" d="M12 17.4l-6.5-3.8L12 22l6.5-8.4-6.5 3.8Z" />
    </svg>
  ),
  BTC: () => (
    // the canonical mark leans ~14 degrees
    <svg
      viewBox="0 0 24 24"
      className="h-[62%] w-[62%]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      style={{ transform: "rotate(14deg)" }}
    >
      <path d="M9 5v14M9 5h5a3 3 0 0 1 0 6H9m0 0h6a3 3 0 0 1 0 6H9M11 3v2M14 3v2M11 19v2M14 19v2" />
    </svg>
  ),
  USDC: () => (
    <svg viewBox="0 0 24 24" className="h-[64%] w-[64%]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M15 8.4c-.6-1-1.7-1.5-3-1.5-1.9 0-3.2 1-3.2 2.5 0 3.6 6.6 1.5 6.6 5.1 0 1.6-1.4 2.6-3.4 2.6-1.5 0-2.7-.6-3.3-1.7M12 4.8v2.1M12 17.1v2.1" />
      <path opacity="0.55" d="M8.2 3.4a9.2 9.2 0 1 0 7.6 0" />
    </svg>
  ),
  USDT: () => (
    <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="currentColor">
      <path d="M4 4h16v3.4h-6.1v2.1c3.6.2 6.1 1 6.1 2s-2.5 1.8-6.1 2v6.5h-3.8v-6.5c-3.6-.2-6.1-1-6.1-2s2.5-1.8 6.1-2V7.4H4V4Zm7.9 8.3c3 0 5.1-.5 5.6-1-.5-.5-2.6-1-5.6-1s-5.1.5-5.6 1c.5.5 2.6 1 5.6 1Z" />
    </svg>
  ),
  SOL: () => (
    <svg viewBox="0 0 24 24" className="h-[54%] w-[54%]" fill="currentColor">
      <path opacity="0.95" d="M6.8 4.5h11.4l-2.6 2.8H4.2l2.6-2.8Z" />
      <path opacity="0.75" d="M4.2 10.6h11.4l2.6 2.8H6.8l-2.6-2.8Z" />
      <path opacity="0.95" d="M6.8 16.7h11.4l-2.6 2.8H4.2l2.6-2.8Z" />
    </svg>
  ),
}

function AssetIcon({ symbol, color, size = 32 }: { symbol: string; color: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.32) }}
    >
      {GLYPHS[symbol.toUpperCase()]?.() ?? symbol.slice(0, 2)}
    </span>
  )
}

function AmountCard({
  side,
  value,
  onChange,
  asset,
  balance,
  onMax,
  onPickToken,
}: {
  side: "Pay" | "Receive"
  value: string
  onChange?: (v: string) => void
  asset: SwapToken
  balance?: string
  onMax?: () => void
  onPickToken: () => void
}) {
  const n = parseFloat(value.replace(/,/g, "")) || 0 // display values carry locale commas
  const fiat = n * asset.price
  return (
    <div className="flex flex-col gap-2 rounded-2xl border p-3.5" style={{ borderColor: HAIRLINE, background: "var(--card)" }}>
      <div className="flex items-center justify-between text-[11px]" style={{ color: TEXT_MUTED }}>
        <span>You {side.toLowerCase()}</span>
        {balance && (
          <span className="flex items-center gap-1.5 tabular-nums">
            Bal {balance}
            <button type="button" onClick={onMax} className="rounded px-1 py-0.5 text-[10px] font-semibold" style={{ color: ACCENT }}>
              Max
            </button>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => {
            const v = e.target.value
            if (/^\d*\.?\d*$/.test(v)) onChange?.(v)
          }}
          readOnly={!onChange}
          placeholder="0"
          inputMode="decimal"
          aria-label={`Amount to ${side.toLowerCase()}`}
          className="w-full min-w-0 bg-transparent text-[26px] font-medium tabular-nums outline-none"
          style={{ color: value ? TEXT : TEXT_MUTED, caretColor: ACCENT }}
        />
        <button
          type="button"
          onClick={onPickToken}
          className="flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 transition-opacity hover:opacity-80"
          style={{ borderColor: HAIRLINE, background: RAISED }}
          aria-haspopup="listbox"
        >
          <AssetIcon symbol={asset.symbol} color={asset.color} size={22} />
          <span className="text-[13px] font-semibold" style={{ color: TEXT }}>
            {asset.symbol}
          </span>
          <ChevronDown size={12} />
        </button>
      </div>
      <span className="text-[11px] tabular-nums" style={{ color: TEXT_MUTED }}>
        {usd(fiat)}
      </span>
    </div>
  )
}

export interface SwapTicketProps {
  /** Heading above the pair. */
  title?: string
  /** The book the ticket can trade from — the first two are the opening pair. */
  tokens?: SwapToken[]
  /** Opening pay / receive symbols (must exist in `tokens`). */
  paySymbol?: string
  receiveSymbol?: string
  /** Opening pay amount, as typed. */
  defaultAmount?: string
  /** Right-hand footer chip — the slippage policy in force. */
  slippage?: string
  /** Fired when a valid ticket is submitted, before the side flips. */
  onSubmit?: (ticket: { side: "buy" | "sell"; pay: SwapToken; receive: SwapToken; amount: number }) => void
  className?: string
}

/**
 * The composed trade card. An editable pay amount (balance + Max), a flip button
 * on the seam that really swaps the two cards, a receive card computing through
 * the rate, a token-select overlay per side that covers the whole ticket, and a
 * footer carrying the rate line and slippage chip. The CTA's label IS the
 * validation state: empty → "Enter an amount", over balance → "Insufficient
 * <SYM> balance", valid → a Buy / Sell toggle that presses like a real button
 * and swaps the pair, so you are now selling the amount you just bought.
 */
export function SwapTicket({
  title = "Trade",
  tokens = TOKENS,
  paySymbol,
  receiveSymbol,
  defaultAmount = "1.2",
  slippage = "Auto · 0.5%",
  onSubmit,
  className,
}: SwapTicketProps) {
  const reduced = useReducedMotion()
  const find = (sym: string | undefined, fallback: SwapToken) => tokens.find((t) => t.symbol === sym) ?? fallback
  const [payTok, setPayTok] = useState<SwapToken>(() => find(paySymbol, tokens[0]))
  const [recvTok, setRecvTok] = useState<SwapToken>(() => find(receiveSymbol, tokens[2] ?? tokens[1] ?? tokens[0]))
  const [sell, setSell] = useState(defaultAmount)
  const [picking, setPicking] = useState<"pay" | "receive" | null>(null)
  // CTA side toggle — starts as Buy (green); pressing flips it red and it reads Sell
  const [side, setSide] = useState<"buy" | "sell">("buy")

  const rate = payTok.price / recvTok.price
  const buyAmt = useMemo(() => {
    const n = parseFloat(sell) || 0
    return n ? (n * rate).toLocaleString("en-US", { maximumFractionDigits: rate >= 100 ? 0 : 4 }) : ""
  }, [sell, rate])
  const n = parseFloat(sell) || 0
  const insufficient = n > payTok.balance
  const empty = n === 0
  const enabled = !empty && !insufficient

  // flip: the two cards really trade places (layout animation), and the receive
  // amount becomes the new pay amount so the quote stays coherent
  const flip = () => {
    const amt = parseFloat(buyAmt.replace(/,/g, "")) || 0
    setPayTok(recvTok)
    setRecvTok(payTok)
    setSell(amt ? String(Number(amt.toFixed(6))) : "")
  }

  const pick = (t: SwapToken) => {
    if (picking === "pay") {
      if (t.symbol === recvTok.symbol) setRecvTok(payTok)
      setPayTok(t)
    } else if (picking === "receive") {
      if (t.symbol === payTok.symbol) setPayTok(recvTok)
      setRecvTok(t)
    }
    setPicking(null)
  }

  return (
    <div className={cn("relative flex w-[320px] flex-col", className)}>
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-[14px] font-semibold" style={{ color: TEXT }}>
          {title}
        </span>
        <button type="button" className="grid h-7 w-7 place-items-center rounded-lg" style={{ color: TEXT_MUTED }} aria-label="Settings">
          <Settings size={15} />
        </button>
      </div>

      <div className="relative flex flex-col gap-1">
        <motion.div
          key={payTok.symbol + "-pay"}
          layout
          layoutId={`swap-card-${payTok.symbol}`}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        >
          <AmountCard
            side="Pay"
            value={sell}
            onChange={setSell}
            asset={payTok}
            balance={`${payTok.balance} ${payTok.symbol}`}
            onMax={() => setSell(String(payTok.balance))}
            onPickToken={() => setPicking("pay")}
          />
        </motion.div>
        <button
          type="button"
          onClick={flip}
          className="absolute left-1/2 top-1/2 z-10 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border transition-transform duration-[400ms] hover:rotate-180"
          style={{ borderColor: HAIRLINE, background: RAISED, color: TEXT }}
          aria-label="Flip pair"
        >
          <ArrowUpDown size={16} />
        </button>
        <motion.div
          key={recvTok.symbol + "-recv"}
          layout
          layoutId={`swap-card-${recvTok.symbol}`}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        >
          <AmountCard side="Receive" value={buyAmt} asset={recvTok} onPickToken={() => setPicking("receive")} />
        </motion.div>
      </div>

      {/* footer: rate + slippage */}
      <div className="flex items-center justify-between px-1.5 py-2.5 text-[11px]" style={{ color: TEXT_MUTED }}>
        <span className="tabular-nums">
          1 {payTok.symbol} = {rate.toLocaleString("en-US", { maximumFractionDigits: rate >= 100 ? 0 : 5 })} {recvTok.symbol}
        </span>
        <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums" style={{ background: "var(--card)" }}>
          {slippage}
        </span>
      </div>

      {/* CTA — hover lifts + glows, press compresses, so it reads as truly
          pressable; pressing it flips the side: green "Buy" turns red and reads
          "Sell" (and back) AND swaps the pair — the amount you just bought
          becomes the amount you're now selling (same layout spring as the seam
          button, quote recomputed through the rate). Disabled states get no
          moving cues, and reduced motion keeps only the colour + label swap. */}
      <motion.button
        type="button"
        disabled={!enabled}
        onClick={() => {
          onSubmit?.({ side, pay: payTok, receive: recvTok, amount: n })
          flip()
          setSide((s) => (s === "buy" ? "sell" : "buy"))
        }}
        aria-pressed={side === "sell"}
        whileHover={enabled && !reduced ? { scale: 1.02, y: -1 } : undefined}
        whileTap={enabled && !reduced ? { scale: 0.965, y: 0 } : undefined}
        transition={{ duration: 0.2, ease: EASE }}
        className="group relative h-14 rounded-xl text-[15px] font-bold transition-[filter,opacity,background-color] duration-200 enabled:cursor-pointer enabled:hover:brightness-[1.07] enabled:active:brightness-[0.93] disabled:cursor-not-allowed"
        style={{
          background: enabled ? (side === "buy" ? GREEN : RED) : RAISED,
          color: enabled ? "var(--background)" : TEXT_MUTED,
        }}
      >
        {enabled && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-active:opacity-100"
            style={{ boxShadow: `0 6px 24px -6px color-mix(in srgb, ${side === "buy" ? GREEN : RED} 55%, transparent)` }}
          />
        )}
        {/* colour flips first (the bg transition starts on press), then the label
            swaps — exit finishes before the new word enters (mode="wait") */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={empty ? "empty" : insufficient ? "insufficient" : side}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: reduced ? 0 : 0.14, ease: EASE }}
            className="relative block"
          >
            {empty ? "Enter an amount" : insufficient ? `Insufficient ${payTok.symbol} balance` : side === "buy" ? "Buy" : "Sell"}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* token-select overlay — 4px past the ticket on every side (matched radius)
          so the heading and the CTA's corners are fully covered while picking */}
      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute -inset-1 z-20 flex flex-col rounded-xl border p-3"
            style={{ borderColor: HAIRLINE, background: PANEL }}
            role="listbox"
            aria-label="Choose a token"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[13px] font-semibold" style={{ color: TEXT }}>
                {picking === "pay" ? "You pay" : "You receive"}
              </span>
              <button
                type="button"
                onClick={() => setPicking(null)}
                className="grid h-7 w-7 place-items-center rounded-lg"
                style={{ color: TEXT_MUTED }}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-0.5 overflow-y-auto">
              {tokens.map((t) => {
                const active = (picking === "pay" ? payTok : recvTok).symbol === t.symbol
                return (
                  <button
                    key={t.symbol}
                    type="button"
                    onClick={() => pick(t)}
                    role="option"
                    aria-selected={active}
                    className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors"
                    style={{ background: active ? "var(--card)" : "transparent" }}
                  >
                    <AssetIcon symbol={t.symbol} color={t.color} size={26} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-semibold" style={{ color: TEXT }}>
                        {t.symbol}
                      </span>
                      <span className="truncate text-[11px]" style={{ color: TEXT_MUTED }}>
                        {t.name}
                      </span>
                    </span>
                    <span className="text-[11px] tabular-nums" style={{ color: TEXT_MUTED }}>
                      {t.balance} {t.symbol}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
