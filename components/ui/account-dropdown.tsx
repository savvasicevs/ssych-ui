"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { SURFACE, THUMB } from "@/components/ui/control-classes"

/* Account Dropdown, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: switching between the accounts of one wallet, each with its own balance.
   Read first: the top row, which is the account in use: its mark, short address and balance.
   The pointer: pressing the top row folds the list away or back; pointing at an account
   steps the others back; pressing one makes it the account in use and folds the list.
   Escape and a press outside fold it too.
   Sketch used: src/components/lab/AccountDropdownPro.tsx. Kept: the trigger that shows the
   live account, the list of every account with its balance, the check on the one in use,
   the list opening in flow under the trigger, Escape and outside press. Changed: no
   outlined trigger or sheet, the marks are ink patterns worked from the address (they were
   two-colour gradients), the chosen row is ink (it was blue), balances are numbers and
   the line under the list sums them.
   Formulas:
   · in all        Σ balance of every account
   · share         balance ÷ in all × 100, shown under the balance of the row being pointed at
   · mark          a 5 by 5 mirrored pattern seeded from the characters of the address
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit: it starts closed (defaultOpen is false) and opens on a press, as a
   dropdown panel on the surface step, rounded 24 with 6px padding, laid over what is under
   it. The trigger is a 48px pill whose chevron sits in a 24px slot 12px from the right edge,
   mirroring the 24px mark 12px from the left (his note on the arrow padding). The chosen row
   is the selected pill on the control material, rounded 18 inside the 24 panel at a 6px gap
   (his note on its roundness), and carries the tick where the others show their balance,
   so the balance in use is printed once, in the trigger. The marks are ink: a wallet's real
   mark comes in through `renderIcon`, the address pattern is the fallback. The readout line
   under the list and its rule are gone; the share of the pointed account shows under its
   own balance instead. */

const EASE = [0.16, 1, 0.3, 1] as const

export interface Account {
  label: string
  /** short form of the address, as it should be read */
  address: string
  /** in the display currency */
  balance: number
  /** the wallet that holds it (MetaMask, Ledger…), handed to `renderIcon` for its mark */
  wallet?: string
}

export interface AccountDropdownProps {
  accounts?: Account[]
  /** index of the account in use at the start */
  defaultActive?: number
  /** start with the list open; closed by default (popups open on a real action) */
  defaultOpen?: boolean
  onSelect?: (account: Account) => void
  /** the wallet's real mark for an account (its `wallet`, else its address); return null to
   *  fall back to the ink pattern worked from the address */
  renderIcon?: (symbol: string, size: number) => ReactNode
  className?: string
}

const DEFAULT_ACCOUNTS: Account[] = [
  { label: "Account 0", address: "0x8f3C…9aD1", balance: 41205.12, wallet: "MetaMask" },
  { label: "Account 1", address: "0x44Ba…E77f", balance: 6918.45, wallet: "MetaMask" },
  { label: "Ledger · BTC", address: "bc1qxy…0wlh", balance: 90.0, wallet: "Ledger" },
]

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** three columns of five cells from the address, mirrored about the middle column, in ink */
function Identicon({ seed, size = 24 }: { seed: string; size?: number }) {
  let s = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7) || 1
  const cells: { x: number; y: number }[] = []
  for (let i = 0; i < 15; i++) {
    s = (s * 16807) % 2147483647
    if (s / 2147483647 < 0.5) continue
    const col = i % 3
    const row = Math.floor(i / 3)
    cells.push({ x: col, y: row })
    if (col < 2) cells.push({ x: 4 - col, y: row })
  }
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-foreground/[0.10]" style={{ width: size, height: size }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 5 5">
        {cells.map((c) => (
          <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} fill="var(--foreground)" fillOpacity={0.7} />
        ))}
      </svg>
    </span>
  )
}

/**
 * The account switcher: a pill naming the account in use with its balance; a press opens
 * every account in a panel under it. Pointing at one steps the rest back and shows its
 * share; pressing it switches.
 */
export function AccountDropdown({
  accounts = DEFAULT_ACCOUNTS,
  defaultActive = 0,
  defaultOpen = false,
  onSelect,
  renderIcon,
  className,
}: AccountDropdownProps) {
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(defaultOpen)
  const [active, setActive] = useState(defaultActive)
  const [hot, setHot] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const current = accounts[active] ?? accounts[0]
  const total = accounts.reduce((s, a) => s + a.balance, 0)

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("keydown", key)
    window.addEventListener("pointerdown", down)
    return () => {
      window.removeEventListener("keydown", key)
      window.removeEventListener("pointerdown", down)
    }
  }, [open])

  if (!current) return null

  const mark = (a: Account, size: number) => renderIcon?.(a.wallet ?? a.address, size) ?? <Identicon seed={a.address} size={size} />

  return (
    <div ref={root} className={cn("relative w-[300px] max-w-full tabular-nums", className)}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${current.label}, ${current.address}, ${money(current.balance)}`}
        onClick={() => setOpen((o) => !o)}
        /* a 48px control is fully round; the 24px mark and the 24px chevron slot both sit 12px in */
        className={cn(
          "relative flex h-12 w-full items-center gap-2.5 rounded-full px-3 text-left outline-none transition-[scale] duration-150 active:scale-[0.98] motion-reduce:active:scale-100",
          SURFACE,
          "after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:transition-colors after:duration-150 hover:after:bg-foreground/[0.04] focus-visible:after:bg-foreground/[0.06]",
        )}
      >
        {mark(current, 24)}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium leading-tight text-foreground/90">{current.label}</span>
          <span className="text-[10.5px] text-foreground/60">{current.address}</span>
        </span>
        <span className="ml-auto text-[12.5px] font-medium text-foreground/90">{money(current.balance)}</span>
        <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center text-foreground/60">
          <motion.svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <path d="m6 9 6 6 6-6" />
          </motion.svg>
        </span>
      </button>

      {/* the panel: the surface step, 24 round with 6px inside, so the 18px rows nest
          (24 = 18 + 6); it drops 4px into place in 200ms, and leaves in 120ms */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: reduced ? 0 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: EASE }}
            className={cn("absolute inset-x-0 top-full z-50 mt-1.5 rounded-[24px] p-1.5", SURFACE)}
          >
            <div role="listbox" aria-label="Accounts" className="flex flex-col gap-0.5" onPointerLeave={() => setHot(null)}>
              {accounts.map((a, i) => {
                const on = i === active
                const share = total > 0 ? ((a.balance / total) * 100).toFixed(1) : "0.0"
                return (
                  <button
                    key={a.address}
                    type="button"
                    role="option"
                    aria-selected={on}
                    aria-label={`${a.label}, ${a.address}, ${money(a.balance)}, ${share}% of ${money(total)}`}
                    onClick={() => {
                      setActive(i)
                      setOpen(false)
                      onSelect?.(a)
                      trigger.current?.focus()
                    }}
                    onPointerEnter={() => setHot(i)}
                    onFocus={() => setHot(i)}
                    onBlur={() => setHot(null)}
                    className={cn(
                      "flex h-12 items-center gap-2.5 rounded-[18px] px-3 text-left outline-none transition-[opacity,background-color,scale] duration-150 active:scale-[0.98] motion-reduce:active:scale-100",
                      on ? THUMB : "hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06]",
                      hot !== null && hot !== i && "opacity-45",
                    )}
                  >
                    {mark(a, 24)}
                    <span className="flex min-w-0 flex-col">
                      <span className={cn("truncate text-[12.5px] leading-tight text-foreground/90", on && "font-medium")}>{a.label}</span>
                      <span className="text-[10.5px] text-foreground/60">{a.address}</span>
                    </span>
                    {on ? (
                      <span aria-hidden className="ml-auto grid h-6 w-6 shrink-0 place-items-center text-foreground/90">
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          {/* the check strokes in on the account in use (transitions.dev checkbox) */}
                          <motion.path
                            d="m5 12.5 4.5 4.5L19 7.5"
                            initial={reduced ? false : { pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={reduced ? { duration: 0 } : { duration: 0.25, ease: EASE, delay: 0.08 }}
                          />
                        </svg>
                      </span>
                    ) : (
                      <span className="ml-auto flex flex-col items-end">
                        <span className="text-[11.5px] leading-tight text-foreground/70">{money(a.balance)}</span>
                        {/* the share of the pointed account, under its own balance; the line keeps its height */}
                        <span
                          aria-hidden
                          className="text-[10.5px] text-foreground/60 transition-opacity duration-150"
                          style={{ opacity: hot === i ? 1 : 0 }}
                        >
                          {share}%
                        </span>
                      </span>
                    )}
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
