import { cn } from "@/lib/utils"

const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

const group = (n: number, dp: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })

/** Fiat: fixed symbol placement, 2dp, sub-cent values widen to 4dp, optional K/M/B/T. */
export function formatFiat(value: number, { abbr = false, dp = 2, symbol = "$" } = {}) {
  const abs = Math.abs(value)
  if (abbr && abs >= 1e12) return `${symbol}${(value / 1e12).toFixed(2)}T`
  if (abbr && abs >= 1e9) return `${symbol}${(value / 1e9).toFixed(2)}B`
  if (abbr && abs >= 1e6) return `${symbol}${(value / 1e6).toFixed(2)}M`
  if (abbr && abs >= 1e4) return `${symbol}${(value / 1e3).toFixed(1)}K`
  return `${symbol}${group(value, abs > 0 && abs < 0.01 ? 4 : dp)}`
}

/** Crypto: trailing symbol, significant precision only — dust decimals collapse. */
export function formatCrypto(value: number, symbol: string, dp = 8) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: dp })} ${symbol}`
}

/** Percent: fixed precision, explicit + on gains. */
export function formatPercent(value: number, { signed = true, dp = 2 } = {}) {
  return `${signed && value > 0 ? "+" : ""}${value.toFixed(dp)}%`
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
  className?: string
}

/** A fiat balance — symbol first, grouped, tabular so columns line up. */
export function FiatAmount({ value, abbr, dp, symbol, muted, className }: FiatAmountProps) {
  return (
    <span className={cn("tabular-nums", muted ? "text-foreground/45" : "text-foreground", className)}>
      {formatFiat(value, { abbr, dp, symbol })}
    </span>
  )
}

export interface CryptoAmountProps {
  value: number
  /** Asset ticker, appended after the number. */
  symbol: string
  /** Maximum decimal places kept. */
  dp?: number
  muted?: boolean
  className?: string
}

/** A crypto balance — ticker last, precision trimmed to what is significant. */
export function CryptoAmount({ value, symbol, dp, muted, className }: CryptoAmountProps) {
  return (
    <span className={cn("tabular-nums", muted ? "text-foreground/45" : "text-foreground", className)}>
      {formatCrypto(value, symbol, dp)}
    </span>
  )
}

export interface PercentAmountProps {
  value: number
  /** Prefix gains with +. */
  signed?: boolean
  dp?: number
  /** Colour by sign (up / down). Off keeps it in the primary ink. */
  colored?: boolean
  className?: string
}

/** A change in percent — signed, and coloured up / down off that sign. */
export function PercentAmount({ value, signed, dp, colored = true, className }: PercentAmountProps) {
  return (
    <span
      className={cn("tabular-nums", !colored && "text-foreground", className)}
      style={colored ? { color: value >= 0 ? GREEN : RED } : undefined}
    >
      {formatPercent(value, { signed, dp })}
    </span>
  )
}

/**
 * The money-formatting family as one namespace — `Amount.Fiat`, `Amount.Crypto`,
 * `Amount.Percent`. One import so every number in a screen agrees on symbol
 * placement, precision, abbreviation and sign colouring.
 */
export const Amount = { Fiat: FiatAmount, Crypto: CryptoAmount, Percent: PercentAmount }
