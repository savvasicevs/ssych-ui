"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Check, ChevronLeft, ChevronRight, Link2, Lock, RotateCw, Star } from "lucide-react"

import { cn } from "../../lib/utils"
import { ICON_BUTTON, SURFACE, THUMB } from "@/components/ui/control-classes"
import { Tip } from "@/components/ui/browser-window-tip"

/* Browser Window: a desktop browser frame to set a page in, which turns into a phone browser
   when its own width drops under `mobileBreakpoint`.

   2026-10-02 audit (redesign): it was a 516 line generic frame with raw Tailwind reds,
   yellows and greens, an outline under a heavy shadow, a theme prop whose three branches were
   the same string, dead buttons and a Windows variant no prop could reach. Now:
   · one desktop frame and the phone fallback. The window is a 24px corner with no outline and
     one soft shadow; the 40px chrome bar is the 7% surface step and the page body is the
     background, so the two read as two steps in both themes.
   · the window dots are three 8px dots in ink /20, decoration with no pointer cursor.
   · the address is the field material (h-7, 12px /60, the lock /45), centred.
   · every control does something: Reload replays the page's entrance, Bookmark toggles a
     filled star, Copy link copies the url and shows a tick. Back and Forward stay as real
     buttons but disabled, as in a fresh window with no history. New tab, More options and the
     phone's Tabs could do nothing honest here, so they are gone. Each icon control is the
     round icon button with a tip.
   · `theme` is real now: "dark" and "light" scope that theme's tokens to the window (the
     `dark` / `light` class, so the window can stay dark on a light page), "auto" follows the
     page. In an app whose tokens have no `.light` class, "light" follows the page too.
   · the sidebar list's active item is the thumb fill with no outline, items fully round.
   Old props kept so nothing that installed it breaks: `variant` (chrome, safari, generic)
   now draws the one frame for all three; the Windows controls are gone. `size` still sets
   the sidebar width preset. The frame fills its parent (h-full w-full) because the portfolio
   sizes it by its box in three places; the library preview sets the Device frame family's
   one width, 640 at 16:10, the same as MacBook Frame.
   2026-10-02 round 2: the shipped defaults read as a trading app: the address is
   app.tradeboard.io (the house brand on the library dashboards) instead of example.com, and
   the sidebar list is Markets, Portfolio, Orders with 3 open, and API keys. */

interface SidebarItem {
  icon?: React.ReactNode
  label: string
  active?: boolean
  badge?: string | number
}

interface AddressBarProps {
  url?: string
  className?: string
  /** "right" biases the bar toward the content area on mobile (centered again from sm+). */
  align?: "center" | "right"
}

interface SidebarContentProps {
  items?: SidebarItem[]
  /** "row" lays the items side by side for a top or bottom bar */
  direction?: "column" | "row"
  className?: string
}

interface BrowserWindowProps {
  children?: React.ReactNode
  className?: string
  /** the sidebar's width preset (sm 128, md 192, lg 224, xl 256) */
  size?: "sm" | "md" | "lg" | "xl"
  showSidebar?: boolean
  sidebarPosition?: "left" | "right" | "top" | "bottom"
  /** "minimal" keeps the window dots alone in the bar; "full" adds the address and the controls */
  headerStyle?: "minimal" | "full"
  /** kept for old installs: all three draw the same frame since 2026-10-02 */
  variant?: "chrome" | "safari" | "generic"
  /** "dark" or "light" scopes that theme's tokens to the window; "auto" follows the page */
  theme?: "light" | "dark" | "auto"
  url?: string
  /** Back / forward / reload buttons after the window controls (full header). */
  showNavButtons?: boolean
  /** Right-side toolbar: bookmark and copy link (full header). */
  showActions?: boolean
  /** Custom sidebar node — overrides the default passive SidebarContent when provided (e.g. an interactive sidebar). */
  sidebar?: React.ReactNode
  /** Override the sidebar width class (e.g. responsive `w-40 lg:w-48`); falls back to the `size` preset. */
  sidebarWidthClassName?: string
  /** "right" biases the address bar toward the content area on mobile. */
  addressBarAlign?: "center" | "right"
  /** Below this container width (px) the frame turns into a phone browser: status row, one address pill, a bottom toolbar. 0 disables it. */
  mobileBreakpoint?: number
  /** The rules under the header and beside the sidebar. Off lets the chrome, sidebar and page read as one surface. */
  dividers?: boolean
  /** The URL pill in the header (and its row on the phone layout). Off leaves the window controls alone in the bar. */
  showAddressBar?: boolean
  sidebarItems?: Array<{
    icon?: React.ReactNode
    label: string
    active?: boolean
    badge?: string | number
  }>
}

const HAIRLINE = "border-foreground/[0.05]"

/** three 8px dots in ink /20: decoration, so no pointer cursor and no hover */
function WindowControls() {
  return (
    <div className="flex gap-2" aria-hidden>
      <span className="size-2 rounded-full bg-foreground/20" />
      <span className="size-2 rounded-full bg-foreground/20" />
      <span className="size-2 rounded-full bg-foreground/20" />
    </div>
  )
}

const hostOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "")

function AddressBar({ url = "https://app.tradeboard.io", align = "center" }: AddressBarProps) {
  // mobile: anchor to the right edge so the bar can't clip off-screen (sidebar sits on the
  // left, so this also sits it over the content area); desktop (sm+): centered.
  const posClass = align === "right" ? "right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2" : "left-1/2 -translate-x-1/2"
  return (
    <div className={`pointer-events-none absolute top-1/2 flex -translate-y-1/2 justify-center ${posClass}`}>
      {/* the field material (control-classes FIELD), drawn as a div: it shows the address, nothing is typed */}
      <div className="flex h-7 min-w-[140px] max-w-[78vw] items-center justify-center gap-1.5 rounded-full border border-foreground/[0.04] bg-[var(--field-fill,color-mix(in_oklab,var(--foreground)_5%,transparent))] px-3.5 text-[12px] text-foreground/60 sm:min-w-[240px] sm:max-w-md">
        <Lock className="h-3 w-3 shrink-0 text-foreground/45" aria-hidden />
        <span className="truncate">{hostOf(url)}</span>
      </div>
    </div>
  )
}

/** Width of the frame itself, so the phone layout keys off the container, not the viewport. */
function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** the window's working state: reload replays the page, the star toggles, copy link copies */
function useBrowserState(url: string) {
  const [load, setLoad] = useState(0)
  const [starred, setStarred] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = () => {
    const done = () => {
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1400)
    }
    navigator.clipboard?.writeText(url).then(done, done) ?? done()
  }
  return { load, reload: () => setLoad((n) => n + 1), starred, toggleStar: () => setStarred((s) => !s), copied, copy }
}
type BrowserState = ReturnType<typeof useBrowserState>

function IconControl({
  label,
  onClick,
  disabled,
  pressed,
  className,
  side = "bottom",
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  pressed?: boolean
  className?: string
  side?: "top" | "bottom"
  children: React.ReactNode
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(ICON_BUTTON, "h-7 w-7 disabled:pointer-events-none disabled:text-foreground/20", className)}
    >
      {children}
    </button>
  )
  return disabled ? button : <Tip tip={label} side={side}>{button}</Tip>
}

function NavButtons({ state, side }: { state: BrowserState; side?: "top" | "bottom" }) {
  return (
    <div className="flex items-center gap-0.5">
      <IconControl label="Back" disabled side={side}>
        <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
      </IconControl>
      <IconControl label="Forward" disabled side={side}>
        <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
      </IconControl>
      <IconControl label="Reload" onClick={state.reload} side={side}>
        <RotateCw className="h-3.5 w-3.5" />
      </IconControl>
    </div>
  )
}

function ActionButtons({ state, side }: { state: BrowserState; side?: "top" | "bottom" }) {
  return (
    <div className="flex items-center gap-0.5">
      <IconControl label={state.starred ? "Bookmarked" : "Bookmark"} pressed={state.starred} onClick={state.toggleStar} side={side}>
        <Star className={cn("h-3.5 w-3.5", state.starred && "fill-current text-foreground/90")} />
      </IconControl>
      <IconControl label={state.copied ? "Copied" : "Copy link"} onClick={state.copy} side={side}>
        {state.copied ? <Check className="h-3.5 w-3.5 text-foreground/90" strokeWidth={2.2} /> : <Link2 className="h-3.5 w-3.5" />}
      </IconControl>
    </div>
  )
}

/** the page: Reload re-keys it so its entrance plays again (a fade, 4px rise; a fade alone under reduced motion) */
function Page({ load, children }: { load: number; children?: React.ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      key={load}
      className="absolute inset-0"
      initial={load === 0 ? false : reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** The phone chrome: a status row, one full-width address pill with the lock, and a bottom toolbar. */
function PhoneChrome({
  url = "https://app.tradeboard.io",
  children,
  dividers = true,
  showAddressBar = true,
  state,
}: {
  url?: string
  children?: React.ReactNode
  dividers?: boolean
  showAddressBar?: boolean
  state: BrowserState
}) {
  const host = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  return (
    <>
      <div className={cn("flex h-7 items-center justify-between px-5 text-[11px] font-medium tabular-nums text-foreground/70", SURFACE)}>
        <span>9:41</span>
        {/* signal and battery as plain bars so no glyph font is needed */}
        <span className="flex items-center gap-1.5" aria-hidden>
          <span className="flex items-end gap-[2px]">
            <span className="h-1.5 w-[3px] rounded-[1px] bg-foreground/70" />
            <span className="h-2 w-[3px] rounded-[1px] bg-foreground/70" />
            <span className="h-2.5 w-[3px] rounded-[1px] bg-foreground/70" />
            <span className="h-3 w-[3px] rounded-[1px] bg-foreground/25" />
          </span>
          <span className="ml-1 flex h-[11px] w-[22px] items-center rounded-[3px] bg-foreground/[0.12] p-[2px]">
            <span className="h-full w-[70%] rounded-[1px] bg-foreground/70" />
          </span>
        </span>
      </div>
      {showAddressBar && (
        <div className={cn("flex items-center gap-2 px-3 pb-2", SURFACE)}>
          <div className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-foreground/[0.04] bg-[var(--field-fill,color-mix(in_oklab,var(--foreground)_5%,transparent))] px-3 text-[12px] text-foreground/60">
            <Lock className="h-3 w-3 text-foreground/45" aria-hidden />
            <span className="truncate">{host}</span>
          </div>
          <IconControl label="Reload" onClick={state.reload} className="h-9 w-9">
            <RotateCw className="h-4 w-4" />
          </IconControl>
        </div>
      )}
      <div className={cn("relative min-h-0 flex-1 bg-background", dividers && `border-t ${HAIRLINE}`)}>
        <Page load={state.load}>{children}</Page>
      </div>
      <div className={cn("flex h-12 items-center justify-around px-2", SURFACE, dividers && `border-t ${HAIRLINE}`)}>
        <NavButtons state={state} side="top" />
        <ActionButtons state={state} side="top" />
      </div>
    </>
  )
}

function SidebarContent({
  items = [
    { label: "Markets", active: true },
    { label: "Portfolio" },
    { label: "Orders", badge: "3" },
    { label: "API keys" },
  ],
  direction = "column",
  className = "",
}: SidebarContentProps) {
  return (
    <div className={cn("flex gap-1 p-2.5", direction === "row" ? "flex-row items-center" : "flex-col", className)}>
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={cn(
            "flex h-8 items-center gap-2 rounded-full px-3 text-[12.5px] transition-colors duration-150",
            item.active ? cn(THUMB, "text-foreground/90") : "text-foreground/60",
          )}
        >
          {item.icon && <div className="h-4 w-4 flex-shrink-0">{item.icon}</div>}
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge != null && <span className="text-[11px] tabular-nums text-foreground/45">{item.badge}</span>}
        </div>
      ))}
    </div>
  )
}

const SIDEBAR_SIZES = { sm: "w-32", md: "w-48", lg: "w-56", xl: "w-64" } as const
const THEME_SCOPE = { dark: "dark", light: "light", auto: "" } as const

export function BrowserWindow({
  children,
  className = "",
  size = "md",
  showSidebar = false,
  sidebarPosition = "left",
  headerStyle = "minimal",
  // variant: kept for old installs, every value draws the one frame (see the header comment)
  theme = "auto",
  url,
  showNavButtons = false,
  showActions = false,
  sidebar,
  sidebarWidthClassName,
  addressBarAlign = "center",
  sidebarItems,
  mobileBreakpoint = 480,
  dividers = true,
  showAddressBar = true,
}: BrowserWindowProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const width = useContainerWidth(frameRef)
  const state = useBrowserState(url ?? "https://app.tradeboard.io")
  /* the phone layout keys off the frame's own width, so a narrow column or a
     resized preview turns the desktop chrome into a mobile browser */
  const mobile = mobileBreakpoint > 0 && width !== null && width < mobileBreakpoint
  const sidebarWidth = sidebarWidthClassName ?? SIDEBAR_SIZES[size]
  const full = headerStyle === "full"

  /* 24px corner, a hairline around the screen (his call, 2026-10-02: "browser window and screen
     shuffle should have some outlines around those screens") and a lighter soft shadow */
  const frameClass = cn(
    THEME_SCOPE[theme],
    "relative flex h-full w-full flex-col overflow-hidden rounded-[24px] bg-background text-foreground",
    className,
  )
  const frameStyle = {
    boxShadow:
      "0 0 0 1px var(--light-outline, color-mix(in srgb, var(--foreground) 12%, transparent)), 0 18px 44px -26px rgba(0,0,0,calc(0.4 * var(--shadow-k, 1)))",
  }

  if (mobile) {
    return (
      <div ref={frameRef} className={frameClass} style={frameStyle}>
        <PhoneChrome url={url} dividers={dividers} showAddressBar={showAddressBar} state={state}>
          {children}
        </PhoneChrome>
      </div>
    )
  }

  const bar = () => (
    <div className={cn("h-12 shrink-0", SURFACE, dividers && (sidebarPosition === "top" ? `border-b ${HAIRLINE}` : `border-t ${HAIRLINE}`))}>
      <SidebarContent items={sidebarItems} direction="row" />
    </div>
  )
  const side = (edge: "left" | "right") => (
    <div className={cn(sidebarWidth, "h-full flex-shrink-0", SURFACE, dividers && (edge === "left" ? `border-r ${HAIRLINE}` : `border-l ${HAIRLINE}`))}>
      {sidebar ?? <SidebarContent items={sidebarItems} />}
    </div>
  )

  return (
    <div ref={frameRef} className={frameClass} style={frameStyle}>
      <div className={cn("relative flex h-10 shrink-0 items-center px-4", SURFACE, dividers && `border-b ${HAIRLINE}`)}>
        <div className="relative z-10 flex items-center gap-3">
          <WindowControls />
          {full && showNavButtons && <NavButtons state={state} />}
        </div>
        {full && showAddressBar && <AddressBar url={url} align={addressBarAlign} />}
        {full && showActions && (
          <div className="relative z-10 ml-auto">
            <ActionButtons state={state} />
          </div>
        )}
      </div>

      {showSidebar && sidebarPosition === "top" && bar()}

      <div className="flex h-0 flex-1">
        {showSidebar && sidebarPosition === "left" && side("left")}
        <div className="relative h-full min-w-0 flex-1">
          <Page load={state.load}>{children}</Page>
        </div>
        {showSidebar && sidebarPosition === "right" && side("right")}
      </div>

      {showSidebar && sidebarPosition === "bottom" && bar()}
    </div>
  )
}
