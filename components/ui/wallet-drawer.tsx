"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronRight, Copy, QrCode, SendHorizontal, SlidersHorizontal, Sparkles } from "lucide-react"

import { BUTTON, FIELD, ICON_BUTTON, SURFACE } from "@/components/ui/control-classes"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { PrimaryButton, RowField } from "@/components/ui/swap-ticket-field"
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
   `renderIcon` to draw the real marks instead. The wallet itself is a generated avatar
   (2026-10-02).
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
   · send, worth    amount × price of the chosen asset
   · can be sent    0 < amount ≤ quantity held, and an address is typed
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit (his list: "a proper icon for the account holder"; "Send, Receive and AI
   chat get their icons"; every dead button does something):
   · the holder is a generated avatar (a glass orb seeded from the address, the family of the
     dashboards' AccountMenu picture) through the new `avatar` prop, which takes any node; it
     was two letters on an ink disc
   · Send, Receive and AI chat are the control material at 36px with an arrow up, an arrow
     down and a sparkle before the word
   · AI chat opens a small chat view: suggestions, a prompt field, and answers worked from the
     wallet's own figures (largest holding, total, yearly yield, last move). `onChat` still
     fires when it opens
   · settings: Currency opens a pane that really changes the display currency (new `rates`
     prop), Connected apps opens a pane where each app can be disconnected (new `apps`
     prop); Language is gone, since nothing in the wallet could change with it. The rows are
     17px round like the switches above them, with no rule between
   · the total is the three-tier header (spec 14.1): "Total" /45 and the network /90, the
     26px figure with its cents at /35, the 24h move in hue with the window at /45
   · the lists are the shared Segmented Control; Accounts is gone from it, since it summed
     the Crypto rows again (a `defaultTab` of "accounts" opens Crypto)
   · Send's fields are the ticket family's 48px round field, its button the 48px white
     primary; the address pattern sits in a 12px frame; readable text is /60
   Not done: the audit asked for the drawer to rest as a chip that opens it in a sheet. The
   component is the drawer's content and the library card shows it; a host puts it in its
   own sheet.
   Formulas (added):
   · 24h move       Σ value × change ÷ (100 + change), the dollars a holding moved in a day
   · 24h move, %    move ÷ (total − move) × 100
   · shown money    dollar value × the chosen currency's rate (sample rates, `rates`)
   · yearly yield   Σ stake value × yield ÷ 100 (chat answer) */

const EASE = [0.16, 1, 0.3, 1] as const
const TAB_EASE = [0.22, 1, 0.36, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
/** A hue as text: its lightness is capped in the light theme so small figures stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

export interface WalletHolding {
  name: string
  symbol: string
  /** the network the asset sits on */
  network: string
  quantity: number
  price: number
  /** percent over 24 hours; the header's move is worked from it */
  change?: number
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

/** "accounts" is kept for callers; since the 2026-10-02 audit it opens Crypto */
export type WalletTab = "crypto" | "accounts" | "watchlist" | "defi" | "activity"
export type WalletView = "home" | "send" | "receive" | "settings" | "chat"

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
  /** fired when the AI chat view opens */
  onChat?: () => void
  /** draws a coin's mark in place of the coin-coloured disc */
  renderIcon?: (symbol: string, size: number) => ReactNode
  /** the account holder's picture; a glass orb generated from the address when left out */
  avatar?: ReactNode
  /** dollars to one unit of each display currency; the first is the default */
  rates?: Record<string, number>
  /** apps connected to the wallet, each can be disconnected in Settings */
  apps?: string[]
  className?: string
}

const DEFAULT_HOLDINGS: WalletHolding[] = [
  { name: "Bitcoin", symbol: "BTC", network: "Bitcoin", quantity: 0.42, price: 64619, change: 1.8 },
  { name: "Ethereum", symbol: "ETH", network: "Ethereum", quantity: 4.1, price: 3050, change: -0.9 },
  { name: "Solana", symbol: "SOL", network: "Solana", quantity: 28, price: 148, change: 3.2 },
  { name: "BNB", symbol: "BNB", network: "BNB Chain", quantity: 3.7, price: 578, change: 0.4 },
  { name: "USD Coin", symbol: "USDC", network: "Ethereum", quantity: 1500, price: 1, change: 0 },
]

const DEFAULT_WATCHLIST: WalletWatch[] = [
  { name: "Dogecoin", symbol: "DOGE", price: 0.128, change: 4.2 },
  { name: "Chainlink", symbol: "LINK", price: 14.6, change: -1.8 },
  { name: "Avalanche", symbol: "AVAX", price: 26.4, change: 2.1 },
  { name: "Polygon", symbol: "POL", price: 0.42, change: -0.6 },
  { name: "Litecoin", symbol: "LTC", price: 71.8, change: 3.4 },
]

const DEFAULT_STAKES: WalletStake[] = [
  { name: "ETH, stETH", protocol: "Lido staking", symbol: "ETH", value: 6405, yield: 3.1 },
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

/** sample rates: units of each currency per dollar */
const DEFAULT_RATES: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79 }
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" }
const DEFAULT_APPS = ["Uniswap", "Aave", "Lido"]
/** the token an app is known by, so its row can show the real mark */
const APP_MARK: Record<string, string> = { Uniswap: "UNI", Aave: "AAVE", Lido: "LDO" }

const TABS: { key: Exclude<WalletTab, "accounts">; label: string }[] = [
  { key: "crypto", label: "Crypto" },
  { key: "watchlist", label: "Watchlist" },
  { key: "defi", label: "DeFi" },
  { key: "activity", label: "Activity" },
]

const amountOf = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 })
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`

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

/** a coin's mark: the caller's drawing, or the coin disc with its letters behind the renderIcon slot */
function Mark({ text, size = 26, renderIcon }: { text: string; size?: number; renderIcon?: RenderIcon }) {
  if (renderIcon) return <span className="inline-flex shrink-0">{renderIcon(text, size)}</span>
  const disc = COIN[text.toUpperCase()]
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

/** a small seeded generator, so one address always draws the same picture */
const seeded = (text: string) => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

/** The holder's picture: a glass orb (a hue ground and two soft light shapes turned by the
 *  seed), the look of the dashboards' account picture, drawn from the address so it ships
 *  with no asset file. */
export function WalletAvatar({ seed, size = 32 }: { seed: string; size?: number }) {
  const id = useId().replace(/:/g, "")
  const r = seeded(seed)
  const hue = Math.round(r() * 360)
  const a = Math.round(r() * 360)
  const b = Math.round(r() * 360)
  const light = "var(--coin-glyph, #fff)"
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 100 100" className="shrink-0 rounded-full">
      <defs>
        <clipPath id={`${id}-c`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
        <filter id={`${id}-b`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <g clipPath={`url(#${id}-c)`}>
        <rect width="100" height="100" fill={`oklch(0.66 0.16 ${hue})`} />
        <g filter={`url(#${id}-b)`} opacity="0.65" style={{ mixBlendMode: "screen" }}>
          <rect x="-10" y="18" width="120" height="30" rx="15" fill={light} transform={`rotate(${a} 50 50)`} />
          <circle cx="68" cy="70" r="20" fill={`oklch(0.78 0.14 ${(hue + 60) % 360})`} transform={`rotate(${b} 50 50)`} />
        </g>
      </g>
    </svg>
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
type Message = { from: "you" | "ai"; text: string }

const SUGGESTIONS = ["What is my largest holding?", "How much do I earn a year?", "What moved last?"]

/**
 * The wallet as one column: the holder, the total, three actions, four lists behind a
 * switch, and the send, receive, chat and settings views. Pointing at a row works it out in
 * the line under the list.
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
  avatar,
  rates = DEFAULT_RATES,
  apps: apps0 = DEFAULT_APPS,
  className,
}: WalletDrawerProps) {
  const reduced = useReducedMotion()
  const [tab, setTab] = useState<WalletTab>(defaultTab === "accounts" ? "crypto" : defaultTab)
  const [view, setView] = useState<WalletView>(defaultView)
  const [pane, setPane] = useState<null | "currency" | "apps">(null)
  const [hot, setHot] = useState<string | null>(null)
  /* the tab panel never shrinks below the tallest tab it has shown, so switching tabs never
     resizes the drawer or shifts it inside a centred stage (his report, 2026-10-02). Measured,
     since the tabs' rows are not all one height. Up here with the other hooks: the other panes
     return early below, and a hook after them would change the hook order */
  const panelRef = useRef<HTMLDivElement>(null)
  const [floor, setFloor] = useState(0)
  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    if (h > floor) setFloor(h)
  })
  const [copied, setCopied] = useState(false)
  const [asset, setAsset] = useState(holdings[0]?.symbol ?? "")
  const [to, setTo] = useState("")
  const [amountStr, setAmountStr] = useState("")
  const [prefs, setPrefs] = useState({ hide: false, testnets: false, alerts: true })
  const [currency, setCurrency] = useState(Object.keys(rates)[0] ?? "USD")
  const [apps, setApps] = useState(apps0)
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState("")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatEnd = useRef<HTMLDivElement>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" })
  }, [messages])

  const rate = rates[currency] ?? 1
  const cur = SYMBOL[currency] ?? `${currency} `
  /** a dollar figure in the display currency */
  const money = (n: number, dp = 2) => `${cur}${(n * rate).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`

  const valued = holdings.map((h) => ({ ...h, value: h.quantity * h.price }))
  const total = valued.reduce((s, h) => s + h.value, 0)
  const move = valued.reduce((s, h) => s + (h.change ? (h.value * h.change) / (100 + h.change) : 0), 0)
  const movePct = total - move > 0 ? (move / (total - move)) * 100 : 0
  const share = (v: number) => (total > 0 ? (v / total) * 100 : 0)
  const shown = (text: string) => (prefs.hide ? "••••" : text)

  /** set once a view has been changed by hand, so the first paint does not slide */
  const [moved, setMoved] = useState(false)
  const go = (v: WalletView) => {
    setMoved(true)
    setView(v)
    setPane(null)
    setHot(null)
    if (v === "chat") onChat?.()
  }
  /* a view slides in 8px from the side it lies on (a sub-view from the right, home from the
     left) through a 2px blur, 250ms; reduced motion keeps the fade */
  const slide = {
    initial: !moved ? false : reduced ? { opacity: 0 } : { opacity: 0, x: view === "home" ? -8 : 8, filter: "blur(2px)" },
    animate: { opacity: 1, x: 0, filter: "blur(0px)" },
    transition: { duration: 0.25, ease: TAB_EASE },
  } as const

  const root = cn("w-[360px] max-w-full tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)

  const header = (title: string, back: () => void = () => go("home")) => (
    <div className="mb-4 flex items-center gap-2">
      <button type="button" aria-label="Back" onClick={back} className={cn("-ml-1.5 h-8 w-8", ICON_BUTTON)}>
        <ArrowLeft size={15} aria-hidden />
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
              : `Send ${picked.symbol}`
    return (
      <motion.div key="send" {...slide} className={root} role="group" aria-label={`Send from ${name}, ${verdict}`}>
        {header("Send")}
        <div className="px-2 pb-1 text-[12px] text-foreground/60">Asset</div>
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
                <span className="text-[12.5px] font-medium text-foreground/90">{h.name}</span>
                <span className="ml-auto text-[12px] text-foreground/60">
                  {amountOf(h.quantity)} {h.symbol}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <RowField label="To" value={to} onChange={setTo} inputMode="text" placeholder="Address or name" ariaLabel="Address to send to" />
          <RowField label="Amount" value={amountStr} onChange={setAmountStr} places={6} unit={picked?.symbol} ariaLabel={`Amount in ${picked?.symbol ?? "units"}`} />
        </div>
        <div role="status" className="mt-3 flex items-baseline justify-between px-2 text-[12px]">
          <span className="text-foreground/60">Worth</span>
          <span className="text-foreground/90">{money(amount * (picked?.price ?? 0))}</span>
        </div>
        <PrimaryButton
          className="mt-4"
          state={state}
          disabled={state !== "ready"}
          onClick={() => picked && onSend?.({ symbol: picked.symbol, amount, to: to.trim() })}
          label={
            <>
              {state === "ready" && <ArrowUp size={15} aria-hidden />}
              {verdict}
            </>
          }
        />
      </motion.div>
    )
  }

  if (view === "receive") {
    return (
      <motion.div key="receive" {...slide} className={root} role="group" aria-label={`Receive to ${name}, ${address}`}>
        {header("Receive")}
        <div className="flex flex-col items-center gap-3 py-2">
          {/* 12, an inner block */}
          <span className={cn("rounded-[12px] p-3", SURFACE)}>
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
            className={cn("h-9 gap-2 px-4 text-[12.5px] font-medium", BUTTON)}
          >
            {address}
            {/* copy and check swap in one slot through a blur; the check is a done state, so green */}
            <motion.span
              key={copied ? "check" : "copy"}
              className={copied ? undefined : "text-foreground/60"}
              style={copied ? { color: ink(GREEN) } : undefined}
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, filter: "blur(2px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.25, ease: TAB_EASE }}
            >
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            </motion.span>
          </button>
          <span role="status" className="h-4 text-[12px] text-foreground/60">
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

  if (view === "chat") {
    /* answers worked from the wallet's own figures, so every number in them can be checked */
    const answer = (q: string): string => {
      const t = q.toLowerCase()
      const top = [...valued].sort((x, y) => y.value - x.value)[0]
      if (/large|big|most|top/.test(t) && top) return `${top.name}: ${amountOf(top.quantity)} ${top.symbol} worth ${money(top.value)}, ${share(top.value).toFixed(1)}% of the wallet.`
      if (/earn|yield|stak|year/.test(t)) {
        const yearly = stakes.reduce((s, p) => s + (p.value * p.yield) / 100, 0)
        return `About ${money(yearly)} a year from ${stakes.length} positions, each value × its yield, summed.`
      }
      if (/move|last|recent|activity/.test(t) && activity[0]) return `${activity[0].kind}, ${activity[0].detail}, ${activity[0].time}.`
      if (/total|worth|balance/.test(t)) return `${money(total)} across ${valued.length} assets, ${signedPct(movePct)} over 24 hours.`
      return "I can answer about your holdings, your total, what you earn from staking and what moved last."
    }
    const ask = (q: string) => {
      if (!q.trim()) return
      setMessages((m) => [...m, { from: "you", text: q.trim() }, { from: "ai", text: answer(q) }])
      setPrompt("")
    }
    return (
      <motion.div key="chat" {...slide} className={root} role="group" aria-label={`AI chat about ${name}`}>
        {header("AI chat")}
        <div role="log" aria-live="polite" className="flex max-h-[260px] min-h-[160px] flex-col gap-2 overflow-y-auto px-1 [scrollbar-width:none]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-start gap-1.5">
              <span className="px-1 pb-1 text-[12px] text-foreground/60">Ask about this wallet</span>
              {SUGGESTIONS.map((q) => (
                <button key={q} type="button" onClick={() => ask(q)} className={cn("h-8 px-3 text-[12px]", BUTTON)}>
                  {q}
                </button>
              ))}
            </div>
          ) : (
            messages.map((m, i) => (
              <motion.p
                key={i}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                /* a bubble's 12px corner holds one line of text 12px in */
                className={cn(
                  "max-w-[85%] rounded-[16px] px-3 py-2 text-[12.5px] leading-[1.45]",
                  m.from === "you" ? "self-end bg-foreground/[0.9] text-background" : cn("self-start text-foreground/90", SURFACE),
                )}
              >
                {m.text}
              </motion.p>
            ))
          )}
          <div ref={chatEnd} />
        </div>
        <form
          className={cn("mt-3 flex h-12 items-center gap-2 pl-5 pr-2", FIELD)}
          onSubmit={(e) => {
            e.preventDefault()
            ask(prompt)
          }}
        >
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask anything" aria-label="Ask about this wallet" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-foreground/45" />
          <button type="submit" aria-label="Send the question" disabled={!prompt.trim()} className={cn("h-8 w-8", BUTTON)}>
            <SendHorizontal size={14} aria-hidden />
          </button>
        </form>
      </motion.div>
    )
  }

  if (view === "settings") {
    const linkRow = "flex w-full items-center gap-2 rounded-[17px] px-2 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06]"
    if (pane === "currency")
      return (
        <motion.div key="currency" {...slide} className={root} role="group" aria-label="Display currency">
          {header("Currency", () => setPane(null))}
          <div role="radiogroup" aria-label="Display currency" className="flex flex-col">
            {Object.keys(rates).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={c === currency} onClick={() => setCurrency(c)} className={linkRow}>
                <span className="text-[12.5px] font-medium text-foreground/90">{c}</span>
                <span className="text-[12px] text-foreground/60">{c === "USD" ? "US dollar" : `${SYMBOL[c] ?? ""}${rates[c]} per $1`}</span>
                <span className="ml-auto grid w-4 place-items-center">{c === currency && <Check size={14} aria-hidden className="text-foreground/70" />}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )
    if (pane === "apps")
      return (
        <motion.div key="apps" {...slide} className={root} role="group" aria-label="Connected apps">
          {header("Connected apps", () => setPane(null))}
          <div className="flex flex-col">
            {apps.length === 0 && <p className="px-2 py-3 text-[12px] text-foreground/60">No apps are connected.</p>}
            {apps.map((app) => (
              <div key={app} className="flex items-center gap-2.5 rounded-[17px] px-2 py-2">
                <Mark text={APP_MARK[app] ?? app} renderIcon={renderIcon} />
                <span className="text-[12.5px] font-medium text-foreground/90">{app}</span>
                <button type="button" onClick={() => setApps((list) => list.filter((a) => a !== app))} className={cn("ml-auto h-7 px-3 text-[12px]", BUTTON)}>
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )
    const switches: { key: keyof typeof prefs; label: string }[] = [
      { key: "hide", label: "Hide balances" },
      { key: "testnets", label: "Show testnets" },
      { key: "alerts", label: "Price alerts" },
    ]
    const links = [
      { key: "currency" as const, label: "Currency", value: currency },
      { key: "apps" as const, label: "Connected apps", value: String(apps.length) },
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
              <span className="text-[12.5px] font-medium text-foreground/90">{s.label}</span>
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
            <button key={l.key} type="button" onClick={() => setPane(l.key)} className={linkRow}>
              <span className="text-[12.5px] font-medium text-foreground/90">{l.label}</span>
              <span className="ml-auto text-[12px] text-foreground/60">{l.value}</span>
              <ChevronRight size={14} aria-hidden className="text-foreground/45" />
            </button>
          ))}
        </div>
      </motion.div>
    )
  }

  /* one row shape for all the lists, so they read as one instrument */
  const lists: Record<Exclude<WalletTab, "accounts">, Row[]> = {
    crypto: valued.map((h) => ({
      key: h.symbol,
      mark: h.symbol,
      title: h.name,
      sub: `${amountOf(h.quantity)} ${h.symbol}`,
      right: shown(money(h.value)),
      rightSub: `${share(h.value).toFixed(1)}%`,
      read: `${h.symbol}: ${amountOf(h.quantity)} × ${money(h.price)} = ${shown(money(h.value))}`,
    })),
    watchlist: watchlist.map((w) => ({
      key: w.symbol,
      mark: w.symbol,
      title: w.name,
      sub: w.symbol,
      right: money(w.price, w.price < 1 ? 3 : 2),
      rightSub: signedPct(w.change),
      subHue: w.change >= 0 ? GREEN : RED,
      read: `${w.symbol}: ${money(w.price, w.price < 1 ? 3 : 2)}, ${signedPct(w.change)} in 24h`,
    })),
    defi: stakes.map((p) => ({
      key: p.protocol,
      mark: p.symbol,
      title: p.name,
      sub: p.protocol,
      right: shown(money(p.value)),
      rightSub: `${p.yield.toFixed(1)}% a year`,
      read: `${p.protocol}: ${shown(money((p.value * p.yield) / 100))} a year at ${p.yield.toFixed(1)}%`,
    })),
    activity: activity.map((e, i) => ({
      key: `${e.kind}-${i}`,
      mark: e.symbol,
      title: e.kind,
      sub: e.detail,
      right: `${e.kind === "Received" ? "+" : e.kind === "Sent" ? "−" : ""}${shown(money(e.value))}`,
      rightSub: e.time,
      hue: e.kind === "Received" ? GREEN : e.kind === "Sent" ? RED : undefined,
      read: `${e.kind}: ${e.detail}, ${e.time}`,
    })),
  }
  const shownTab = tab === "accounts" ? "crypto" : tab
  const rows = lists[shownTab]
  const pointed = rows.find((r) => r.key === hot)


  const action = (label: string, icon: ReactNode, onClick: () => void) => (
    <button type="button" onClick={onClick} className={cn("h-9 flex-1 text-[12.5px] font-medium", BUTTON)}>
      <span aria-hidden className="text-foreground/70">
        {icon}
      </span>
      {label}
    </button>
  )

  const [whole, cents] = money(total).split(".")

  return (
    <motion.div key="home" {...slide} className={root} role="group" aria-label={`${name}, ${prefs.hide ? "balance hidden" : money(total)}`}>
      <div className="flex items-center gap-2.5">
        {avatar ?? <WalletAvatar seed={address} size={32} />}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium leading-tight text-foreground/90">{name}</span>
          <span className="text-[12px] text-foreground/60">{address}</span>
        </span>
        <span className="-mr-1.5 ml-auto flex items-center">
          <button type="button" aria-label="Show the receive address" onClick={() => go("receive")} className={cn("h-8 w-8", ICON_BUTTON)}>
            <QrCode size={15} aria-hidden />
          </button>
          <button type="button" aria-label="Settings" onClick={() => go("settings")} className={cn("h-8 w-8", ICON_BUTTON)}>
            <SlidersHorizontal size={15} aria-hidden />
          </button>
        </span>
      </div>

      {/* the three-tier header (spec 14.1) */}
      <div className="mt-5">
        <div className="mb-3 flex items-baseline justify-between text-[12px]">
          <span className="text-foreground/45">Total</span>
          <span className="font-medium text-foreground/90">{network}</span>
        </div>
        <div className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
          {prefs.hide ? (
            "••••"
          ) : (
            <>
              {whole}
              <span className="text-foreground/35">.{cents}</span>
            </>
          )}
        </div>
        <div className="mt-2 text-[12px] font-medium" style={{ color: ink(move >= 0 ? GREEN : RED) }}>
          {shown(`${move >= 0 ? "+" : "−"}${money(Math.abs(move))}`)} ({signedPct(movePct)}) <span className="font-normal text-foreground/45">24h</span>
        </div>
      </div>

      <div className="mt-4 flex gap-1.5">
        {action("Send", <ArrowUp size={14} />, () => go("send"))}
        {action("Receive", <ArrowDown size={14} />, () => go("receive"))}
        {action("AI chat", <Sparkles size={14} />, () => go("chat"))}
      </div>

      <SegmentedControl
        className="mt-4"
        options={TABS.map((t) => t.label)}
        value={TABS.find((t) => t.key === shownTab)?.label}
        onChange={(label) => {
          const next = TABS.find((t) => t.label === label)
          if (next) setTab(next.key)
          setHot(null)
        }}
      />

      <div role="tabpanel" aria-label={TABS.find((t) => t.key === shownTab)?.label} ref={panelRef} className="mt-2 flex flex-col" style={{ minHeight: floor || undefined }} onPointerLeave={() => setHot(null)}>
        {rows.map((r, i) => (
          /* the outer row owns the dim so it never fights the entrance inside */
          <div
            key={`${shownTab}-${r.key}`}
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
                <span className="truncate text-[12.5px] font-medium leading-tight text-foreground/90">{r.title}</span>
                <span className="truncate text-[11px] text-foreground/60">{r.sub}</span>
              </span>
              <span className="ml-auto flex shrink-0 flex-col items-end">
                <span className="text-[12.5px] font-semibold leading-tight text-foreground/90" style={r.hue ? { color: ink(r.hue) } : undefined}>
                  {r.right}
                </span>
                {r.rightSub && (
                  <span className="text-[11px] text-foreground/60" style={r.subHue ? { color: ink(r.subHue) } : undefined}>
                    {r.rightSub}
                  </span>
                )}
              </span>
            </motion.div>
          </div>
        ))}
      </div>

      <div role="status" className="mt-1 border-t border-foreground/[0.04] px-2 pt-2 text-[11px] text-foreground/60">
        {/* the line reads the pointed row only, swapping in place: 4px and a 2px blur, 150ms */}
        <motion.span
          key={`${shownTab}-${hot ?? ""}`}
          className="block truncate"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          {pointed ? pointed.read : " "}
        </motion.span>
      </div>
    </motion.div>
  )
}
