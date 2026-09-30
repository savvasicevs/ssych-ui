"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUpDown, ChevronDown, Settings, X } from "lucide-react"

import { cn } from "@/lib/utils"

/* Swap Ticket, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no outlines anywhere: the two amounts sit on a faint fill, the token picker, the flip
     button and the slippage chip are fills too (it had 5 outlined boxes)
   · the button is the one solid white control. It was green for Buy and red for Sell with a
     glow under the pointer; the word on it still is the validation state, and still reads
     Buy or Sell, so the colour said nothing the label did not
   · Max is ink, not blue. The token discs keep their own colours: each default is a
     custom property with its brand colour as the fallback (`--coin-eth` and so on), so a
     host can re-skin them and the component still works where they are not set
   · one large size (the amount, 22px); the title and the button label come down to 13px
   · corners of 8px and under, controls fully round (it had 12 and 16)
   · the token list takes the ticket's place while picking, so it needs no panel or border
     of its own; pointing at a token dims the others
   · in `flush` the amounts keep their fill and a 1px gap is the seam (it was a hairline)
   Colour pass (2026-09-30): Buy and Sell are a direction, so a valid ticket's button is
   green for Buy and red for Sell again, the ink on it from --on-accent / --on-danger. Until
   the ticket is valid it stays the quiet white control. The token list opens from the field
   that asked for it, and every press gives a little. */

const EASE = [0.16, 1, 0.3, 1] as const
const LAYOUT_SPRING = { type: "spring", stiffness: 400, damping: 32 } as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
/** presses: colour 150ms, and a 0.97 give that reduced motion drops */
const PRESS = "transition-[color,background-color,scale] duration-150 active:scale-[0.97] motion-reduce:active:scale-100"
/** the flip button sits over both fills, so its ground is opaque: ink mixed into the page */
const SEAM_FILL = "color-mix(in srgb, var(--foreground) 12%, var(--background))"

const usd = (n: number, dp = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`

export interface SwapToken {
  symbol: string
  name: string
  /** Kept for callers. The rebuild draws every disc in ink, so this is not painted. */
  color: string
  /** Unit price in the quote currency, used for the rate and the fiat line. */
  price: number
  balance: number
  /**
   * How the balance should PRINT, when the ticket sits next to a register that
   * already prints it (e.g. "4.10", "1,500"). Defaults to a locale format of
   * `balance`, so the two can never read as different holdings.
   */
  balanceLabel?: string
}

/** the balance as text: the caller's own wording wins, otherwise locale-format */
const balanceOf = (t: SwapToken) =>
  t.balanceLabel ?? t.balance.toLocaleString("en-US", { maximumFractionDigits: 6 })

/** Generic majors, so the ticket ships with a coherent sample book. */
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
    <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="currentColor" aria-hidden>
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
      aria-hidden
    >
      <path d="M9 5v14M9 5h5a3 3 0 0 1 0 6H9m0 0h6a3 3 0 0 1 0 6H9M11 3v2M14 3v2M11 19v2M14 19v2" />
    </svg>
  ),
  USDC: () => (
    <svg viewBox="0 0 24 24" className="h-[64%] w-[64%]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M15 8.4c-.6-1-1.7-1.5-3-1.5-1.9 0-3.2 1-3.2 2.5 0 3.6 6.6 1.5 6.6 5.1 0 1.6-1.4 2.6-3.4 2.6-1.5 0-2.7-.6-3.3-1.7M12 4.8v2.1M12 17.1v2.1" />
      <path opacity="0.55" d="M8.2 3.4a9.2 9.2 0 1 0 7.6 0" />
    </svg>
  ),
  USDT: () => (
    <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="currentColor" aria-hidden>
      <path d="M4 4h16v3.4h-6.1v2.1c3.6.2 6.1 1 6.1 2s-2.5 1.8-6.1 2v6.5h-3.8v-6.5c-3.6-.2-6.1-1-6.1-2s2.5-1.8 6.1-2V7.4H4V4Zm7.9 8.3c3 0 5.1-.5 5.6-1-.5-.5-2.6-1-5.6-1s-5.1.5-5.6 1c.5.5 2.6 1 5.6 1Z" />
    </svg>
  ),
  SOL: () => (
    <svg viewBox="0 0 24 24" className="h-[54%] w-[54%]" fill="currentColor" aria-hidden>
      <path opacity="0.95" d="M6.8 4.5h11.4l-2.6 2.8H4.2l2.6-2.8Z" />
      <path opacity="0.75" d="M4.2 10.6h11.4l2.6 2.8H6.8l-2.6-2.8Z" />
      <path opacity="0.95" d="M6.8 16.7h11.4l-2.6 2.8H4.2l2.6-2.8Z" />
    </svg>
  ),
}

/** A token's disc in the token's own colour (user call, 2026-09-29: icons keep their
 *  colour). A brand mark is an identity, not a direction, so the rule that keeps colour
 *  for up and down does not apply to it. The glyph is white on the disc in both themes. */
function AssetIcon({ symbol, color, size = 32 }: { symbol: string; color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: Math.max(8, Math.round(size * 0.36)) }}
    >
      {GLYPHS[symbol.toUpperCase()]?.() ?? symbol.slice(0, 2)}
    </span>
  )
}

function AmountField({
  side,
  value,
  onChange,
  asset,
  balance,
  onMax,
  onPickToken,
  flush,
  trailing,
}: {
  side: "Pay" | "Receive"
  value: string
  onChange?: (v: string) => void
  asset: SwapToken
  balance?: string
  onMax?: () => void
  onPickToken: () => void
  flush?: boolean
  /** an extra control docked at the end of the label row (flush mode's home for the gear) */
  trailing?: ReactNode
}) {
  const n = parseFloat(value.replace(/,/g, "")) || 0 // display values carry locale commas
  const fiat = n * asset.price
  return (
    <div
      className={cn(
        "flex flex-col gap-2 bg-foreground/[0.04] transition-colors duration-150 focus-within:bg-foreground/[0.06]",
        flush ? "rounded-[4px] px-3 py-3" : "rounded-lg p-3.5",
      )}
    >
      <div className="flex items-center justify-between text-[11px] text-foreground/45">
        <span>You {side.toLowerCase()}</span>
        <span className="flex items-center gap-1.5">
          {balance && (
            <span className="flex items-center gap-1.5">
              Bal {balance}
              <button
                type="button"
                onClick={onMax}
                aria-label={`Use the full balance, ${balance}`}
                className={`rounded-full bg-foreground/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70 outline-none ${PRESS} hover:bg-foreground/[0.14] hover:text-foreground/90 focus-visible:bg-foreground/[0.14]`}
              >
                Max
              </button>
            </span>
          )}
          {trailing}
        </span>
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
          className={cn(
            "w-full min-w-0 bg-transparent text-[22px] font-semibold leading-none tracking-[-0.02em] caret-foreground outline-none placeholder:text-foreground/35",
            value ? "text-foreground/90" : "text-foreground/35",
          )}
        />
        <button
          type="button"
          onClick={onPickToken}
          aria-haspopup="listbox"
          aria-label={`${asset.symbol}, choose the token to ${side.toLowerCase()}`}
          className={`flex shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.08] py-1 pl-1 pr-2 text-foreground/45 outline-none ${PRESS} hover:bg-foreground/[0.14] hover:text-foreground/90 focus-visible:bg-foreground/[0.14]`}
        >
          <AssetIcon symbol={asset.symbol} color={asset.color} size={22} />
          <span className="text-[13px] font-semibold text-foreground/90">{asset.symbol}</span>
          <ChevronDown size={12} aria-hidden />
        </button>
      </div>
      <span className="text-[11px] text-foreground/45">{usd(fiat)}</span>
    </div>
  )
}

export interface SwapTicketProps {
  /** Heading above the pair. */
  title?: string
  /** The book the ticket can trade from; the first two are the opening pair. */
  tokens?: SwapToken[]
  /** Opening pay / receive symbols (must exist in `tokens`). */
  paySymbol?: string
  receiveSymbol?: string
  /** Opening pay amount, as typed. */
  defaultAmount?: string
  /** Right-hand footer chip: the slippage policy in force. */
  slippage?: string
  /** Fired when a valid ticket is submitted, before the side flips. */
  onSubmit?: (ticket: { side: "buy" | "sell"; pay: SwapToken; receive: SwapToken; amount: number }) => void
  /**
   * Fired on mount and whenever the pair changes (pick, flip, or a Buy/Sell that
   * swaps the sides). Lets a host surface read the live pair.
   */
  onPairChange?: (pair: { pay: SwapToken; receive: SwapToken }) => void
  /**
   * flush: the ticket drops its heading row and its inset so a terminal column can
   * carry the structure. The gear moves into the pay row's label line and the two
   * amounts meet on a 1px gap.
   */
  flush?: boolean
  className?: string
}

/**
 * The composed trade form. An amount you type on a faint ground (balance and Max beside
 * it), a flip button on the seam that really swaps the two fields, a receive amount
 * computed through the rate, and a token list that takes the ticket's place while you
 * pick. The white button's label is the validation state: "Enter an amount", "Insufficient
 * ETH balance", then Buy or Sell, and pressing it swaps the pair so you are now selling
 * what you just bought.
 */
export function SwapTicket({
  title = "Trade",
  tokens = TOKENS,
  paySymbol,
  receiveSymbol,
  defaultAmount = "1.2",
  slippage = "Auto · 0.5%",
  onSubmit,
  onPairChange,
  flush = false,
  className,
}: SwapTicketProps) {
  const reduced = useReducedMotion()
  const find = (sym: string | undefined, fallback: SwapToken) => tokens.find((t) => t.symbol === sym) ?? fallback
  const [payTok, setPayTok] = useState<SwapToken>(() => find(paySymbol, tokens[0]))
  const [recvTok, setRecvTok] = useState<SwapToken>(() => find(receiveSymbol, tokens[2] ?? tokens[1] ?? tokens[0]))
  const [sell, setSell] = useState(defaultAmount)
  const [picking, setPicking] = useState<"pay" | "receive" | null>(null)
  const [side, setSide] = useState<"buy" | "sell">("buy")
  /** the token being pointed at in the list */
  const [hot, setHot] = useState<string | null>(null)

  // the pair is internal state, so a host can only learn it by being told;
  // announced on mount too, so a balance panel is correct before the first pick
  useEffect(() => {
    onPairChange?.({ pay: payTok, receive: recvTok })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payTok, recvTok])

  const rate = payTok.price / recvTok.price
  const buyAmt = useMemo(() => {
    const n = parseFloat(sell) || 0
    return n ? (n * rate).toLocaleString("en-US", { maximumFractionDigits: rate >= 100 ? 0 : 4 }) : ""
  }, [sell, rate])
  const n = parseFloat(sell) || 0
  const insufficient = n > payTok.balance
  const empty = n === 0
  const enabled = !empty && !insufficient
  const verdict = empty
    ? "Enter an amount"
    : insufficient
      ? `Insufficient ${payTok.symbol} balance`
      : side === "buy"
        ? "Buy"
        : "Sell"

  // flip: the two fields really trade places (layout animation), and the receive
  // amount becomes the new pay amount so the quote stays coherent
  const flip = () => {
    const amt = parseFloat(buyAmt.replace(/,/g, "")) || 0
    setPayTok(recvTok)
    setRecvTok(payTok)
    setSell(amt ? String(Number(amt.toFixed(6))) : "")
  }

  const close = () => {
    setPicking(null)
    setHot(null)
  }
  const pick = (t: SwapToken) => {
    if (picking === "pay") {
      if (t.symbol === recvTok.symbol) setRecvTok(payTok)
      setPayTok(t)
    } else if (picking === "receive") {
      if (t.symbol === payTok.symbol) setPayTok(recvTok)
      setRecvTok(t)
    }
    close()
  }

  const settings = (
    <button
      type="button"
      aria-label="Settings"
      className={cn(
        "grid place-items-center rounded-full text-foreground/45 outline-none hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:bg-foreground/[0.06]",
        PRESS,
        flush ? "h-5 w-5" : "h-7 w-7",
      )}
    >
      <Settings size={flush ? 13 : 15} aria-hidden />
    </button>
  )

  return (
    <div className={cn("relative w-[320px] tabular-nums", className)} role="group" aria-label={`${title}: ${payTok.symbol} for ${recvTok.symbol}`}>
      {/* the form stays mounted while picking so the ticket keeps its size; it is
          hidden from the pointer, the keyboard and the reader until the list closes */}
      <div className="flex flex-col" style={{ visibility: picking ? "hidden" : "visible" }}>
        {!flush && (
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[13px] font-medium text-foreground/90">{title}</span>
            {settings}
          </div>
        )}

        <div className={cn("relative flex flex-col", flush ? "gap-px" : "gap-1")}>
          <motion.div
            key={payTok.symbol + "-pay"}
            layout={!reduced}
            layoutId={reduced ? undefined : `swap-field-${payTok.symbol}`}
            transition={LAYOUT_SPRING}
          >
            <AmountField
              side="Pay"
              value={sell}
              onChange={setSell}
              asset={payTok}
              balance={`${balanceOf(payTok)} ${payTok.symbol}`}
              onMax={() => setSell(String(payTok.balance))}
              onPickToken={() => setPicking("pay")}
              flush={flush}
              trailing={flush ? settings : undefined}
            />
          </motion.div>
          <button
            type="button"
            onClick={flip}
            aria-label="Flip pair"
            className="absolute left-1/2 top-1/2 z-10 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-foreground/70 outline-none transition-[rotate,scale,color] duration-300 hover:text-foreground focus-visible:text-foreground motion-safe:hover:rotate-180 motion-safe:active:scale-[0.97]"
            style={{ background: SEAM_FILL }}
          >
            <ArrowUpDown size={14} aria-hidden />
          </button>
          <motion.div
            key={recvTok.symbol + "-recv"}
            layout={!reduced}
            layoutId={reduced ? undefined : `swap-field-${recvTok.symbol}`}
            transition={LAYOUT_SPRING}
          >
            <AmountField side="Receive" value={buyAmt} asset={recvTok} onPickToken={() => setPicking("receive")} flush={flush} />
          </motion.div>
        </div>

        {/* footer: the rate the quote went through, and the slippage in force */}
        <div className={cn("flex items-center justify-between py-2.5 text-[11px] text-foreground/45", flush ? "px-3" : "px-1")}>
          <span role="status">
            {/* the rate swaps in place on a flip or a pick: 4px out of a 2px blur, 150ms */}
            <motion.span
              key={`${payTok.symbol}-${recvTok.symbol}`}
              className="inline-block"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.15, ease: EASE }}
            >
              1 {payTok.symbol} = {rate.toLocaleString("en-US", { maximumFractionDigits: rate >= 100 ? 0 : 5 })} {recvTok.symbol}
            </motion.span>
          </span>
          <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5">{slippage}</span>
        </div>

        {/* the one solid control. Its label is the validation state; a valid ticket
            reads Buy or Sell, and pressing it swaps the pair and the word */}
        <motion.button
          type="button"
          disabled={!enabled}
          onClick={() => {
            onSubmit?.({ side, pay: payTok, receive: recvTok, amount: n })
            flip()
            setSide((s) => (s === "buy" ? "sell" : "buy"))
          }}
          aria-pressed={side === "sell"}
          whileTap={enabled && !reduced ? { scale: 0.97 } : undefined}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }}
          className={cn(
            "relative h-11 rounded-full bg-foreground/[0.92] text-[13px] font-semibold text-background outline-none transition-[background-color,color,opacity,filter] duration-200 enabled:cursor-pointer enabled:hover:brightness-[1.06] enabled:focus-visible:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-35",
            flush && "mx-3 mb-3",
          )}
          /* a valid ticket wears its direction: green Buy, red Sell */
          style={
            enabled
              ? side === "buy"
                ? { background: GREEN, color: "var(--on-accent, var(--background))" }
                : { background: RED, color: "var(--on-danger, var(--background))" }
              : undefined
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={verdict}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
              transition={{ duration: 0.15, ease: EASE }}
              className="relative block"
            >
              {verdict}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      {/* the token list, in the ticket's place */}
      <AnimatePresence>
        {picking && (
          /* the list opens from the field that asked for it: 0.97 and a fade over 250ms,
             closing in 150ms; reduced motion keeps the fade */
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.99, transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] } }}
            style={{ transformOrigin: picking === "pay" ? "50% 30%" : "50% 70%" }}
            className="absolute inset-0 z-20 flex flex-col"
            onKeyDown={(e) => {
              if (e.key === "Escape") close()
            }}
          >
            <div className={cn("mb-2 flex items-center justify-between", flush ? "px-3 pt-2" : "px-1")}>
              <span className="text-[13px] font-medium text-foreground/90">
                {picking === "pay" ? "You pay" : "You receive"}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className={`grid h-7 w-7 place-items-center rounded-full text-foreground/45 outline-none ${PRESS} hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:bg-foreground/[0.06]`}
              >
                <X size={14} aria-hidden />
              </button>
            </div>
            <div
              className="flex flex-col gap-0.5 overflow-y-auto"
              role="listbox"
              aria-label="Choose a token"
              onPointerLeave={() => setHot(null)}
            >
              {tokens.map((t, i) => {
                const active = (picking === "pay" ? payTok : recvTok).symbol === t.symbol
                return (
                  <motion.button
                    key={t.symbol}
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={`${t.name}, balance ${balanceOf(t)} ${t.symbol}`}
                    onClick={() => pick(t)}
                    onPointerEnter={() => setHot(t.symbol)}
                    onFocus={() => setHot(t.symbol)}
                    onBlur={() => setHot(null)}
                    initial={reduced ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: hot !== null && hot !== t.symbol ? 0.45 : 1, y: 0 }}
                    transition={reduced ? { duration: 0 } : { duration: hot === null ? 0.25 : 0.16, ease: EASE, delay: hot === null ? i * 0.03 : 0 }}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06]",
                      active && "bg-foreground/[0.04]",
                    )}
                  >
                    <AssetIcon symbol={t.symbol} color={t.color} size={26} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[13px] font-semibold text-foreground/90">{t.symbol}</span>
                      <span className="truncate text-[11px] text-foreground/45">{t.name}</span>
                    </span>
                    <span className="text-[11px] text-foreground/45">
                      {balanceOf(t)} {t.symbol}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
