"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Wallet Drawer, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: the whole wallet in one column: what it holds and is worth, where that
   sits, what is being watched, what is staked, what moved, and the ways to send, receive
   and set it up.
   Read first: the total, the one large figure.
   The pointer: the five pills slide a fill to the chosen list; pointing at a row steps the
   others back and the line under the list works that row out; Send, Receive and the two
   header buttons open their own view, and the arrow leads back. In Send the white button
   says what is still missing or what it will send.
   Shown open and in flow: no overlay, no backdrop, no fixed height.
   Sketch used: src/components/lab/WalletDrawerPro.tsx. Kept: the header with its two
   shortcuts, the total, the three actions, five lists behind pills, and the Send, Receive
   and Settings views. Changed: no outlined shell or tiles, the pills carry words (they were
   icons that grew a word when chosen), coin marks keep their own colour (Token Icon; two
   letters on ink where no mark is on file, and for the wallet itself), the switches and
   the send button are ink and white (they were green), yields
   are ink because a rate is not a direction, the address pattern is drawn in ink, the
   header button that did nothing is gone.
   Sample data fixed: the sketch printed the total of a sixteen-asset book over a list of
   five, so the total is now the sum of the rows shown; its Accounts list showed grey
   blocks in place of values and now carries each network's value; event values are
   amount × price.
   Shipped alone: a coin's mark is a disc in its own colour with white letters; pass
   `renderIcon` to draw the real marks instead. The wallet itself stays two letters on ink.
   2026-09-30: the copied address answers with a green check and a green "Copied" (a done
   state); a view change slides 8px through a 2px blur; the readout under the list swaps in
   place; every button sinks 0.97 on press.
   2026-10-01: the "Your <network> address" caption in Receive is gone; the line under the
   address already names the network.
   Formulas:
   · value          quantity × price
   · total          Σ value of the holdings
   · share          value ÷ total × 100
   · network value  Σ value of the holdings on that network
   · staked         Σ value of the positions; average yield Σ(value × yield) ÷ Σ value
   · net moved      Σ received − Σ sent (a swap moves nothing in or out)
   · send, worth    amount × price of the chosen asset
   · can be sent    0 < amount ≤ quantity held, and an address is typed */

const EASE = [0.16, 1, 0.3, 1] as const
const TAB_EASE = [0.22, 1, 0.36, 1] as const
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
const PRESS = "transition-[color,background-color,scale] duration-150 active:scale-[0.97] motion-reduce:active:scale-100"
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

export interface WalletHolding {
  name: string
  symbol: string
  /** the network the asset sits on */
  network: string
  quantity: number
  price: number
}

export interface WalletWatch {
  name: string
  symbol: string
  price: number
  /** percent over 24 hours */
  change: number
}

export interface WalletStake {
  name: string
  protocol: string
  symbol: string
  value: number
  /** yearly yield in percent */
  yield: number
}

export interface WalletEvent {
  kind: "Received" | "Sent" | "Swapped"
  symbol: string
  detail: string
  time: string
  /** in the display currency, unsigned; the kind gives the sign */
  value: number
}

export type WalletTab = "crypto" | "accounts" | "watchlist" | "defi" | "activity"
export type WalletView = "home" | "send" | "receive" | "settings"

export interface WalletDrawerProps {
  name?: string
  address?: string
  /** the network the receive address belongs to */
  network?: string
  holdings?: WalletHolding[]
  watchlist?: WalletWatch[]
  stakes?: WalletStake[]
  activity?: WalletEvent[]
  defaultTab?: WalletTab
  defaultView?: WalletView
  onSend?: (order: { symbol: string; amount: number; to: string }) => void
  onChat?: () => void
  /** draws a coin's mark in place of the coin-coloured disc */
  renderIcon?: (symbol: string, size: number) => ReactNode
  className?: string
}

const DEFAULT_HOLDINGS: WalletHolding[] = [
  { name: "Bitcoin", symbol: "BTC", network: "Bitcoin", quantity: 0.42, price: 64619 },
  { name: "Ethereum", symbol: "ETH", network: "Ethereum", quantity: 4.1, price: 3050 },
  { name: "Solana", symbol: "SOL", network: "Solana", quantity: 28, price: 148 },
  { name: "BNB", symbol: "BNB", network: "BNB Chain", quantity: 3.7, price: 578 },
  { name: "USD Coin", symbol: "USDC", network: "Ethereum", quantity: 1500, price: 1 },
]

const DEFAULT_WATCHLIST: WalletWatch[] = [
  { name: "Dogecoin", symbol: "DOGE", price: 0.128, change: 4.2 },
  { name: "Chainlink", symbol: "LINK", price: 14.6, change: -1.8 },
  { name: "Avalanche", symbol: "AVAX", price: 26.4, change: 2.1 },
  { name: "Polygon", symbol: "POL", price: 0.42, change: -0.6 },
  { name: "Litecoin", symbol: "LTC", price: 71.8, change: 3.4 },
]

const DEFAULT_STAKES: WalletStake[] = [
  { name: "ETH · stETH", protocol: "Lido staking", symbol: "ETH", value: 6405, yield: 3.1 },
  { name: "SOL", protocol: "Marinade staking", symbol: "SOL", value: 2072, yield: 6.2 },
  { name: "USDC", protocol: "Aave v3 supply", symbol: "USDC", value: 1500, yield: 4.8 },
  { name: "ETH / USDC", protocol: "Uniswap v3 pool", symbol: "ETH", value: 980, yield: 11.4 },
]

const DEFAULT_ACTIVITY: WalletEvent[] = [
  { kind: "Received", symbol: "BTC", detail: "0.012 BTC from 0x91aC…44e0", time: "2h ago", value: 775.43 },
  { kind: "Swapped", symbol: "ETH", detail: "520 USDC to 0.17 ETH", time: "9h ago", value: 518.5 },
  { kind: "Sent", symbol: "SOL", detail: "4 SOL to 0x3bD1…07c2", time: "Yesterday", value: 592 },
  { kind: "Received", symbol: "USDC", detail: "250 USDC from 0xa804…1f9b", time: "Mon", value: 250 },
  { kind: "Sent", symbol: "ETH", detail: "0.4 ETH to 0x52fE…c81d", time: "Sun", value: 1220 },
]

const TABS: { key: WalletTab; label: string }[] = [
  { key: "crypto", label: "Crypto" },
  { key: "accounts", label: "Accounts" },
  { key: "watchlist", label: "Watchlist" },
  { key: "defi", label: "DeFi" },
  { key: "activity", label: "Activity" },
]

const usd = (n: number, dp = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
const amountOf = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 })
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`

const GLYPHS = {
  back: "M19 12H5M11 6l-6 6 6 6",
  code: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5z",
  setup: "M4 7h9M19 7h1M4 17h1M11 17h9M16 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  copy: "M9 9h11v11H9zM5 15V5h10",
  check: "m5 12.5 4.5 4.5L19 7.5",
  next: "m9 6 6 6-6 6",
} as const

function Glyph({ name, size = 14 }: { name: keyof typeof GLYPHS; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={GLYPHS[name]} />
    </svg>
  )
}

/** coin discs by symbol; the hex is only the fallback of the custom property */
const COIN: Record<string, string> = {
  BTC: "var(--coin-btc, #f7931a)",
  ETH: "var(--coin-eth, #627eea)",
  SOL: "var(--coin-sol, #9945ff)",
  BNB: "var(--coin-bnb, #f3ba2f)",
  USDC: "var(--coin-usdc, #2775ca)",
  USDT: "var(--coin-usdt, #26a17b)",
  DOGE: "var(--coin-doge, #c2a633)",
  LINK: "var(--coin-link, #2a5ada)",
  AVAX: "var(--coin-avax, #e84142)",
  POL: "var(--coin-pol, #8247e5)",
  LTC: "var(--coin-ltc, #345d9d)",
}

type RenderIcon = (symbol: string, size: number) => ReactNode

/** a coin's mark: the caller's drawing, the coin disc, or two letters on ink (always ink for the wallet itself) */
function Mark({ text, size = 26, plain = false, renderIcon }: { text: string; size?: number; plain?: boolean; renderIcon?: RenderIcon }) {
  if (!plain && renderIcon) return <span className="inline-flex shrink-0">{renderIcon(text, size)}</span>
  const disc = plain ? undefined : COIN[text.toUpperCase()]
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full text-[8.5px] font-semibold", !disc && "bg-foreground/[0.07] text-foreground/70")}
      // oxlint-disable-next-line shadcn/no-raw-colors -- the glyph on a coin disc is white in both themes
      style={{ width: size, height: size, background: disc, color: disc ? "white" : undefined }}
    >
      {text.slice(0, 2)}
    </span>
  )
}

/** A sample pattern in the shape of a code, seeded, with the three corner marks. It cannot be scanned. */
function AddressPattern({ label }: { label: string }) {
  const N = 21
  const cells: boolean[] = []
  let seed = 40125
  for (let i = 0; i < N * N; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    cells.push(seed / 2147483648 > 0.52)
  }
  const zones: [number, number][] = [
    [0, 0],
    [0, N - 7],
    [N - 7, 0],
  ]
  const zoneOf = (r: number, c: number) => zones.find(([zr, zc]) => r >= zr - 1 && r <= zr + 7 && c >= zc - 1 && c <= zc + 7)
  const corner = (r: number, c: number) => {
    const z = zones.find(([zr, zc]) => r >= zr && r <= zr + 6 && c >= zc && c <= zc + 6)
    if (!z) return false
    const rr = r - z[0]
    const cc = c - z[1]
    return rr === 0 || rr === 6 || cc === 0 || cc === 6 || (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4)
  }
  return (
    <svg viewBox={`0 0 ${N} ${N}`} width={148} height={148} role="img" aria-label={label} className="block">
      {cells.map((on, i) => {
        const r = Math.floor(i / N)
        const c = i % N
        const lit = corner(r, c) || (!zoneOf(r, c) && on)
        return lit ? <rect key={i} x={c} y={r} width={0.9} height={0.9} fill="var(--foreground)" fillOpacity={0.9} /> : null
      })}
    </svg>
  )
}

type Row = { key: string; mark: string; title: string; sub: string; right: string; rightSub?: string; hue?: string; subHue?: string; read: string }

/**
 * The wallet as one column: total, three actions, five lists behind pills, and the send,
 * receive and settings views. Pointing at a row works it out in the line under the list.
 */
export function WalletDrawer({
  name = "Demo wallet",
  address = "0x7c2E…9f4A",
  network = "Ethereum",
  holdings = DEFAULT_HOLDINGS,
  watchlist = DEFAULT_WATCHLIST,
  stakes = DEFAULT_STAKES,
  activity = DEFAULT_ACTIVITY,
  defaultTab = "crypto",
  defaultView = "home",
  onSend,
  onChat,
  renderIcon,
  className,
}: WalletDrawerProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const [tab, setTab] = useState<WalletTab>(defaultTab)
  const [view, setView] = useState<WalletView>(defaultView)
  const [hot, setHot] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [asset, setAsset] = useState(holdings[0]?.symbol ?? "")
  const [to, setTo] = useState("")
  const [amountStr, setAmountStr] = useState("")
  const [prefs, setPrefs] = useState({ hide: false, testnets: false, alerts: true })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const valued = holdings.map((h) => ({ ...h, value: h.quantity * h.price }))
  const total = valued.reduce((s, h) => s + h.value, 0)
  const share = (v: number) => (total > 0 ? (v / total) * 100 : 0)
  const shown = (text: string) => (prefs.hide ? "••••" : text)

  /** set once a view has been changed by hand, so the first paint does not slide */
  const [moved, setMoved] = useState(false)
  const go = (v: WalletView) => {
    setMoved(true)
    setView(v)
    setHot(null)
  }
  /* a view slides in 8px from the side it lies on (a sub-view from the right, home from the
     left) through a 2px blur, 250ms; reduced motion keeps the fade */
  const slide = {
    initial: !moved ? false : reduced ? { opacity: 0 } : { opacity: 0, x: view === "home" ? -8 : 8, filter: "blur(2px)" },
    animate: { opacity: 1, x: 0, filter: "blur(0px)" },
    transition: { duration: 0.25, ease: TAB_EASE },
  } as const

  const root = cn("w-[360px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)

  const header = (title: string) => (
    <div className="mb-4 flex items-center gap-2">
      <button
        type="button"
        aria-label="Back to the wallet"
        onClick={() => go("home")}
        className="-ml-1.5 grid h-7 w-7 place-items-center rounded-full text-foreground/45 outline-none transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:bg-foreground/[0.06] focus-visible:text-foreground/90"
      >
        <Glyph name="back" />
      </button>
      <span className="text-[13px] font-medium text-foreground/90">{title}</span>
    </div>
  )

  if (view === "send") {
    const picked = valued.find((h) => h.symbol === asset) ?? valued[0]
    const amount = parseFloat(amountStr) || 0
    const state = !picked ? "asset" : to.trim().length === 0 ? "address" : amount <= 0 ? "amount" : amount > picked.quantity ? "short" : "ready"
    const verdict =
      state === "asset"
        ? "Nothing to send"
        : state === "address"
          ? "Enter an address"
          : state === "amount"
            ? "Enter an amount"
            : state === "short"
              ? `More than the ${picked.symbol} held`
              : `Send ${amountOf(amount)} ${picked.symbol}`
    return (
      <motion.div key="send" {...slide} className={root} role="group" aria-label={`Send from ${name}, ${verdict}`}>
        {header("Send")}
        <div className="px-1 pb-1 text-[10.5px] text-foreground/45">Asset</div>
        <div role="radiogroup" aria-label="Asset to send" className="flex flex-col">
          {valued.slice(0, 3).map((h) => {
            const on = h.symbol === picked?.symbol
            return (
              <button
                key={h.symbol}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setAsset(h.symbol)}
                /* 13 (the 26px coin mark) + 8 padding = 21 */
                className={cn(
                  "flex items-center gap-2.5 rounded-[21px] px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.06]",
                  on && "bg-foreground/[0.06]",
                )}
              >
                <Mark text={h.symbol} renderIcon={renderIcon} />
                <span className="text-[12px] font-medium text-foreground/90">{h.name}</span>
                <span className="ml-auto text-[11px] text-foreground/45">
                  {amountOf(h.quantity)} {h.symbol}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <label className="flex h-10 items-center gap-2 rounded-lg bg-foreground/[0.04] px-3 transition-colors duration-150 focus-within:bg-foreground/[0.07]">
            <span className="shrink-0 text-[11px] text-foreground/45">To</span>
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Address or name"
              aria-label="Address to send to"
              className="min-w-0 flex-1 bg-transparent text-right text-[12px] text-foreground/90 caret-foreground outline-none placeholder:text-foreground/35"
            />
          </label>
          <label className="flex h-10 items-center gap-2 rounded-lg bg-foreground/[0.04] px-3 transition-colors duration-150 focus-within:bg-foreground/[0.07]">
            <span className="shrink-0 text-[11px] text-foreground/45">Amount</span>
            <input
              value={amountStr}
              onChange={(e) => {
                if (/^\d*\.?\d{0,6}$/.test(e.target.value)) setAmountStr(e.target.value)
              }}
              placeholder="0"
              inputMode="decimal"
              aria-label={`Amount in ${picked?.symbol ?? "units"}`}
              className="min-w-0 flex-1 bg-transparent text-right text-[13px] font-semibold text-foreground/90 caret-foreground outline-none placeholder:text-foreground/35"
            />
            <span className="w-9 shrink-0 text-[11px] text-foreground/45">{picked?.symbol}</span>
          </label>
        </div>
        <div role="status" className="mt-3 flex items-baseline justify-between px-1 text-[11px]">
          <span className="text-foreground/45">Worth</span>
          <span className="text-foreground/90">{usd(amount * (picked?.price ?? 0))}</span>
        </div>
        <motion.button
          type="button"
          disabled={state !== "ready"}
          onClick={() => picked && onSend?.({ symbol: picked.symbol, amount, to: to.trim() })}
          whileTap={state === "ready" && !reduced ? { scale: 0.97 } : undefined}
          transition={reduced ? { duration: 0 } : LIFT_SPRING}
          className="mt-4 h-11 w-full rounded-full bg-foreground/[0.92] text-[13px] font-semibold text-background outline-none transition-[background-color,opacity] duration-200 enabled:cursor-pointer enabled:hover:bg-foreground enabled:focus-visible:bg-foreground disabled:cursor-not-allowed disabled:opacity-35"
        >
          {verdict}
        </motion.button>
      </motion.div>
    )
  }

  if (view === "receive") {
    return (
      <motion.div key="receive" {...slide} className={root} role="group" aria-label={`Receive to ${name}, ${address}`}>
        {header("Receive")}
        <div className="flex flex-col items-center gap-3 py-2">
          <span className="rounded-lg bg-foreground/[0.04] p-3">
            <AddressPattern label={`Sample pattern standing for the address ${address}`} />
          </span>
          <button
            type="button"
            aria-label={`Copy the address ${address}`}
            onClick={() => {
              if (typeof navigator !== "undefined") void navigator.clipboard?.writeText(address)?.catch(() => {})
              setCopied(true)
              if (timer.current) clearTimeout(timer.current)
              timer.current = setTimeout(() => setCopied(false), 1400)
            }}
            className={cn("flex h-8 items-center gap-2 rounded-full bg-foreground/[0.06] px-3.5 text-[12px] font-medium text-foreground/90 outline-none hover:bg-foreground/[0.1] focus-visible:bg-foreground/[0.1]", PRESS)}
          >
            {address}
            {/* copy and check swap in one slot through a blur; the check is a done state, so green */}
            <motion.span
              key={copied ? "check" : "copy"}
              className={copied ? undefined : "text-foreground/45"}
              style={copied ? { color: ink(GREEN) } : undefined}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, filter: "blur(2px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.25, ease: TAB_EASE }}
            >
              <Glyph name={copied ? "check" : "copy"} size={13} />
            </motion.span>
          </button>
          <span role="status" className="h-4 text-[10.5px] text-foreground/45">
            <motion.span
              key={copied ? "copied" : "rest"}
              className="inline-block"
              style={copied ? { color: ink(GREEN) } : undefined}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.15, ease: EASE }}
            >
              {copied ? "Copied" : `${network} network only`}
            </motion.span>
          </span>
        </div>
      </motion.div>
    )
  }

  if (view === "settings") {
    const switches: { key: keyof typeof prefs; label: string }[] = [
      { key: "hide", label: "Hide balances" },
      { key: "testnets", label: "Show testnets" },
      { key: "alerts", label: "Price alerts" },
    ]
    const links = [
      { label: "Currency", value: "USD" },
      { label: "Language", value: "English" },
      { label: "Connected apps", value: "3" },
    ]
    return (
      <motion.div key="settings" {...slide} className={root} role="group" aria-label={`Settings of ${name}`}>
        {header("Settings")}
        <div className="flex flex-col">
          {switches.map((s) => (
            <button
              key={s.key}
              type="button"
              role="switch"
              aria-checked={prefs[s.key]}
              onClick={() => setPrefs((p) => ({ ...p, [s.key]: !p[s.key] }))}
              /* 9 (the 18px switch track) + 8 side padding = 17 */
              className="flex items-center justify-between rounded-[17px] px-2 py-2.5 outline-none transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06]"
            >
              <span className="text-[12px] font-medium text-foreground/90">{s.label}</span>
              {/* the knob travels 14px inside a 32px track: 3 + 12 + 14 + 3 */}
              <span
                aria-hidden
                className="relative block h-[18px] w-8 shrink-0 rounded-full transition-colors duration-200"
                style={{ background: `color-mix(in srgb, var(--foreground) ${prefs[s.key] ? 90 : 14}%, transparent)` }}
              >
                <span
                  className={cn("absolute left-[3px] top-[3px] block h-3 w-3 rounded-full transition-[transform,translate,scale,rotate,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-colors", prefs[s.key] ? "bg-background" : "bg-foreground/70")}
                  style={{ transform: prefs[s.key] ? "translateX(14px)" : "translateX(0)" }}
                />
              </span>
            </button>
          ))}
          {links.map((l) => (
            <button
              key={l.label}
              type="button"
              className="flex items-center gap-2 rounded-lg border-t border-foreground/[0.05] px-2 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06]"
            >
              <span className="text-[12px] font-medium text-foreground/90">{l.label}</span>
              <span className="ml-auto text-[11px] text-foreground/45">{l.value}</span>
              <span className="text-foreground/35">
                <Glyph name="next" size={12} />
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    )
  }

  /* one row shape for all five lists, so they read as one instrument */
  const networks = [...new Set(valued.map((h) => h.network))].map((n) => {
    const on = valued.filter((h) => h.network === n)
    return { name: n, value: on.reduce((s, h) => s + h.value, 0), symbols: on.map((h) => h.symbol) }
  })
  const staked = stakes.reduce((s, p) => s + p.value, 0)
  const meanYield = staked > 0 ? stakes.reduce((s, p) => s + p.value * p.yield, 0) / staked : 0
  const net = activity.reduce((s, e) => s + (e.kind === "Received" ? e.value : e.kind === "Sent" ? -e.value : 0), 0)

  const lists: Record<WalletTab, { rows: Row[]; rest: string }> = {
    crypto: {
      rows: valued.map((h) => ({
        key: h.symbol,
        mark: h.symbol,
        title: h.name,
        sub: `${amountOf(h.quantity)} ${h.symbol}`,
        right: shown(usd(h.value)),
        rightSub: `${share(h.value).toFixed(1)}%`,
        read: `${h.symbol} · ${amountOf(h.quantity)} × ${usd(h.price)} = ${shown(usd(h.value))}`,
      })),
      rest: `${valued.length} assets · ${shown(usd(total))} in all`,
    },
    accounts: {
      rows: networks.map((n) => ({
        key: n.name,
        mark: n.symbols[0] ?? n.name,
        title: n.name,
        sub: n.symbols.join(", "),
        right: shown(usd(n.value)),
        rightSub: `${share(n.value).toFixed(1)}%`,
        read: `${n.name} · ${n.symbols.join(" + ")} = ${shown(usd(n.value))}`,
      })),
      rest: `${networks.length} networks · ${shown(usd(total))} in all`,
    },
    watchlist: {
      rows: watchlist.map((w) => ({
        key: w.symbol,
        mark: w.symbol,
        title: w.name,
        sub: w.symbol,
        right: usd(w.price, w.price < 1 ? 3 : 2),
        rightSub: signedPct(w.change),
        subHue: w.change >= 0 ? GREEN : RED,
        read: `${w.symbol} · ${usd(w.price, w.price < 1 ? 3 : 2)} · ${signedPct(w.change)} in 24h`,
      })),
      rest: `${watchlist.length} markets · ${watchlist.filter((w) => w.change >= 0).length} up, ${watchlist.filter((w) => w.change < 0).length} down`,
    },
    defi: {
      rows: stakes.map((p) => ({
        key: p.protocol,
        mark: p.symbol,
        title: p.name,
        sub: p.protocol,
        right: shown(usd(p.value)),
        rightSub: `${p.yield.toFixed(1)}% a year`,
        read: `${p.protocol} · ${shown(usd((p.value * p.yield) / 100))} a year at ${p.yield.toFixed(1)}%`,
      })),
      rest: `${stakes.length} positions · ${shown(usd(staked))} · ${meanYield.toFixed(2)}% on average`,
    },
    activity: {
      rows: activity.map((e, i) => ({
        key: `${e.kind}-${i}`,
        mark: e.symbol,
        title: e.kind,
        sub: e.detail,
        right: `${e.kind === "Received" ? "+" : e.kind === "Sent" ? "−" : ""}${shown(usd(e.value))}`,
        rightSub: e.time,
        hue: e.kind === "Received" ? GREEN : e.kind === "Sent" ? RED : undefined,
        read: `${e.kind} · ${e.detail} · ${e.time}`,
      })),
      rest: `${activity.length} transfers · net ${net >= 0 ? "+" : "−"}${shown(usd(Math.abs(net)))}`,
    },
  }
  const list = lists[tab]
  const pointed = list.rows.find((r) => r.key === hot)

  const action = (label: string, onClick?: () => void): ReactNode => (
    <button
      type="button"
      onClick={onClick}
      className={cn("h-9 flex-1 rounded-full bg-foreground/[0.06] text-[12px] font-medium text-foreground/90 outline-none hover:bg-foreground/[0.1] focus-visible:bg-foreground/[0.1]", PRESS)}
    >
      {label}
    </button>
  )

  return (
    <motion.div key="home" {...slide} className={root} role="group" aria-label={`${name}, ${prefs.hide ? "balance hidden" : usd(total)}`}>
      <div className="flex items-center gap-2.5">
        <Mark text={name} size={30} plain />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium leading-tight text-foreground/90">{name}</span>
          <span className="text-[10.5px] text-foreground/45">{address}</span>
        </span>
        <span className="-mr-1.5 ml-auto flex items-center">
          {(
            [
              ["code", "Show the receive address", "receive"],
              ["setup", "Settings", "settings"],
            ] as const
          ).map(([glyph, label, target]) => (
            <button
              key={target}
              type="button"
              aria-label={label}
              onClick={() => go(target)}
              className="grid h-7 w-7 place-items-center rounded-full text-foreground/45 outline-none transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 focus-visible:bg-foreground/[0.06] focus-visible:text-foreground/90"
            >
              <Glyph name={glyph} />
            </button>
          ))}
        </span>
      </div>

      <div className="mt-5 text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">{shown(usd(total))}</div>

      <div className="mt-4 flex gap-1.5">
        {action("Send", () => go("send"))}
        {action("Receive", () => go("receive"))}
        {action("AI chat", onChat)}
      </div>

      <div role="tablist" aria-label="Wallet lists" className="mt-4 grid grid-cols-5">
        {TABS.map((t) => {
          const on = t.key === tab
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setTab(t.key)
                setHot(null)
              }}
              className={cn(
                "relative h-7 rounded-full text-[11px] font-medium outline-none transition-[color,scale] duration-200 active:scale-[0.97] motion-reduce:active:scale-100",
                on ? "text-foreground/90" : "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90",
              )}
            >
              {on &&
                (reduced ? (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.08]" />
                ) : (
                  <motion.span aria-hidden layoutId={`${uid}-tab`} className="absolute inset-0 rounded-full bg-foreground/[0.08]" transition={{ duration: 0.25, ease: TAB_EASE }} />
                ))}
              <span className="relative">{t.label}</span>
            </button>
          )
        })}
      </div>

      <div role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label} className="mt-2 flex flex-col" onPointerLeave={() => setHot(null)}>
        {list.rows.map((r, i) => (
          /* the outer row owns the dim so it never fights the entrance inside */
          <div
            key={`${tab}-${r.key}`}
            role="group"
            tabIndex={0}
            aria-label={r.read}
            onPointerEnter={() => setHot(r.key)}
            onFocus={() => setHot(r.key)}
            onBlur={() => setHot(null)}
            /* 13 (the 26px coin mark) + 8 padding = 21 */
            className={cn(
              "rounded-[21px] outline-none transition-[opacity,background-color] duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06]",
              hot !== null && hot !== r.key && "opacity-45",
            )}
          >
            <motion.div
              className="flex items-center gap-2.5 px-2 py-2"
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
            >
              <Mark text={r.mark} renderIcon={renderIcon} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12px] font-medium leading-tight text-foreground/90">{r.title}</span>
                <span className="truncate text-[10.5px] text-foreground/45">{r.sub}</span>
              </span>
              <span className="ml-auto flex shrink-0 flex-col items-end">
                <span className="text-[12px] font-semibold leading-tight text-foreground/90" style={r.hue ? { color: ink(r.hue) } : undefined}>
                  {r.right}
                </span>
                {r.rightSub && (
                  <span className="text-[10.5px] text-foreground/45" style={r.subHue ? { color: ink(r.subHue) } : undefined}>
                    {r.rightSub}
                  </span>
                )}
              </span>
            </motion.div>
          </div>
        ))}
      </div>

      <div role="status" className="mt-1 border-t border-foreground/[0.05] px-2 pt-2 text-[10.5px] text-foreground/45">
        {/* the line swaps in place: 4px and a 2px blur, 150ms */}
        <motion.span
          key={`${tab}-${hot ?? ""}`}
          className="block truncate"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          {pointed ? pointed.read : list.rest}
        </motion.span>
      </div>
    </motion.div>
  )
}
