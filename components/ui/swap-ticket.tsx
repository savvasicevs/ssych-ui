"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, Settings } from "lucide-react"

import { ICON_BUTTON } from "@/components/ui/control-classes"
import { AmountBox, FlipButton, Line, PILL, PrimaryButton, Segments, TICKET_WIDTH, amountText } from "@/components/ui/swap-ticket-field"
import { TicketModal, TicketSelect, modalPrimary } from "@/components/ui/swap-ticket-modal"
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
   that asked for it, and every press gives a little.
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit: one swap family with Cross Chain Swap and Swap Confirm, cut from the same
   parts (swap-ticket-field.tsx, swap-ticket-modal.tsx) at 320 wide: the amount field with
   a 28px corner (the 32px token chip's 16 + 12), the flip on the seam, the 48px white
   BUTTON_PRIMARY. The settings gear opens a popup with the slippage as a switch (Auto, 0.1,
   0.5, 1%), and the filled "Auto · 0.5%" chip that looked pressable is a plain line. A swap
   is named by what it does: the button reads "Swap ETH for USDC" (it read Buy or Sell and
   flipped the pair on every press; the green and red fills are gone with it). Pressing it
   says "Swapped" and clears the amount. The typed amount is the one big figure (22px), the
   quote under it 17px. The token chip opens the shared dropdown (marks and balances) in place
   of the list that took the ticket's place. `slippage` still takes the old text ("Auto ·
   0.5%"): its number and the word Auto set the opening choice. `onSubmit` still sends a
   side, always "buy" (the pay token is spent, the receive token bought).
   Formulas:
   · receive       pay amount × rate
   · rate          pay price ÷ receive price
   · worth         amount × price of its token
   · can be sent   0 < amount ≤ balance of the pay token
   2026-10-02 round 2: (his notes after the side by side): the coloured button is back. A
   valid ticket's primary is green again (the receive side is bought), with the ink from
   --on-accent, as in the version before the audit; the label keeps the new wording ("Swap ETH
   for USDC"). Until then it stays the quiet white control. The balance line ran under the flip
   arrow at the seam: Max moved from the balance line into the amount row (right of the typed
   figure), and both fields keep a clear lane over the arrow (AmountBox `seam`), so nothing
   touches it. The amount field shows focus on its own edge. Formulas are unchanged. */

/* a valid swap's button (his call, 2026-10-02: "the text should be white to be more
   accessible"). Light: white on a deeper green, 5.4:1 (#0a7a49) and 4.6:1 on hover
   (#0b8650); the theme's #0e9f61 only reaches 3.4:1 under white. Dark: the bright green
   with the near-black ink, 8.5:1, as before */
const GO =
  "bg-[#0a7a49] text-white hover:bg-[#0b8650] focus-visible:bg-[#0b8650] dark:bg-[var(--chart-up)] dark:text-[#0e0e0e] dark:hover:bg-[var(--chart-up)] dark:focus-visible:bg-[var(--chart-up)] dark:hover:brightness-[1.06]"

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

/** draws a token's real mark (TokenIcon in the preview); the disc below is the fallback */
type RenderIcon = (symbol: string, size: number) => ReactNode
const IconSlot = createContext<RenderIcon | undefined>(undefined)

/** A token's disc in the token's own colour (user call, 2026-09-29: icons keep their
 *  colour). The real mark comes through `renderIcon` when one is given (2026-10-02). A brand mark is an identity, not a direction, so the rule that keeps colour
 *  for up and down does not apply to it. The glyph is white on the disc in both themes. */
function AssetIcon({ symbol, color, size = 32 }: { symbol: string; color: string; size?: number }) {
  const render = useContext(IconSlot)
  if (render) return <span aria-hidden className="grid shrink-0 place-items-center" style={{ width: size, height: size }}>{render(symbol, size)}</span>
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
  /** The slippage policy it opens with, as text ("Auto · 0.5%", "1%"): the number sets the
   *  opening choice, the word Auto picks Auto. Changed from the settings popup. */
  slippage?: string
  /** Fired when a valid ticket is submitted; `side` is always "buy" since the 2026-10-02 audit. */
  onSubmit?: (ticket: { side: "buy" | "sell"; pay: SwapToken; receive: SwapToken; amount: number }) => void
  /**
   * Fired on mount and whenever the pair changes (a pick or a flip). Lets a host surface
   * read the live pair.
   */
  onPairChange?: (pair: { pay: SwapToken; receive: SwapToken }) => void
  /**
   * flush: the ticket drops its heading row so a terminal column can carry the
   * structure; the gear moves into the pay field's label line.
   */
  flush?: boolean
  /** draws a token's real mark at `size` px; the coloured disc without it */
  renderIcon?: RenderIcon
  className?: string
}

const SLIPPAGES = ["Auto", "0.1%", "0.5%", "1%"] as const
type Slip = (typeof SLIPPAGES)[number]
/** what Auto settles on: the middle of the set */
const AUTO_SLIP = 0.5
const DONE_MS = 1400

/** reads the old slippage text into a choice: "Auto · 0.5%" is Auto, "1%" is 1% */
const slipOf = (text: string): Slip => {
  if (/auto/i.test(text)) return "Auto"
  const n = parseFloat(text.replace(/[^0-9.]/g, ""))
  return (SLIPPAGES.find((s) => s !== "Auto" && parseFloat(s) === n) ?? "Auto") as Slip
}

/**
 * The composed trade form. An amount you type (balance and Max beside it), a flip on the
 * seam that really swaps the two fields, a receive amount worked through the rate, and a
 * token chip that opens the dropdown. The white button's label is the validation state:
 * "Enter an amount", "Insufficient ETH balance", then "Swap ETH for USDC".
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
  renderIcon,
  className,
}: SwapTicketProps) {
  const find = (sym: string | undefined, fallback: SwapToken) => tokens.find((t) => t.symbol === sym) ?? fallback
  const [payTok, setPayTok] = useState<SwapToken>(() => find(paySymbol, tokens[0]))
  const [recvTok, setRecvTok] = useState<SwapToken>(() => find(receiveSymbol, tokens[2] ?? tokens[1] ?? tokens[0]))
  const [sell, setSell] = useState(defaultAmount)
  const [slip, setSlip] = useState<Slip>(() => slipOf(slippage))
  const [settings, setSettings] = useState(false)
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

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
  const enabled = !empty && !insufficient && !done
  const state = done ? "done" : empty ? "empty" : insufficient ? "short" : "ready"
  const verdict = done
    ? "Swapped"
    : empty
      ? "Enter an amount"
      : insufficient
        ? `Insufficient ${payTok.symbol} balance`
        : `Swap ${payTok.symbol} for ${recvTok.symbol}`
  const slipPct = slip === "Auto" ? AUTO_SLIP : parseFloat(slip)

  // flip: the two tokens trade places and the receive amount becomes the new pay amount,
  // so the quote stays coherent
  const flip = () => {
    const amt = parseFloat(buyAmt.replace(/,/g, "")) || 0
    setPayTok(recvTok)
    setRecvTok(payTok)
    setSell(amt ? String(Number(amt.toFixed(6))) : "")
  }
  const pick = (side: "pay" | "receive", sym: string) => {
    const t = tokens.find((x) => x.symbol === sym)
    if (!t) return
    if (side === "pay") {
      if (t.symbol === recvTok.symbol) setRecvTok(payTok)
      setPayTok(t)
    } else {
      if (t.symbol === payTok.symbol) setPayTok(recvTok)
      setRecvTok(t)
    }
  }
  const submit = () => {
    if (!enabled) return
    onSubmit?.({ side: "buy", pay: payTok, receive: recvTok, amount: n })
    setDone(true)
    timer.current = setTimeout(() => {
      setDone(false)
      setSell("")
    }, DONE_MS)
  }

  const options = tokens.map((t) => ({
    value: t.symbol,
    label: t.symbol,
    hint: `${balanceOf(t)}`,
    icon: <AssetIcon symbol={t.symbol} color={t.color} size={22} />,
  }))
  const chip = (side: "pay" | "receive", tok: SwapToken) => (
    <TicketSelect
      look="chip"
      label={side === "pay" ? "Token to pay" : "Token to receive"}
      value={tok.symbol}
      options={options}
      onChange={(v) => pick(side, v)}
      trigger={
        <>
          <AssetIcon symbol={tok.symbol} color={tok.color} size={24} />
          <span className="text-foreground/90">{tok.symbol}</span>
        </>
      }
    />
  )

  const gear = (
    <button type="button" aria-label="Swap settings" aria-haspopup="dialog" onClick={() => setSettings(true)} className={cn(ICON_BUTTON, flush ? "h-6 w-6" : "h-8 w-8")}>
      <Settings size={flush ? 13 : 15} aria-hidden />
    </button>
  )

  return (
    <IconSlot.Provider value={renderIcon}>
      <div className={cn(TICKET_WIDTH, "relative tabular-nums", className)} role="group" aria-label={`${title}: ${payTok.symbol} for ${recvTok.symbol}`}>
        {!flush && (
          <div className="mb-2 flex items-center justify-between pl-1">
            <span className="text-[12px] font-medium text-foreground/90">{title}</span>
            {gear}
          </div>
        )}

        <div className="relative flex flex-col gap-1">
          <AmountBox
            label={
              flush ? (
                <span className="flex items-center gap-1">
                  You pay {gear}
                </span>
              ) : (
                "You pay"
              )
            }
            aside={chip("pay", payTok)}
            seam="bottom"
            foot={usd(n * payTok.price)}
            footAside={<span className="truncate">Balance {balanceOf(payTok)}</span>}
          >
            <input
              value={sell}
              onChange={(e) => {
                const v = e.target.value
                if (/^\d*\.?\d*$/.test(v)) setSell(v)
              }}
              placeholder="0"
              inputMode="decimal"
              aria-label={`Amount of ${payTok.symbol} to pay`}
              className={amountText("lead", !sell)}
              style={insufficient ? { color: "var(--chart-down)" } : undefined}
            />
            {/* Max sits in the amount row, clear of the flip on the seam */}
            <button type="button" onClick={() => setSell(String(payTok.balance))} aria-label={`Use the full balance, ${balanceOf(payTok)} ${payTok.symbol}`} className={cn("shrink-0", PILL)}>
              Max
            </button>
          </AmountBox>
          <FlipButton onClick={flip} label="Flip pair" />
          <AmountBox label="You receive" seam="top" aside={chip("receive", recvTok)} foot={usd((parseFloat(buyAmt.replace(/,/g, "")) || 0) * recvTok.price)} footAside={<span>Balance {balanceOf(recvTok)}</span>}>
            <span aria-label={`Amount of ${recvTok.symbol} to receive`} className={cn(amountText("second", !buyAmt), "truncate")}>
              {buyAmt || "0"}
            </span>
          </AmountBox>
        </div>

        <div role="status" className={cn("flex flex-col gap-1.5 py-3", flush ? "px-3" : "px-1")}>
          <Line
            label="Rate"
            value={`1 ${payTok.symbol} = ${rate.toLocaleString("en-US", { maximumFractionDigits: rate >= 100 ? 0 : 5 })} ${recvTok.symbol}`}
            tip={`${payTok.symbol} price ÷ ${recvTok.symbol} price = ${usd(payTok.price)} ÷ ${usd(recvTok.price)}`}
          />
          <Line label="Slippage" value={slip === "Auto" ? `Auto, ${AUTO_SLIP}%` : slip} />
        </div>

        {/* the one loud control; its label is the state of the ticket. A valid swap wears
            green: the receive side is bought */}
        <PrimaryButton
          className={cn(flush && "mx-3 mb-3 w-[calc(100%-24px)]", enabled && GO)}
          state={state === "ready" ? `ready-${payTok.symbol}-${recvTok.symbol}` : state}
          disabled={!enabled}
          busy={done}
          onClick={submit}
          label={
            <>
              {done && <Check size={14} aria-hidden />}
              {verdict}
            </>
          }
        />

        <TicketModal open={settings} title="Swap settings" onClose={() => setSettings(false)}>
          <div className="px-3 pb-2 text-[12px] text-foreground/60">Max slippage</div>
          <Segments name="Max slippage" value={slip} onChange={setSlip} options={SLIPPAGES.map((s) => ({ value: s, label: s }))} />
          <p className="px-3 pt-2 text-[12px] text-foreground/60">
            {`The least you receive is the quote less ${slipPct}%: ${buyAmt ? `${(n * rate * (1 - slipPct / 100)).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${recvTok.symbol}` : "enter an amount to see it"}.`}
          </p>
          <button type="button" className={cn("mt-3", modalPrimary)} onClick={() => setSettings(false)}>
            Done
          </button>
        </TicketModal>
      </div>
    </IconSlot.Provider>
  )
}
