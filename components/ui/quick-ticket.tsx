"use client"

import { useEffect, useId, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Quick Ticket, written new through ssych-component (2026-09-29).
   What it is for: placing a small order from a watchlist row without leaving it. At rest
   it is one line (symbol, last price, Buy, Sell); pressed, it opens into a ticket.
   Read first: the white button. It names the order it will place.
   The pointer: Buy or Sell on the line opens the ticket on that side; the two switches
   slide a fill; minus and plus step the size and the size can be typed; "Use last" puts
   the last price in the limit field; Close or Escape folds it back to the line.
   Sketch used: src/components/lab/QuickTicket.tsx. Kept: the line that becomes a ticket,
   side, market or limit, the size stepper, the limit price with its reset, the estimate
   and the placed state that folds the ticket away. It was a floating popover; here it opens
   in the flow, and it opens already unfolded so the ticket can be seen.
   Changed: no card, outline or shadow, one family (it set figures in mono), the type
   switch no longer uses a blue, the button is white, icons became words.
   Motion pass (2026-09-30): the ticket and the limit field open through grid rows 0fr to
   1fr in 250ms (no height animation); the button's label swaps in place and "Order
   placed" draws a green check; presses sink to 0.97 on the lift spring.
   Formulas:
   · price     market: the last price · limit: the typed limit
   · estimate  size × price
   · from last (limit − last) ÷ last × 100, limit orders only */

const EASE = [0.16, 1, 0.3, 1] as const
const TAB_EASE = [0.22, 1, 0.36, 1] as const
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const PLACED_MS = 1200
/** the placed check: green, pulled toward the page ground so it holds on the white button */
const PLACED_INK = "color-mix(in srgb, var(--chart-up) 80%, var(--background))"
const GROW = "grid transition-[grid-template-rows] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
const GROW_INNER = "min-h-0 overflow-hidden transition-[opacity,filter] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)]"

export type QuickTicketSide = "buy" | "sell"
export type QuickTicketType = "market" | "limit"

export interface QuickTicketOrder {
  side: QuickTicketSide
  type: QuickTicketType
  symbol: string
  size: number
  /** the price the order is worked at */
  limit: number
  total: number
}

export interface QuickTicketProps {
  symbol?: string
  last?: number
  side?: QuickTicketSide
  size?: number
  type?: QuickTicketType
  /** opening limit price */
  limit?: number
  /** whether it opens unfolded */
  defaultOpen?: boolean
  onSubmit?: (order: QuickTicketOrder) => void
  className?: string
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

/**
 * A watchlist line that opens into an order ticket where it stands. Side and type are two
 * quiet switches, the size steps or types, and the white button reads back the order.
 */
export function QuickTicket({
  symbol = "NVDA",
  last = 121.44,
  side: initialSide = "buy",
  size: initialSize = 10,
  type: initialType = "limit",
  limit: initialLimit = 120.9,
  defaultOpen = true,
  onSubmit,
  className,
}: QuickTicketProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const [open, setOpen] = useState(defaultOpen)
  const [side, setSide] = useState<QuickTicketSide>(initialSide)
  const [type, setType] = useState<QuickTicketType>(initialType)
  const [sizeStr, setSizeStr] = useState(String(initialSize))
  const [limitStr, setLimitStr] = useState((initialLimit ?? last).toFixed(2))
  const [placed, setPlaced] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const size = parseInt(sizeStr, 10) || 0
  const price = type === "limit" ? parseFloat(limitStr) || 0 : last
  const total = size * price
  const away = last > 0 && price > 0 ? ((price - last) / last) * 100 : 0
  const buy = side === "buy"
  const state = placed ? "placed" : size <= 0 ? "size" : price <= 0 ? "price" : "ready"
  const verdict =
    state === "placed" ? "Order placed" : state === "size" ? "Enter a size" : state === "price" ? "Enter a price" : `${buy ? "Buy" : "Sell"} ${size} ${symbol}`

  const unfold = (s: QuickTicketSide) => {
    setSide(s)
    setPlaced(false)
    setOpen(true)
  }
  const submit = () => {
    if (state !== "ready") return
    onSubmit?.({ side, type, symbol, size, limit: price, total })
    setPlaced(true)
    timer.current = setTimeout(() => {
      setPlaced(false)
      setOpen(false)
    }, PLACED_MS)
  }
  const step = (by: number) => setSizeStr(String(Math.max(1, size + by)))

  const pills = <T extends string>(name: string, options: readonly T[], value: T, set: (v: T) => void, text: (v: T) => string, hue?: (v: T) => string) => (
    <div role="radiogroup" aria-label={name} className="grid" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => {
        const on = o === value
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => set(o)}
            className={cn(
              "relative h-7 rounded-full text-[11.5px] font-medium outline-none transition-colors duration-200",
              on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90",
            )}
            style={on && hue ? { color: ink(hue(o)) } : undefined}
          >
            {on &&
              (reduced ? (
                <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
              ) : (
                <motion.span aria-hidden layoutId={`${uid}-${name}`} className="absolute inset-0 rounded-full bg-foreground/[0.08]" transition={{ duration: 0.25, ease: TAB_EASE }} />
              ))}
            <span className="relative">{text(o)}</span>
          </button>
        )
      })}
    </div>
  )

  const stepper = (label: string, by: number, glyph: string) => (
    <button
      type="button"
      onClick={() => step(by)}
      aria-label={label}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 hover:bg-foreground/[0.08] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] focus-visible:text-foreground/90"
    >
      {glyph}
    </button>
  )

  return (
    <div
      className={cn("w-[300px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}
      role="group"
      aria-label={`${symbol} quick ticket, last ${usd(last)}${open ? `, ${verdict}` : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false)
      }}
    >
      <div className="flex h-8 items-center gap-2 px-1">
        <span className="text-[13px] font-medium text-foreground/90">{symbol}</span>
        <span className="text-[11px] text-foreground/45">Last {usd(last)}</span>
        <span className="ml-auto flex items-center gap-1">
          {open ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 rounded-full px-2.5 text-[11px] text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 ease-out hover:bg-foreground/[0.08] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] focus-visible:text-foreground/90 active:scale-[0.97] motion-reduce:active:scale-100"
            >
              Close
            </button>
          ) : (
            (["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => unfold(s)}
                aria-label={`${s === "buy" ? "Buy" : "Sell"} ${symbol}`}
                className="h-7 rounded-full bg-foreground/[0.06] px-3 text-[11.5px] font-medium outline-none transition-[background-color,transform,translate,scale,rotate] duration-150 ease-out hover:bg-foreground/[0.12] focus-visible:bg-foreground/[0.12] active:scale-[0.97] motion-reduce:active:scale-100"
                style={{ color: ink(s === "buy" ? GREEN : RED) }}
              >
                {s === "buy" ? "Buy" : "Sell"}
              </button>
            ))
          )}
        </span>
      </div>

      {/* grid rows 0fr to 1fr: the ticket opens without measuring or animating height; it
          stays mounted, so folded it is inert and hidden from a screen reader */}
      <div className={GROW} style={{ gridTemplateRows: open ? "1fr" : "0fr" }} inert={!open} aria-hidden={!open}>
        <div className={GROW_INNER} style={{ opacity: open ? 1 : 0, filter: open || reduced ? "none" : "blur(2px)" }}>
            <div className="pt-2">
              {pills(
                "Side",
                ["buy", "sell"] as const,
                side,
                setSide,
                (s) => (s === "buy" ? "Buy" : "Sell"),
                (s) => (s === "buy" ? GREEN : RED),
              )}
              <div className="mt-1">{pills("Type", ["market", "limit"] as const, type, setType, (t) => (t === "market" ? "Market" : "Limit"))}</div>

              <div className="mt-3 flex flex-col gap-1">
                {/* 14 (the 28px steppers) + 6 inset = 20 */}
                <div className="flex h-10 items-center gap-1 rounded-[20px] bg-foreground/[0.04] pl-3 pr-1.5 transition-colors duration-150 focus-within:bg-foreground/[0.07]">
                  <span className="shrink-0 text-[11px] text-foreground/45">Shares</span>
                  <input
                    value={sizeStr}
                    onChange={(e) => {
                      if (/^\d{0,6}$/.test(e.target.value)) setSizeStr(e.target.value)
                    }}
                    placeholder="0"
                    inputMode="numeric"
                    aria-label={`Shares of ${symbol}`}
                    className="min-w-0 flex-1 bg-transparent text-right text-[13px] font-semibold text-foreground/90 caret-foreground outline-none placeholder:text-foreground/35"
                  />
                  {stepper("One share fewer", -1, "−")}
                  {stepper("One share more", 1, "+")}
                </div>

                <div className={GROW} style={{ gridTemplateRows: type === "limit" ? "1fr" : "0fr" }} inert={type !== "limit"} aria-hidden={type !== "limit"}>
                  <div className={GROW_INNER} style={{ opacity: type === "limit" ? 1 : 0 }}>
                  {/* 14 (the 28px Use last pill) + 6 inset = 20 */}
                  <label className="flex h-10 items-center gap-2 rounded-[20px] bg-foreground/[0.04] pl-3 pr-1.5 transition-colors duration-150 focus-within:bg-foreground/[0.07]">
                    <span className="shrink-0 text-[11px] text-foreground/45">Limit</span>
                    <input
                      value={limitStr}
                      onChange={(e) => {
                        if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setLimitStr(e.target.value)
                      }}
                      placeholder="0.00"
                      inputMode="decimal"
                      aria-label="Limit price in dollars"
                      className="min-w-0 flex-1 bg-transparent text-right text-[13px] font-semibold text-foreground/90 caret-foreground outline-none placeholder:text-foreground/35"
                    />
                    <button
                      type="button"
                      onClick={() => setLimitStr(last.toFixed(2))}
                      className="h-7 shrink-0 rounded-full px-2 text-[10.5px] text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 hover:bg-foreground/[0.08] hover:text-foreground/90 focus-visible:bg-foreground/[0.08] focus-visible:text-foreground/90"
                    >
                      Use last
                    </button>
                  </label>
                  </div>
                </div>
              </div>

              <div role="status" className="mt-3 flex flex-col gap-1.5 px-1 text-[11px]">
                {type === "limit" && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-foreground/45">From last</span>
                    <span style={{ color: price > 0 ? ink(away >= 0 ? GREEN : RED) : undefined }}>
                      {away >= 0 ? "+" : "−"}
                      {Math.abs(away).toFixed(2)}%
                    </span>
                  </div>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-foreground/45">Estimate</span>
                  <span className="font-semibold text-foreground/90">{usd(total)}</span>
                </div>
              </div>

              {/* the one solid control; its label is the order it will place */}
              <motion.button
                type="button"
                disabled={state !== "ready"}
                onClick={submit}
                whileTap={state === "ready" && !reduced ? { scale: 0.97 } : undefined}
                transition={reduced ? { duration: 0 } : LIFT_SPRING}
                className="mt-4 h-11 w-full rounded-full bg-foreground/[0.92] text-[13px] font-semibold text-background outline-none transition-[background-color,opacity] duration-200 enabled:cursor-pointer enabled:hover:bg-foreground enabled:focus-visible:bg-foreground disabled:cursor-not-allowed disabled:opacity-35"
              >
                {/* the label swaps in place (4px, 2px blur, 150ms); placed, a check draws in */}
                <motion.span
                  key={verdict}
                  className="inline-flex items-center gap-1.5"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.15, ease: EASE }}
                >
                  {placed && (
                    <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <motion.path
                        d="M2.5 6.2 5 8.6l4.5-5"
                        stroke={PLACED_INK}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={reduced ? false : { pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.3, ease: EASE, delay: 0.08 }}
                      />
                    </svg>
                  )}
                  {verdict}
                </motion.span>
              </motion.button>
            </div>
        </div>
      </div>
    </div>
  )
}
