// provenance: original
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { BUTTON } from "@/components/ui/control-classes"
import { Line, PILL_32, PrimaryButton, RowField, Segments, TICKET_WIDTH, ink } from "@/components/ui/swap-ticket-field"
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
   · from last (limit − last) ÷ last × 100, limit orders only
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit: it rests folded, as the one line, and Buy or Sell unfolds it
   (defaultOpen is false; spec 13.8, nothing open on load). 320 wide like the other two
   tickets, and cut from the family's parts (swap-ticket-field.tsx): the switch material with
   the side as a 6px dot, the 48px round row fields, the 48px white primary. The folded Buy
   and Sell are the control material with a dot before the word (they were coloured words on a
   6% fill). The button reads "Buy NVDA" (the size is in its field) and the distance from
   last moved into the estimate's tip.
   Formulas, where each is shown: estimate on its line, its tip shows size × price and, for a
   limit, the distance from last.
   2026-10-02 round 2: (his notes after the side by side, applied to every ticket): no dots. The
   folded Buy and Sell are tinted in their hue (14% fill, the word in the hue); in the open
   ticket the chosen side is its pill tinted the same way and the other stays in ink; the dot
   before the button's label is gone. Nothing shifts: switching Market and Limit used to fold the
   limit row away and shorten the ticket; the row now stays, as the editable limit with Use last,
   or as the read-only last price the market order fills at, so the ticket keeps its height.
   The fields show focus on their own edge.
   2026-11-10: minus and plus repeat while held, since going from 1 share to 40 was 39
   taps. A tap is still one step, when the press lifts. Held, the size starts stepping
   400ms in, every 120ms, then every 50ms once the hold has lasted 1.5 s, and it stops the
   moment the press lifts, leaves the button, is cancelled or the window loses focus; the
   lift that ends a hold is not counted as one more tap. The button stays sunk for the
   whole hold and the size changes at once on every step, with no animation, so there is
   nothing for reduced motion to calm. By keyboard: hold Space or Enter on the button. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const PLACED_MS = 1200
/** a held stepper: the first repeat, the pace after it, and the faster pace once the hold is long */
const HOLD_START_MS = 400
const HOLD_STEP_MS = 120
const HOLD_FAST_MS = 50
const HOLD_FAST_AFTER_MS = 1500
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
  /** whether it opens unfolded (folded by default since the 2026-10-02 audit) */
  defaultOpen?: boolean
  onSubmit?: (order: QuickTicketOrder) => void
  className?: string
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
  defaultOpen = false,
  onSubmit,
  className,
}: QuickTicketProps) {
  const reduced = useReducedMotion()
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
  const verdict = state === "placed" ? "Order placed" : state === "size" ? "Enter a size" : state === "price" ? "Enter a price" : `${buy ? "Buy" : "Sell"} ${symbol}`

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
  /* reads the size as it is at that moment, so a run of steps from the hold never repeats a stale one */
  const step = (by: number) => setSizeStr((s) => String(Math.max(1, (parseInt(s, 10) || 0) + by)))

  /* the held stepper: `timer` is the next repeat, `view` the window watched for a lost
     focus, `fired` whether this press has already stepped by itself (then its lift is not a tap) */
  const hold = useRef<{ timer?: number; view?: Window | null; fired: boolean }>({ fired: false })
  const [held, setHeld] = useState(0)
  const letGo = useCallback(() => {
    const h = hold.current
    window.clearTimeout(h.timer)
    h.timer = undefined
    h.view?.removeEventListener("blur", letGo)
    h.view = null
    setHeld(0)
  }, [])
  const pressDown = (by: number, el: HTMLElement) => {
    letGo()
    const h = hold.current
    const t0 = performance.now()
    const tick = () => {
      h.fired = true
      step(by)
      h.timer = window.setTimeout(tick, performance.now() - t0 >= HOLD_FAST_AFTER_MS ? HOLD_FAST_MS : HOLD_STEP_MS)
    }
    h.fired = false
    h.timer = window.setTimeout(tick, HOLD_START_MS)
    /* a lift that never arrives (the window lost focus mid press) must not keep stepping */
    h.view = el.ownerDocument.defaultView
    h.view?.addEventListener("blur", letGo)
    setHeld(by)
  }
  useEffect(() => letGo, [letGo])
  useEffect(() => {
    if (!open) letGo()
  }, [open, letGo])

  const stepper = (label: string, by: number, glyph: string) => (
    <button
      type="button"
      aria-label={label}
      /* a tap, and a press from assistive tech, is one step; the lift after a hold is swallowed */
      onClick={() => {
        if (hold.current.fired) hold.current.fired = false
        else step(by)
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || !e.isPrimary) return
        /* a finger is captured by the button it lands on; freed, sliding off it stops the hold */
        if (e.pointerType === "touch" && e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
        pressDown(by, e.currentTarget)
      }}
      onPointerUp={letGo}
      /* left while still pressed, no click follows, so there is nothing to swallow */
      onPointerLeave={(e) => {
        letGo()
        if (e.buttons) hold.current.fired = false
      }}
      onPointerCancel={() => {
        letGo()
        hold.current.fired = false
      }}
      onKeyDown={(e) => {
        if (e.key !== " " && e.key !== "Enter") return
        /* the hold sets the pace, not the keyboard's own repeat */
        if (e.repeat) e.preventDefault()
        else pressDown(by, e.currentTarget)
      }}
      onKeyUp={(e) => {
        if (e.key !== " " && e.key !== "Enter") return
        letGo()
        /* Space clicks as it lifts (swallowed above if the hold stepped); Enter does not */
        if (e.key === "Enter") hold.current.fired = false
      }}
      onBlur={() => {
        letGo()
        hold.current.fired = false
      }}
      onContextMenu={(e) => {
        if (hold.current.timer !== undefined) e.preventDefault()
      }}
      data-held={held === by || undefined}
      /* sunk for the whole hold, by pointer or by key (BUTTON's own press scale) */
      className={cn("h-8 w-8 shrink-0 touch-manipulation select-none text-[14px] [-webkit-touch-callout:none] data-[held]:scale-[0.97] motion-reduce:data-[held]:scale-100", BUTTON)}
    >
      {glyph}
    </button>
  )

  return (
    <div
      className={cn(TICKET_WIDTH, "tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)}
      role="group"
      aria-label={`${symbol} quick ticket, last ${usd(last)}${open ? `, ${verdict}` : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false)
      }}
    >
      <div className="flex h-8 items-center gap-2 px-1">
        <span className="text-[13px] font-medium text-foreground/90">{symbol}</span>
        <span className="text-[12px] text-foreground/60">Last {usd(last)}</span>
        {/* Close and the Buy and Sell pills cross over in one grid cell (150ms, 2px blur), so
            opening the ticket neither swaps the header in one frame nor waits for the old one */}
        <span className="ml-auto grid justify-items-end [&>*]:[grid-area:1/1]">
        <AnimatePresence initial={false}>
          <motion.span
            key={open ? "close" : "sides"}
            className="flex items-center gap-1"
            initial={reduced ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
            animate={{ opacity: 1, filter: "blur(0px)", transition: { duration: 0.15, ease: EASE } }}
            exit={reduced ? { opacity: 0, transition: { duration: 0.15 } } : { opacity: 0, filter: "blur(2px)", transition: { duration: 0.15, ease: EASE } }}
          >
            {open ? (
              <button type="button" onClick={() => setOpen(false)} className={cn("h-7 px-3 text-[11.5px]", BUTTON)}>
                Close
              </button>
            ) : (
              (["buy", "sell"] as const).map((s) => {
                const hue = s === "buy" ? GREEN : RED
                return (
                  /* the side's own hue on the pill: light (2026-11-09, his pick A) the solid hue, lightness capped at OKLCH 0.52, white text at AA; dark a 14% fill and the word in the hue */
                  <button
                    key={s}
                    type="button"
                    onClick={() => unfold(s)}
                    aria-label={`${s === "buy" ? "Buy" : "Sell"} ${symbol}`}
                    className="inline-flex h-7 items-center rounded-[10.5px] bg-[oklch(from_var(--side)_min(l,0.52)_c_h)] px-3 text-[11.5px] font-medium text-white outline-none transition-[background-color,scale,filter] duration-150 hover:brightness-[1.06] active:scale-[0.97] dark:bg-[color-mix(in_srgb,var(--side)_14%,transparent)] dark:text-[var(--side-ink)] dark:hover:brightness-100 dark:hover:bg-[color-mix(in_srgb,var(--side)_20%,transparent)] focus-visible:brightness-[1.06] dark:focus-visible:bg-[color-mix(in_srgb,var(--side)_22%,transparent)] motion-reduce:active:scale-100"
                    style={{ ["--side" as string]: hue, ["--side-ink" as string]: ink(hue) }}
                  >
                    {s === "buy" ? "Buy" : "Sell"}
                  </button>
                )
              })
            )}
          </motion.span>
        </AnimatePresence>
        </span>
      </div>

      {/* grid rows 0fr to 1fr: the ticket opens without measuring or animating height; it
          stays mounted, so folded it is inert and hidden from a screen reader */}
      <div className={GROW} style={{ gridTemplateRows: open ? "1fr" : "0fr" }} inert={!open} aria-hidden={!open}>
        <div className={GROW_INNER} style={{ opacity: open ? 1 : 0, filter: open || reduced ? "none" : "blur(2px)" }}>
          <div className="pt-2">
            <Segments
              name="Side"
              value={side}
              onChange={setSide}
              options={[
                { value: "buy", label: "Buy", hue: GREEN },
                { value: "sell", label: "Sell", hue: RED },
              ]}
            />
            <Segments
              className="mt-1.5"
              name="Type"
              value={type}
              onChange={setType}
              options={[
                { value: "market", label: "Market" },
                { value: "limit", label: "Limit" },
              ]}
            />

            <div className="mt-3 flex flex-col">
              <RowField
                label="Shares"
                value={sizeStr}
                onChange={setSizeStr}
                places={0}
                inputMode="numeric"
                ariaLabel={`Shares of ${symbol}`}
                end={
                  <span className="flex gap-1">
                    {stepper("One share fewer", -1, "−")}
                    {stepper("One share more", 1, "+")}
                  </span>
                }
              />
              {/* the second row stays in both types, so switching them never changes the height */}
              {type === "limit" ? (
                <RowField
                  className="mt-1.5"
                  label="Limit"
                  value={limitStr}
                  onChange={setLimitStr}
                  places={2}
                  placeholder="0.00"
                  ariaLabel="Limit price in dollars"
                  end={
                    <button type="button" onClick={() => setLimitStr(last.toFixed(2))} className={PILL_32}>
                      Use last
                    </button>
                  }
                />
              ) : (
                <RowField className="mt-1.5" label="At market" value={last.toFixed(2)} ariaLabel="Market order, fills at the last price in dollars" />
              )}
            </div>

            <div role="status" className="mt-3 px-1">
              <Line
                label="Estimate"
                strong
                value={usd(total)}
                tip={`${size} × ${usd(price)}${type === "limit" ? `; the limit is ${away >= 0 ? "+" : "−"}${Math.abs(away).toFixed(2)}% from last (${usd(last)})` : ", at the last price"}`}
              />
            </div>

            {/* the one loud control; its label is the order it will place */}
            <PrimaryButton
              className="mt-4"
              state={`${state}-${side}`}
              disabled={state !== "ready"}
              onClick={submit}
              lightHue={buy ? GREEN : RED}
              label={
                <>
                  {placed ? (
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
                  ) : null}
                  {verdict}
                </>
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
