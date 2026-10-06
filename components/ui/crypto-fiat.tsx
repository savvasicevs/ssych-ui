"use client"

import { useId, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpDown } from "lucide-react"

import { BUTTON, SURFACE } from "@/components/ui/control-classes"
import { cn } from "@/lib/utils"

/* Crypto Fiat: an amount typed in dollars or in units, with the other side worked out under it.
   2026-10-02 audit: the figure starts at 32px semibold (the house headline weight) and steps
   down to 26, 22 and 18 as it grows (it was 46px regular stepping to 14); the field sits on
   the surface step (7%, a 24px corner, 16px in) so it reads as somewhere to type; the second
   grey (--muted-foreground) is gone for the one ink ladder: placeholder and unit /45, the
   counter value /60; the switch is the control material at 32px with a 14px arrow; pointing at
   the counter shows the rate it was worked through.
   2026-10-02 round 2: (his note: "nicer, taller like a real card, a slide chart under it"): a
   card of card proportions, 320 by 200 (1.6 to 1, a bank card is 1.59), laid out top to bottom:
   the label row (the asset's name /45, the rate it converts at /90), the typed figure left
   aligned, then the switch with the counter value and, across from it, the rate's move over the
   window in its hue. Under them a sparkline of the rate runs edge to edge and to the bottom; the
   card's corner clips it (brief rule 2). The rate is printed on the label row now, so the tip
   that showed it on the switch is gone (no figure twice). The figure's row keeps one height at
   every size step and the move keeps its place, so switching dollars and units changes no size.
   Focus sits on the card's own edge while the figure is being typed (an inset 1px line in ink),
   never the page's blue outline. New props: `name`, `history` (the rate over the window, oldest
   first) and `window` ("24h"); without `history` a sample day that ends at `price` is drawn.
   Formulas:
   · counter, typed in dollars   amount ÷ price, in units
   · counter, typed in units     amount × price, in dollars
   · the rate on the label row   1 unit = price
   · the move                    (last − first) ÷ first × 100 over `history`
   · the sparkline               each point of `history`, x evenly spaced across the card, y from
                                 the window's low (bottom) to its high (top) */

const EASE = [0.16, 1, 0.3, 1] as const
const ACCENT = "var(--chart-1)"

/** Number pop-in — each character blurs, pops and slides into place, staggered
 * left→right. Keyed by position + glyph, so only the digits that actually
 * changed re-flip: a keystroke pops one digit, a denomination swap cascades the
 * whole value. The old glyph leaves at once rather than animating out, so two
 * values never share the row mid-swap. tabular-nums keeps the columns still. */
function Digits({ text }: { text: string }) {
  const reduced = useReducedMotion()
  return (
    <span className="inline-flex tabular-nums">
      {text.split("").map((ch, i) => (
        <motion.span
          key={`${i}-${ch}`}
          initial={reduced ? false : { opacity: 0, y: 7, scale: 0.5, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={reduced ? { duration: 0 } : { duration: 0.34, ease: EASE, delay: 0.02 * i }}
          className="inline-block"
          style={{ whiteSpace: "pre" }}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  )
}

/** Threshold curve, not a scale transform, so the type stays crisp at every
 * length. The row keeps the 32px tier's height at every step, so nothing moves. */
const sizeFor = (len: number) => (len >= 19 ? 18 : len >= 16 ? 22 : len >= 13 ? 26 : 32)

const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
/** a hue as text: its lightness capped in the light theme so small figures stay readable */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

const NAMES: Record<string, string> = { ETH: "Ethereum", BTC: "Bitcoin", SOL: "Solana", TAO: "Bittensor", USDC: "USD Coin", USDT: "Tether" }

/** a sample day of the rate, 48 half-hour points ending exactly at `price` */
function sampleDay(price: number) {
  const n = 48
  const raw = Array.from({ length: n }, (_, i) => 1 - 0.021 * (1 - i / (n - 1)) + 0.0085 * Math.sin(i * 0.55) + 0.0055 * Math.sin(i * 1.9 + 0.7))
  const last = raw[n - 1]
  return raw.map((v) => (price * v) / last)
}

const SPARK_W = 320
const SPARK_H = 64
/** the line keeps 8px of air above its high and 10 above the card's bottom at its low */
const SPARK_TOP = 8
const SPARK_LOW = SPARK_H - 10

export interface CryptoFiatProps {
  /** Unit ticker for the crypto side. */
  symbol?: string
  /** Unit price in the fiat currency — the counter value derives from it. */
  price?: number
  /** Prefilled fiat amount, digits only (no $). */
  defaultAmount?: string
  /** Fires with the raw digits and which denomination they are in. */
  onChange?: (raw: string, denomination: "fiat" | "crypto") => void
  /** the asset's name on the label row; read from the symbol for the majors, else the symbol */
  name?: string
  /** the rate over the window, oldest first; its last point should be `price` */
  history?: number[]
  /** the window `history` covers, printed after the move */
  window?: string
  className?: string
}

/**
 * Dual-denomination amount on a card. Type in fiat OR units; the switch under the figure
 * flips which side you are editing and carries the value through the rate, and the counter
 * value rides along, popping only the digits that changed. The rate's day runs under it all
 * as a sparkline, edge to edge.
 */
export function CryptoFiat({
  symbol = "ETH",
  price = 3050,
  defaultAmount = "2500",
  onChange,
  name,
  history,
  window: span = "24h",
  className,
}: CryptoFiatProps) {
  const [isFiat, setIsFiat] = useState(true)
  // Prefilled: $2,500 at $3,050/ETH → 0.819672 ETH (counter = amount / price)
  const [raw, setRaw] = useState(defaultAmount)
  const gid = useId().replace(/:/g, "")

  const n = parseFloat(raw) || 0
  const counter = useMemo(
    () =>
      isFiat
        ? `${(n / price).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${symbol}`
        : `$${(n * price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    [isFiat, n, price, symbol],
  )

  const series = useMemo(() => (history && history.length > 1 ? history : sampleDay(price)), [history, price])
  const first = series[0]
  const move = first > 0 ? ((series[series.length - 1] - first) / first) * 100 : 0
  const hue = move >= 0 ? GREEN : RED
  const { line, area } = useMemo(() => {
    const lo = Math.min(...series)
    const hi = Math.max(...series)
    const pts = series.map((v, i) => [(i / (series.length - 1)) * SPARK_W, hi > lo ? SPARK_LOW - ((v - lo) / (hi - lo)) * (SPARK_LOW - SPARK_TOP) : (SPARK_LOW + SPARK_TOP) / 2] as const)
    const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
    return { line: d, area: `${d} L${SPARK_W} ${SPARK_H} L0 ${SPARK_H} Z` }
  }, [series])

  const display = isFiat ? (raw ? `$${raw}` : "") : raw
  const fontSize = sizeFor(display.length)
  const inputRef = useRef<HTMLInputElement>(null)
  const rate = `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const commit = (value: string, fiat: boolean) => {
    setRaw(value)
    onChange?.(value, fiat ? "fiat" : "crypto")
  }

  return (
    <div
      role="group"
      aria-label={`${name ?? NAMES[symbol.toUpperCase()] ?? symbol} amount, 1 ${symbol} = ${rate}, ${move >= 0 ? "up" : "down"} ${Math.abs(move).toFixed(2)}% in ${span}`}
      className={cn(
        /* the focus line is drawn on a layer over the sparkline, so it holds along the bottom edge too */
        "relative flex h-[200px] w-[320px] max-w-full flex-col overflow-hidden rounded-[24px] tabular-nums [--ink-l:0.5] dark:[--ink-l:1] after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-[inherit] after:transition-shadow after:duration-150 has-[input:focus]:after:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_20%,transparent)]",
        SURFACE,
        className,
      )}
    >
      <div className="relative z-10 px-4 pt-4">
        <div className="mb-3 flex items-baseline justify-between gap-3 text-[12px]">
          <span className="truncate text-foreground/45">{name ?? NAMES[symbol.toUpperCase()] ?? symbol}</span>
          <span className="shrink-0 font-medium text-foreground/90">
            1 {symbol} = {rate}
          </span>
        </div>

        {/* The invisible sizer span makes the field exactly as wide as its text, so
            the unit suffix sits after the last decimal at any length — no width
            estimation, no overlap. The row is one height at every size step. */}
        <div
          className="flex h-[37px] w-full min-w-0 cursor-text items-center overflow-hidden"
          onMouseDown={(e) => {
            if (e.target !== inputRef.current) {
              e.preventDefault()
              inputRef.current?.focus()
            }
          }}
        >
          <div className="relative min-w-0">
            <span aria-hidden className="invisible block whitespace-pre font-semibold tracking-[-0.02em]" style={{ fontSize, lineHeight: 1.15 }}>
              {display || (isFiat ? "$0" : `0 ${symbol}`)}
            </span>
            <input
              ref={inputRef}
              value={display}
              onChange={(e) => {
                const v = e.target.value.replace(/^\$/, "")
                if (/^\d*\.?\d*$/.test(v)) commit(v, isFiat)
              }}
              placeholder={isFiat ? "$0" : `0 ${symbol}`}
              inputMode="decimal"
              aria-label={isFiat ? "Fiat amount" : `${symbol} amount`}
              className={cn(
                "no-focus-ring absolute inset-0 w-full bg-transparent font-semibold tracking-[-0.02em] outline-none! placeholder:text-foreground/45",
                raw ? "text-foreground/90" : "text-foreground/45",
              )}
              style={{ fontSize, lineHeight: 1.15, caretColor: ACCENT }}
            />
          </div>
          {!isFiat && raw && <span className="pointer-events-none shrink-0 pl-2 text-[16px] text-foreground/45">{symbol}</span>}
        </div>

        <div className="mt-2 flex h-8 items-center justify-between gap-3">
          <button
            type="button"
            aria-label={`Switch denomination, ${counter}`}
            onClick={() => {
              const next = !isFiat
              setIsFiat(next)
              const v = parseFloat(raw) || 0
              commit(!v ? "" : isFiat ? (v / price).toFixed(6).replace(/\.?0+$/, "") : (v * price).toFixed(2), next)
            }}
            className={cn("h-8 min-w-0 px-3 text-[12px] font-medium text-foreground/60", BUTTON)}
          >
            <ArrowUpDown size={14} aria-hidden className="shrink-0" />
            <Digits text={counter} />
          </button>
          <span className="shrink-0 text-[12px] font-medium" style={{ color: ink(hue) }}>
            {move >= 0 ? "+" : "−"}
            {Math.abs(move).toFixed(2)}% <span className="font-normal text-foreground/45">{span}</span>
          </span>
        </div>
      </div>

      {/* the rate's window, edge to edge and down to the card's bottom; the corner clips it */}
      <svg aria-hidden className="absolute inset-x-0 bottom-0 block w-full" height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hue} stopOpacity={0.16} />
            <stop offset="100%" stopColor={hue} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid}-fill)`} />
        <path d={line} fill="none" stroke={hue} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}
