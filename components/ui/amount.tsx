"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"

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
   Names, props and defaults are the same. */

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

/* the one span all three are: the short figure at rest, the full one under the pointer */
function Figure({ short, full, className, style }: { short: string; full: string; className?: string; style?: CSSProperties }) {
  const [hot, setHot] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const first = useRef(true)
  /* the swap between short and full is a text swap: 4px rise, 2px blur, 150ms; reduced
     motion keeps the fade and drops the rise. WAAPI, so the file ships with no motion dependency */
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const el = ref.current
    if (!el || short === full || typeof el.animate !== "function") return
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.animate(
      still
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: "translateY(4px)", filter: "blur(2px)" }, { opacity: 1, transform: "none", filter: "blur(0px)" }],
      { duration: 150, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    )
  }, [hot, short, full])
  return (
    <span
      ref={ref}
      role="img"
      aria-label={spoken(full)}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      className={cn("inline-block cursor-default whitespace-nowrap tabular-nums", className)}
      style={style}
    >
      {hot ? full : short}
    </span>
  )
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

/** A fiat balance: symbol first, grouped, tabular so columns line up. Pointing at a
 *  shortened one reads it in full. */
export function FiatAmount({ value, abbr, dp, symbol, muted, className }: FiatAmountProps) {
  return (
    <Figure
      short={formatFiat(value, { abbr, dp, symbol })}
      full={formatFiat(value, { dp, symbol })}
      className={cn(muted ? "text-foreground/45" : "text-foreground/90", className)}
    />
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

/** A crypto balance: ticker last, precision trimmed to what is significant. Pointing at a
 *  trimmed one reads it to eight places. */
export function CryptoAmount({ value, symbol, dp, muted, className }: CryptoAmountProps) {
  return (
    <Figure
      short={formatCrypto(value, symbol, dp)}
      full={formatCrypto(value, symbol)}
      className={cn(muted ? "text-foreground/45" : "text-foreground/90", className)}
    />
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

/** A change in percent: signed, and coloured up or down off that sign. Pointing at a
 *  rounded one reads it to the places it has. */
export function PercentAmount({ value, signed, dp = 2, colored = true, className }: PercentAmountProps) {
  return (
    <Figure
      short={formatPercent(value, { signed, dp })}
      full={formatPercent(value, { signed, dp: Math.max(dp, places(value)) })}
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
