"use client"

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Leverage Ticket, written new through ssych-component (2026-09-29).
   What it is for: opening a leveraged position with the price that would liquidate it
   in view before anything is confirmed.
   Read first: the margin you type, the one large figure; then the liquidation price
   under the slider.
   The pointer: drag the leverage slider, press a mark under it, or use the arrow keys;
   the position size, the contracts, the fee and the liquidation price follow at once, and
   the strip shows the room between entry and liquidation closing as leverage climbs. The
   white button's label is the validation state.
   Sketch used: src/components/lab/LeverageTicketPro.tsx. Kept: side, collateral and
   leverage as the three inputs, the same liquidation formula with its maintenance rate,
   the live position value, size, fee and distance, and the bar that shrinks as leverage
   climbs. Changed: no card or outlined field; the slider is drawn here, in ink, where the
   sketch used the browser's own in blue and amber; the button is white and says why it
   cannot be pressed, where the sketch's was tinted and always live.
   No reference was named for this one.
   Formulas:
   · position size   margin × leverage
   · contracts       position size ÷ entry
   · liquidation     entry × (1 − 1 ÷ leverage + maintenance) for a long,
                     entry × (1 + 1 ÷ leverage − maintenance) for a short
   · distance        (liquidation − entry) ÷ entry × 100, signed
   · fee             position size × fee rate
   · strip           |distance| ÷ 50%, so 2× fills it
   · can be placed   margin ≥ the minimum and margin + fee ≤ balance
   Colour pass (2026-09-30): long and short are a direction, so a ticket that can be placed
   wears it on the button, green for a long and red for a short, the ink on it from
   --on-accent / --on-danger; until then the button is the quiet white control.
   2026-10-01: the caption under the strip ("Liquidation" and "Entry" at its two ends) is
   gone; the entry is in the top row and the liquidation price sits over the strip. */

const EASE = [0.16, 1, 0.3, 1] as const
const TAB_EASE = [0.22, 1, 0.36, 1] as const
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
/** the thumb's width, so the track can keep it inside its ends */
const THUMB = 14

export type LeverageSide = "long" | "short"

export interface LeverageOrder {
  side: LeverageSide
  margin: number
  leverage: number
  /** margin × leverage */
  notional: number
  /** notional ÷ entry */
  contracts: number
  liquidation: number
}

export interface LeverageTicketProps {
  symbol?: string
  /** the asset the contracts are counted in */
  base?: string
  /** the currency the margin is posted in */
  quote?: string
  /** the price the position would open at */
  entry?: number
  /** free margin in the account */
  balance?: number
  defaultSide?: LeverageSide
  /** opening margin, as typed */
  defaultMargin?: string
  defaultLeverage?: number
  maxLeverage?: number
  /** the smallest margin the venue takes */
  minMargin?: number
  /** maintenance margin rate, as a fraction of the entry price */
  maintenance?: number
  /** taker fee, as a fraction of the position size */
  feeRate?: number
  onSubmit?: (order: LeverageOrder) => void
  className?: string
}

const num = (n: number, dp: number) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

function Slider({
  value,
  max,
  marks,
  onChange,
}: {
  value: number
  max: number
  marks: number[]
  onChange: (v: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const share = (v: number) => (max > 1 ? (v - 1) / (max - 1) : 0)
  const from = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const p = clamp((clientX - r.left - THUMB / 2) / Math.max(1, r.width - THUMB), 0, 1)
    onChange(Math.round(1 + p * (max - 1)))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const to =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? value + 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? value - 1
          : e.key === "Home"
            ? 1
            : e.key === "End"
              ? max
              : null
    if (to === null) return
    e.preventDefault()
    onChange(clamp(to, 1, max))
  }
  return (
    <div>
      {/* pointer capture, so a drag that leaves the track still moves the thumb */}
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Leverage"
        aria-valuemin={1}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} times`}
        onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          from(e.clientX)
        }}
        onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) from(e.clientX)
        }}
        onKeyDown={onKey}
        className="group relative h-6 cursor-pointer touch-none outline-none"
      >
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-foreground/[0.1]" />
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-foreground/[0.55]"
          style={{ width: `calc(${THUMB / 2}px + ${share(value)} * (100% - ${THUMB}px))` }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 -mt-[7px] h-[14px] w-[14px] rounded-full bg-foreground transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-125 motion-reduce:transition-none"
          style={{ left: `calc(${share(value)} * (100% - ${THUMB}px))` }}
        />
      </div>
      <div className="relative h-5">
        {marks.map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-label={`Set leverage to ${m} times`}
            className={cn(
              "absolute top-0 h-5 text-[10px] outline-none transition-colors duration-150 hover:text-foreground/90 focus-visible:text-foreground/90",
              m === value ? "text-foreground/90" : "text-foreground/45",
            )}
            style={
              i === 0
                ? { left: 0 }
                : i === marks.length - 1
                  ? { right: 0 }
                  : { left: `calc(${THUMB / 2}px + ${share(m)} * (100% - ${THUMB}px))`, transform: "translateX(-50%)" }
            }
          >
            {m}×
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A leveraged order on the page: side, margin, a leverage slider, and under it the
 * position that would open and the price that would close it by force. Everything follows
 * the slider as it moves; the white button reads the state of the ticket.
 */
export function LeverageTicket({
  symbol = "BTC-PERP",
  base = "BTC",
  quote = "USDC",
  entry = 67412.5,
  balance = 2500,
  defaultSide = "long",
  defaultMargin = "500",
  defaultLeverage = 10,
  maxLeverage = 50,
  minMargin = 10,
  maintenance = 0.005,
  feeRate = 0.0005,
  onSubmit,
  className,
}: LeverageTicketProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const [side, setSide] = useState<LeverageSide>(defaultSide)
  const [typed, setTyped] = useState(defaultMargin)
  const [lev, setLev] = useState(clamp(Math.round(defaultLeverage), 1, maxLeverage))

  const long = side === "long"
  const margin = parseFloat(typed) || 0
  const notional = margin * lev
  const contracts = entry > 0 ? notional / entry : 0
  const liquidation = Math.max(0, long ? entry * (1 - 1 / lev + maintenance) : entry * (1 + 1 / lev - maintenance))
  const distance = entry > 0 ? ((liquidation - entry) / entry) * 100 : 0
  const fee = notional * feeRate
  const room = clamp(Math.abs(distance) / 50, 0, 1) * 100

  const state = margin <= 0 ? "empty" : margin < minMargin ? "small" : margin + fee > balance ? "short" : "ready"
  const enabled = state === "ready"
  const verdict =
    state === "empty"
      ? "Enter margin"
      : state === "small"
        ? `Margin under ${num(minMargin, 0)} ${quote}`
        : state === "short"
          ? `Insufficient ${quote}`
          : `${long ? "Long" : "Short"} ${num(contracts, 4)} ${base} at ${lev}×`

  const marks = [1, 10, 25, 50].filter((m) => m <= maxLeverage)
  if (marks[marks.length - 1] !== maxLeverage) marks.push(maxLeverage)

  const row = (label: string, value: string) => (
    <div className="flex items-baseline justify-between text-[11px]">
      <span className="text-foreground/45">{label}</span>
      <span className="text-foreground/90">{value}</span>
    </div>
  )

  return (
    <div
      className={cn("w-[320px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}
      role="group"
      aria-label={`${symbol} ${side} at ${lev} times, liquidation ${num(liquidation, 2)}`}
    >
      <div className="mb-3 flex items-baseline justify-between px-1">
        <span className="text-[13px] font-medium text-foreground/90">{symbol}</span>
        <span className="text-[11px] text-foreground/45">Entry {num(entry, 2)}</span>
      </div>

      <div role="radiogroup" aria-label="Side" className="grid grid-cols-2">
        {(["long", "short"] as const).map((s) => {
          const on = side === s
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSide(s)}
              className={cn(
                "relative h-7 rounded-full text-[11.5px] font-medium outline-none transition-colors duration-200",
                !on && "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90",
              )}
              style={on ? { color: ink(s === "long" ? GREEN : RED) } : undefined}
            >
              {on &&
                (reduced ? (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
                ) : (
                  <motion.span
                    aria-hidden
                    layoutId={`${uid}-side`}
                    className="absolute inset-0 rounded-full bg-foreground/[0.08]"
                    transition={{ duration: 0.25, ease: TAB_EASE }}
                  />
                ))}
              <span className="relative">{s === "long" ? "Long" : "Short"}</span>
            </button>
          )
        })}
      </div>

      {/* 9.5 (the 19px Max pill) + 14 padding = 23.5, so 24 */}
      <div className="mt-2 flex flex-col gap-2 rounded-[24px] bg-foreground/[0.04] p-3.5 transition-colors duration-150 focus-within:bg-foreground/[0.06]">
        <div className="flex items-center justify-between text-[11px] text-foreground/45">
          <span>Margin</span>
          <span className="flex items-center gap-1.5">
            Free {num(balance, 2)} {quote}
            <button
              type="button"
              onClick={() => setTyped(String(Math.floor((balance / (1 + lev * feeRate)) * 100) / 100))}
              aria-label="Use all the free margin, fee included"
              className="rounded-full bg-foreground/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70 outline-none transition-[color,background-color,scale] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 hover:bg-foreground/[0.14] hover:text-foreground/90 focus-visible:bg-foreground/[0.14]"
            >
              Max
            </button>
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <input
            value={typed}
            onChange={(e) => {
              const v = e.target.value
              if (/^\d*\.?\d{0,2}$/.test(v)) setTyped(v)
            }}
            placeholder="0"
            inputMode="decimal"
            aria-label={`Margin in ${quote}`}
            className={cn(
              "w-full min-w-0 bg-transparent text-[22px] font-semibold leading-none tracking-[-0.02em] caret-foreground outline-none placeholder:text-foreground/35",
              typed ? "text-foreground/90" : "text-foreground/35",
            )}
          />
          <span className="text-[13px] font-semibold text-foreground/90">{quote}</span>
        </div>
      </div>

      <div className="mt-4 px-1">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[11px] text-foreground/45">Leverage</span>
          <span className="text-[13px] font-semibold text-foreground/90">{lev}×</span>
        </div>
        <Slider value={lev} max={maxLeverage} marks={marks} onChange={setLev} />
      </div>

      <div role="status" className="mt-3 flex flex-col gap-1.5 px-1">
        {row("Position size", `${num(notional, 2)} ${quote}`)}
        {row("Contracts", `${num(contracts, 4)} ${base}`)}
        {row(`Fee · ${(feeRate * 100).toFixed(2)}%`, `${num(fee, 2)} ${quote}`)}

        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-[11px] text-foreground/45">Liquidation price</span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[10.5px] font-medium" style={{ color: ink(distance >= 0 ? GREEN : RED) }}>
              {distance >= 0 ? "+" : "−"}
              {Math.abs(distance).toFixed(2)}%
            </span>
            <span className="text-[13px] font-semibold text-foreground/90">{num(liquidation, 2)}</span>
          </span>
        </div>
        {/* entry sits at one end; the fill is the room left before liquidation. It follows
            the slider at once (keys and drags repeat), on transform only */}
        <div aria-hidden className="flex h-[3px] rounded-full bg-foreground/[0.1]">
          <span
            className="w-full rounded-full"
            style={{
              transform: `scaleX(${room / 100})`,
              transformOrigin: long ? "right" : "left",
              background: `color-mix(in srgb, ${long ? RED : GREEN} 70%, transparent)`,
            }}
          />
        </div>
      </div>

      {/* the one solid control; its label is the state of the ticket */}
      <motion.button
        type="button"
        disabled={!enabled}
        onClick={() => onSubmit?.({ side, margin, leverage: lev, notional, contracts, liquidation })}
        whileTap={enabled && !reduced ? { scale: 0.97 } : undefined}
        transition={reduced ? { duration: 0 } : LIFT_SPRING}
        className="mt-4 h-11 w-full rounded-full bg-foreground/[0.92] text-[13px] font-semibold text-background outline-none transition-[background-color,color,opacity,filter] duration-200 enabled:cursor-pointer enabled:hover:brightness-[1.06] enabled:focus-visible:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-35"
        /* a ticket that can be placed wears its direction: green long, red short */
        style={
          enabled
            ? long
              ? { background: GREEN, color: "var(--on-accent, var(--background))" }
              : { background: RED, color: "var(--on-danger, var(--background))" }
            : undefined
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          {/* keyed by the state and the side, so dragging the slider changes the figures without replaying the swap */}
          <motion.span
            key={`${state}-${side}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
            transition={{ duration: 0.15, ease: EASE }}
            className="block"
          >
            {verdict}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
