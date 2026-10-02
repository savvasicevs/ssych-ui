"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

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
   · share         balance ÷ in all × 100, read out for the account being pointed at
   · mark          a 5 by 5 mirrored pattern seeded from the characters of the address */

const EASE = [0.16, 1, 0.3, 1] as const
const SMOOTH = "cubic-bezier(0.22, 1, 0.36, 1)"

/* each account's mark takes its own hue so accounts are told apart at a glance (colour
   pass, 2026-09-30), in the house categorical order; past six they share one "other" ink */
const HUES = ["var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-amber)", "var(--chart-2)", "var(--chart-4)"]
const OTHER = "color-mix(in srgb, var(--foreground) 22%, transparent)"
const hueAt = (i: number) => HUES[i] ?? OTHER
export interface Account {
  label: string
  /** short form of the address, as it should be read */
  address: string
  /** in the display currency */
  balance: number
}

export interface AccountDropdownProps {
  accounts?: Account[]
  /** index of the account in use at the start */
  defaultActive?: number
  defaultOpen?: boolean
  onSelect?: (account: Account) => void
  className?: string
}

const DEFAULT_ACCOUNTS: Account[] = [
  { label: "Account 0", address: "0x8f3C…9aD1", balance: 41205.12 },
  { label: "Account 1", address: "0x44Ba…E77f", balance: 6918.45 },
  { label: "Ledger · BTC", address: "bc1qxy…0wlh", balance: 90.0 },
]

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** three columns of five cells from the address, mirrored about the middle column */
function Identicon({ seed, size = 24, hue = OTHER }: { seed: string; size?: number; hue?: string }) {
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
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${hue} 18%, transparent)` }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 5 5">
        {cells.map((c) => (
          <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} fill={hue === OTHER ? "var(--foreground)" : hue} fillOpacity={hue === OTHER ? 0.7 : 1} />
        ))}
      </svg>
    </span>
  )
}

/**
 * The account switcher, open and in flow: the account in use on top, every account with
 * its balance under it. Pointing at one steps the rest back; pressing it switches.
 */
export function AccountDropdown({
  accounts = DEFAULT_ACCOUNTS,
  defaultActive = 0,
  defaultOpen = true,
  onSelect,
  className,
}: AccountDropdownProps) {
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(defaultOpen)
  const [active, setActive] = useState(defaultActive)
  const [hot, setHot] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const current = accounts[active] ?? accounts[0]
  const currentIdx = accounts[active] ? active : 0
  const total = accounts.reduce((s, a) => s + a.balance, 0)
  const shown = hot === null ? null : accounts[hot]

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
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

  return (
    <div ref={root} className={cn("w-[300px] max-w-full tabular-nums", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${current.label}, ${current.address}, ${money(current.balance)}`}
        onClick={() => setOpen((o) => !o)}
        /* 12 (the 24px round mark) + 12 side padding = 24 */
        className="flex w-full items-center gap-2.5 rounded-[24px] bg-foreground/[0.04] px-3 py-2.5 text-left outline-none transition-[background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.07] focus-visible:bg-foreground/[0.07] active:scale-[0.98]"
      >
        <Identicon seed={current.address} hue={hueAt(currentIdx)} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium leading-tight text-foreground/90">{current.label}</span>
          <span className="text-[10.5px] text-foreground/45">{current.address}</span>
        </span>
        <span className="ml-auto text-[12px] font-semibold text-foreground/90">{money(current.balance)}</span>
        <motion.svg
          aria-hidden
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-foreground/45"
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <path d="m6 9 6 6 6-6" />
        </motion.svg>
      </button>

      {/* the list unfolds in flow on grid rows 0fr → 1fr (transitions.dev accordion), 250ms both
          ways with the chevron; reduced motion opens it at once and keeps the fade */}
      <div
        aria-hidden={!open}
        inert={!open}
        className="grid"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transition: reduced ? "opacity 150ms ease-out" : `grid-template-rows 250ms ${SMOOTH}, opacity 250ms ${SMOOTH}`,
        }}
      >
          <div className="min-h-0 overflow-hidden">
            <div role="listbox" aria-label="Accounts" className="flex flex-col pt-1" onPointerLeave={() => setHot(null)}>
              {accounts.map((a, i) => {
                const on = i === active
                return (
                  <button
                    key={a.address}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      setActive(i)
                      setOpen(false)
                      onSelect?.(a)
                    }}
                    onPointerEnter={() => setHot(i)}
                    onFocus={() => setHot(i)}
                    onBlur={() => setHot(null)}
                    /* 11 (the 22px round mark) + 12 side padding = 23 */
                    className={cn(
                      "flex items-center gap-2.5 rounded-[23px] px-3 py-2 text-left outline-none transition-[opacity,background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] active:scale-[0.98]",
                      hot !== null && hot !== i && "opacity-45",
                    )}
                  >
                    <Identicon seed={a.address} size={22} hue={hueAt(i)} />
                    <span className="flex min-w-0 flex-col">
                      <span className={cn("truncate text-[12px] leading-tight text-foreground/90", on && "font-medium")}>{a.label}</span>
                      <span className="text-[10px] text-foreground/45">{a.address}</span>
                    </span>
                    <span className="ml-auto text-[11.5px] text-foreground/70">{money(a.balance)}</span>
                    <svg
                      aria-hidden
                      width={12}
                      height={12}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 text-foreground/90"
                    >
                      {/* the check strokes in on the account just chosen (transitions.dev checkbox) */}
                      <motion.path
                        d="m5 12.5 4.5 4.5L19 7.5"
                        initial={false}
                        animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
                        transition={reduced ? { duration: 0 } : { duration: 0.25, ease: EASE, delay: on ? 0.08 : 0 }}
                      />
                    </svg>
                  </button>
                )
              })}
            </div>
            <div role="status" className="mt-1 border-t border-foreground/[0.05] px-3 pt-2 text-[10.5px] text-foreground/45">
              {/* the readout swaps in place as the pointer moves (text swap: 4px, 2px blur, 150ms),
                  from a dimmed copy so it never blinks out; reduced motion keeps the fade */}
              <motion.span
                key={hot ?? "all"}
                className="inline-block"
                initial={reduced ? { opacity: 0.4 } : { opacity: 0.4, y: 4, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.15, ease: EASE }}
              >
                {shown
                  ? `${shown.label} · ${total > 0 ? ((shown.balance / total) * 100).toFixed(1) : "0.0"}% of ${money(total)}`
                  : `${accounts.length} accounts · ${money(total)} in all`}
              </motion.span>
            </div>
          </div>
      </div>
    </div>
  )
}
