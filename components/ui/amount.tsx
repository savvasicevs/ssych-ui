"use client"

import { type CSSProperties, type ReactNode } from "react"

import { Tip } from "@/components/ui/amount-tip"
import { cn } from "@/lib/utils"

/* Amount, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · every amount names itself to a screen reader, with the sign said as a word and the
     full figure even where the screen shows a short one
   · it answers the pointer: pointing at a shortened amount ($1.2M, a trimmed balance, a
     rounded percent) shows the full figure in place, and leaving puts the short one back
   · a loss carries the true minus sign, in front of the currency symbol (−$1,234.00).
     formatFiat, formatCrypto and formatPercent return that glyph where they returned a hyphen
   · the primary ink is the value step (0.9), and an amount never breaks across two lines
   Names, props and defaults are the same.
   2026-10-02 round 2: (his note: "a cool hover interaction that shows more helpful
   information"): pointing at an amount, or focusing it, opens the library popover (the card of
   spec 14.6, from amount-tip.tsx) under a dotted underline that appears on hover, with what a
   reader of a balance actually asks next: the exact figure where the screen rounds or shortens
   it, and, when the caller gives what it needs, the change since yesterday in its hue, the
   worth in dollars and the price it was worked at (crypto), the figure in another currency, and
   a percent in dollars. The short figure no longer swaps to the full one in place, so the
   amount never changes width under the pointer (rule: nothing shifts); the full figure is the
   card's first line. An amount with nothing more to say opens no card. The screen reader name
   carries the same lines. New props, all optional: FiatAmount `previous`, `since`, `convert`;
   CryptoAmount `price`, `previousPrice`, `since`; PercentAmount `basis`, `basisSymbol`,
   `window`.
   Formulas, in the card:
   · exact            the value to 8 places, trailing zeros past the 2nd dropped
   · since yesterday  value − previous, and (value − previous) ÷ |previous| × 100
   · in a currency    value × rate
   · worth (crypto)   value × price
   · since (crypto)   value × (price − previousPrice), and (price − previousPrice) ÷ previousPrice × 100
   · in dollars (%)   basis × value ÷ 100 */

const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const MINUS = "−"

const group = (n: number, dp: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })

/** Fiat: fixed symbol placement, 2dp, sub-cent values widen to 4dp, optional K/M/B/T. */
export function formatFiat(value: number, { abbr = false, dp = 2, symbol = "$" } = {}) {
  const abs = Math.abs(value)
  const sign = value < 0 ? MINUS : ""
  if (abbr && abs >= 1e12) return `${sign}${symbol}${(abs / 1e12).toFixed(2)}T`
  if (abbr && abs >= 1e9) return `${sign}${symbol}${(abs / 1e9).toFixed(2)}B`
  if (abbr && abs >= 1e6) return `${sign}${symbol}${(abs / 1e6).toFixed(2)}M`
  if (abbr && abs >= 1e4) return `${sign}${symbol}${(abs / 1e3).toFixed(1)}K`
  return `${sign}${symbol}${group(abs, abs > 0 && abs < 0.01 ? 4 : dp)}`
}

/** Crypto: trailing symbol, significant precision only, dust decimals collapse. */
export function formatCrypto(value: number, symbol: string, dp = 8) {
  return `${value < 0 ? MINUS : ""}${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: dp })} ${symbol}`
}

/** Percent: fixed precision, explicit + on gains. */
export function formatPercent(value: number, { signed = true, dp = 2 } = {}) {
  return `${value < 0 ? MINUS : signed && value > 0 ? "+" : ""}${Math.abs(value).toFixed(dp)}%`
}

/** the sign as a word, so a reader never has to guess at a glyph */
const spoken = (text: string) => text.replace(MINUS, "minus ").replace("+", "plus ")

/** decimals the value really has, read to four places */
const places = (v: number) => Math.min(4, (String(Math.abs(Number(v.toFixed(4)))).split(".")[1] ?? "").length)

/** the value as it really is, to 8 places, keeping at least 2 */
const exactFiat = (value: number, symbol: string) => `${value < 0 ? MINUS : ""}${symbol}${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`
const signedFiat = (value: number, symbol = "$") => `${value > 0 ? "+" : ""}${formatFiat(value, { symbol })}`

type CardRow = { label: string; value: string; hue?: string }

/** a change as a card line: the amount and its percent, in the move's hue */
const changeRow = (label: string, amount: number, pct: number, symbol = "$"): CardRow => ({
  label,
  value: `${signedFiat(amount, symbol)} (${formatPercent(pct)})`,
  hue: amount === 0 ? undefined : amount > 0 ? GREEN : RED,
})

/* the one span all three are: the figure at rest, and the card of what a reader asks next
   under the pointer or focus. Nothing in the figure changes, so it never shifts */
function Figure({ short, rows, className, style }: { short: string; rows: CardRow[]; className?: string; style?: CSSProperties }) {
  const label = [spoken(short), ...rows.map((r) => `${r.label} ${spoken(r.value)}`)].join(", ")
  const figure = (
    <span
      role="img"
      aria-label={label}
      tabIndex={rows.length ? 0 : undefined}
      className={cn(
        "inline-block cursor-default whitespace-nowrap tabular-nums",
        rows.length &&
          "no-focus-ring underline decoration-transparent decoration-dotted underline-offset-[3px] outline-none! transition-[text-decoration-color] duration-150 hover:decoration-foreground/35 focus-visible:decoration-foreground/60",
        className,
      )}
      style={style}
    >
      {short}
    </span>
  )
  if (!rows.length) return figure
  return <Tip tip={<Card rows={rows} />}>{figure}</Tip>
}

/** the card's lines (spec 14.6): labels 10px /60, values 11px /90, a change in its hue */
function Card({ rows }: { rows: CardRow[] }): ReactNode {
  return (
    <span className="flex min-w-[160px] flex-col gap-1 py-0.5 tabular-nums">
      {rows.map((r) => (
        <span key={r.label} className="flex items-baseline justify-between gap-4 whitespace-nowrap">
          <span className="text-[10px] text-foreground/60">{r.label}</span>
          <span className="text-[11px] font-medium text-foreground/90" style={r.hue ? { color: r.hue } : undefined}>
            {r.value}
          </span>
        </span>
      ))}
    </span>
  )
}

/** a currency the amount can also be read in: 1 of this amount's currency = `rate` of it */
export interface AmountConversion {
  /** its symbol, printed first ("€") */
  symbol: string
  rate: number
  /** its name on the card's line ("EUR"); the symbol when left out */
  code?: string
  dp?: number
}

export interface FiatAmountProps {
  value: number
  /** Collapse large values to K / M / B / T. */
  abbr?: boolean
  /** Decimal places (sub-cent values still widen to 4). */
  dp?: number
  /** Currency symbol, prefixed. */
  symbol?: string
  /** Render in the muted ink instead of the primary one. */
  muted?: boolean
  /** the same figure at `since` (yesterday's close); the card shows the change */
  previous?: number
  /** what `previous` is from, as the card names it */
  since?: string
  /** other currencies the card reads it in */
  convert?: AmountConversion | AmountConversion[]
  className?: string
}

/** A fiat balance: symbol first, grouped, tabular so columns line up. Pointing at it opens a
 *  card with the exact figure, the change since yesterday and other currencies, when known. */
export function FiatAmount({ value, abbr, dp, symbol = "$", muted, previous, since = "yesterday", convert, className }: FiatAmountProps) {
  const short = formatFiat(value, { abbr, dp, symbol })
  const exact = exactFiat(value, symbol)
  const rows: CardRow[] = []
  if (exact !== short) rows.push({ label: "Exact", value: exact })
  if (previous !== undefined && previous !== 0) rows.push(changeRow(`Since ${since}`, value - previous, ((value - previous) / Math.abs(previous)) * 100, symbol))
  for (const c of convert === undefined ? [] : Array.isArray(convert) ? convert : [convert])
    rows.push({ label: `In ${c.code ?? c.symbol}`, value: formatFiat(value * c.rate, { symbol: c.symbol, dp: c.dp ?? 2 }) })
  return <Figure short={short} rows={rows} className={cn(muted ? "text-foreground/45" : "text-foreground/90", className)} />
}

export interface CryptoAmountProps {
  value: number
  /** Asset ticker, appended after the number. */
  symbol: string
  /** Maximum decimal places kept. */
  dp?: number
  muted?: boolean
  /** the price of one unit in dollars; the card shows what the amount is worth */
  price?: number
  /** the price at `since`; the card shows what the holding gained or lost since */
  previousPrice?: number
  since?: string
  className?: string
}

/** A crypto balance: ticker last, precision trimmed to what is significant. Pointing at it
 *  opens a card with all eight places, its worth and its change since yesterday, when known. */
export function CryptoAmount({ value, symbol, dp, muted, price, previousPrice, since = "yesterday", className }: CryptoAmountProps) {
  const short = formatCrypto(value, symbol, dp)
  const exact = formatCrypto(value, symbol)
  const rows: CardRow[] = []
  if (exact !== short) rows.push({ label: "Exact", value: exact })
  if (price !== undefined) {
    rows.push({ label: "Worth", value: formatFiat(value * price) })
    rows.push({ label: `${symbol} price`, value: formatFiat(price) })
    if (previousPrice !== undefined && previousPrice > 0)
      rows.push(changeRow(`Since ${since}`, value * (price - previousPrice), ((price - previousPrice) / previousPrice) * 100))
  }
  return <Figure short={short} rows={rows} className={cn(muted ? "text-foreground/45" : "text-foreground/90", className)} />
}

export interface PercentAmountProps {
  value: number
  /** Prefix gains with +. */
  signed?: boolean
  dp?: number
  /** Colour by sign (up / down). Off keeps it in the primary ink. */
  colored?: boolean
  /** the amount the percent is of; the card shows the move in money */
  basis?: number
  basisSymbol?: string
  /** the window the move covers, naming the card's money line ("24h") */
  window?: string
  className?: string
}

/** A change in percent: signed, and coloured up or down off that sign. Pointing at it opens a
 *  card with the places it really has and, given a basis, the move in money. */
export function PercentAmount({ value, signed, dp = 2, colored = true, basis, basisSymbol = "$", window: span, className }: PercentAmountProps) {
  const short = formatPercent(value, { signed, dp })
  const exact = formatPercent(value, { signed, dp: Math.max(dp, places(value)) })
  const rows: CardRow[] = []
  if (exact !== short) rows.push({ label: "Exact", value: exact })
  if (basis !== undefined) {
    const money = (basis * value) / 100
    rows.push({ label: span ? `In ${span}` : "In money", value: signedFiat(money, basisSymbol), hue: money === 0 ? undefined : money > 0 ? GREEN : RED })
    rows.push({ label: "Of", value: formatFiat(basis, { symbol: basisSymbol }) })
  }
  return (
    <Figure
      short={short}
      rows={rows}
      className={cn(!colored && "text-foreground/90", className)}
      style={colored ? { color: value >= 0 ? GREEN : RED } : undefined}
    />
  )
}

/**
 * The money-formatting family as one namespace: `Amount.Fiat`, `Amount.Crypto`,
 * `Amount.Percent`. One import so every number in a screen agrees on symbol
 * placement, precision, abbreviation and sign colouring.
 */
export const Amount = { Fiat: FiatAmount, Crypto: CryptoAmount, Percent: PercentAmount }
