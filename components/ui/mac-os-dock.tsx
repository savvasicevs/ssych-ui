"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { RAISED } from "@/components/ui/control-classes"

/** Command Dock — macOS-style magnifying dock. Cursor distance drives per-icon
 *  size (44→56px raised-cosine springs), a hairline tooltip chip sits above the
 *  hovered tool, icons bounce on click, and a
 *  ⌘K slot at the end opens a small command menu. Light and dark via theme
 *  tokens; the default items are CSS-drawn tiles — swap in your own via props.
 *  2026-10-02 audit: the tooltip was capitals with an outline, a shadow and an arrow; it is
 *  now a sentence case 11px /90 pill in the popover fill with the 8% hairline only. The tray
 *  was a gradient with two inset rings, a specular line and a drop shadow; it is now the 7%
 *  surface with one soft shadow, and its corner nests: 22 = the icons' 10 + the 12px pad.
 *  The ⌘K menu's commands only closed it; it now lists the dock's own tools (each one runs
 *  onSelect, as a click on its icon does, and the keys 1 to 9 pick them while it is open)
 *  and Copy link, which copies the page address and shows a tick. Its shortcuts are bare
 *  text, it closes on Escape and on a press outside, and the icons are typed buttons that
 *  follow pointer events.
 *  2026-10-02 round 2: his notes were to put it on topic and to bring back a bit of the old
 *  detail, the sheen and the lighting, keeping the new roundness. The default tools are a
 *  trader's and analyst's dock now: Terminal, Charts, Research, Wallet, Copilot and Alerts,
 *  each a drawn glyph on its own tile. The tray keeps its 22 corner and gets its light back:
 *  a top to bottom gradient (10% to 6% ink over the page), a 12% inset line along the top
 *  edge and the specular streak across the lip (35% ink at its middle, fading to nothing at
 *  both ends, inset 24px so it never meets the curve). Each tile is lit the same way: a white
 *  sheen over its top half and an inset highlight on its top edge with a soft shade under
 *  its bottom edge. No outline comes back. Props and behaviour are unchanged. */

const EASE = [0.16, 1, 0.3, 1] as const
const FAR = 99999
const REST = 44
const PEAK = 56 // keep the magnify subtle — icons shouldn't balloon
const RADIUS = 110 // px of cursor influence on either side of an icon
/** Apple's icon grid: the squircle covers ~82% of its tile and the remaining
 *  ~9% a side is transparent margin — every shipped macOS icon is drawn that
 *  way. The plates the dock draws itself (the gradient tiles and the ⌘K slot)
 *  sit on the same grid, otherwise they read a fifth larger than any real
 *  artwork standing next to them. */
const PLATE = "82%"
/** icons are lit from above and float off the tray floor — traces the artwork's
 *  alpha, so transparent-margin PNG/WebP icons cast the right silhouette */
/* lighter and flatter (his call, 2026-10-02: "the shadows are too strong, make the dock feel
   flatter"): one short soft shadow instead of two deep ones */
const ICON_SHADOW = "drop-shadow(0 1px 2px rgba(0,0,0,calc(0.16 * var(--shadow-k, 1))))"

export type DockApp = {
  id: string
  label: string
  /** any node — an <img>, an svg, or the built-in gradient tiles */
  icon: ReactNode
}

/** app tile: one neutral graphite plate in the theme's ink, the glyph in light ink (his call,
 *  2026-10-04: the brand-coloured tiles were too colourful; 2026-10-02: flat, no gradient,
 *  sheen or lit edge). Only the running dot and the menu say which app is which. */
function Tile({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="flex h-full w-full items-center justify-center">
      <span
        /* light: raised fills inside the darker bar go white, as the ⌘K key does */
        className="relative flex items-center justify-center overflow-hidden rounded-[22%] bg-[color-mix(in_srgb,var(--foreground)_11%,var(--background))] text-foreground/85 light:bg-white"
        style={{ width: PLATE, height: PLATE }}
      >
        <span className="relative flex">{children}</span>
      </span>
    </span>
  )
}

const glyph = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const }

/** demo tools: a trader's and analyst's dock, six tiles in the theme's ink */
const DEFAULT_ITEMS: DockApp[] = [
  {
    id: "terminal",
    label: "Terminal",
    icon: (
      <Tile>
        <svg width={18} height={18} viewBox="0 0 22 22" {...glyph}>
          <path d="M6 7 L 10.5 11 L 6 15" />
          <line x1={12.5} y1={15.5} x2={16.5} y2={15.5} />
        </svg>
      </Tile>
    ),
  },
  {
    id: "charts",
    label: "Charts",
    icon: (
      <Tile>
        <svg width={18} height={18} viewBox="0 0 22 22" {...glyph}>
          <line x1={6} y1={4.5} x2={6} y2={17.5} />
          <rect x={4.5} y={7.5} width={3} height={6} rx={0.6} />
          <line x1={11} y1={3.5} x2={11} y2={15.5} />
          <rect x={9.5} y={5.5} width={3} height={7} rx={0.6} />
          <line x1={16} y1={6.5} x2={16} y2={18.5} />
          <rect x={14.5} y={9.5} width={3} height={6} rx={0.6} />
        </svg>
      </Tile>
    ),
  },
  {
    id: "research",
    label: "Research",
    icon: (
      <Tile>
        <svg width={18} height={18} viewBox="0 0 22 22" {...glyph}>
          <circle cx={10} cy={10} r={5.5} />
          <line x1={14} y1={14} x2={18} y2={18} />
          <path d="M7.5 11.5 L 9.2 9.6 L 10.6 10.8 L 12.5 8.4" />
        </svg>
      </Tile>
    ),
  },
  {
    id: "wallet",
    label: "Wallet",
    icon: (
      <Tile>
        <svg width={18} height={18} viewBox="0 0 22 22" {...glyph}>
          <path d="M4.5 7.5 h11.5 a1.5 1.5 0 0 1 1.5 1.5 v7 a1.5 1.5 0 0 1 -1.5 1.5 h-10 a1.5 1.5 0 0 1 -1.5 -1.5 z" />
          <path d="M4.5 7.5 V 6.5 a1.5 1.5 0 0 1 1.5 -1.5 h8" />
          <circle cx={14.5} cy={12.5} r={1} />
        </svg>
      </Tile>
    ),
  },
  {
    id: "copilot",
    label: "Copilot",
    icon: (
      <Tile>
        <svg width={18} height={18} viewBox="0 0 22 22" {...glyph}>
          <path d="M11 3.5 C 11.6 8, 14 10.4, 18.5 11 C 14 11.6, 11.6 14, 11 18.5 C 10.4 14, 8 11.6, 3.5 11 C 8 10.4, 10.4 8, 11 3.5 Z" />
        </svg>
      </Tile>
    ),
  },
  {
    id: "alerts",
    label: "Alerts",
    icon: (
      <Tile>
        <svg width={18} height={18} viewBox="0 0 22 22" {...glyph}>
          <path d="M6 15 V 10 a5 5 0 0 1 10 0 V 15 l1.3 1.3 H 4.7 Z" />
          <path d="M9.3 18.5 a1.9 1.9 0 0 0 3.4 0" />
        </svg>
      </Tile>
    ),
  },
]

const MENU_ITEM =
  "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] text-foreground/80 outline-none transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground focus-visible:bg-foreground/[0.05]"

/** the popover fill (spec 14.6): 6% foreground over the page */
const POPOVER_BG = "var(--tip-fill, color-mix(in srgb, var(--foreground) 6%, var(--background)))"

function DockItem({
  mouseX,
  reduce,
  label,
  hovered,
  active = false,
  onEnter,
  onClick,
  children,
}: {
  mouseX: MotionValue<number>
  reduce: boolean
  label: string
  hovered: boolean
  active?: boolean
  onEnter: () => void
  onClick?: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const dist = useTransform(mouseX, (x: number) => {
    const r = ref.current?.getBoundingClientRect()
    return r ? x - (r.x + r.width / 2) : FAR
  })
  // authentic macOS magnification: a raised-cosine bell over the influence
  // window, not a linear tent — neighbors ease in/out of the peak
  const raw = useTransform(dist, (d: number) => {
    const t = Math.min(1, Math.abs(d) / RADIUS)
    return REST + (PEAK - REST) * ((1 + Math.cos(Math.PI * t)) / 2)
  })
  const size = useSpring(raw, { mass: 0.1, stiffness: 240, damping: 18 })
  // macOS click bounce — the icon hops off the tray floor and settles back
  const bounce = useAnimationControls()
  const click = () => {
    if (!reduce) void bounce.start({ y: [0, -12, 0], transition: { duration: 0.4, ease: EASE } })
    onClick?.()
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onPointerEnter={onEnter}
      onFocus={onEnter}
      onClick={click}
      className="relative flex flex-col items-center outline-none"
    >
      <motion.span
        animate={bounce}
        style={{ width: reduce ? REST : size, height: reduce ? REST : size, filter: ICON_SHADOW }}
        className="relative z-10 block overflow-hidden rounded-[10px]"
      >
        {children}
      </motion.span>
      {/* running-app dot — macOS marks the active tool under its icon */}
      {active && (
        <span
          aria-hidden
          className="absolute -bottom-[1px] left-1/2 z-10 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-foreground/80 shadow-[0_0_4px_var(--card-shadow,rgba(0,0,0,calc(0.3*var(--shadow-k,1))))]"
        />
      )}
      <AnimatePresence>
        {hovered && (
          <motion.span
            initial={{ opacity: 0, y: 10, scaleY: 0.5, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scaleY: 1, x: "-50%" }}
            exit={{ opacity: 0, y: 10, scaleY: 0.5, x: "-50%" }}
            transition={{ duration: 0.22, ease: EASE }}
            style={{ transformOrigin: "bottom center", background: POPOVER_BG }}
            className="pointer-events-none absolute -top-9 left-1/2 z-20 whitespace-nowrap rounded-full border border-foreground/[0.08] px-2.5 py-1 text-[11px] text-foreground/90"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

/**
 * macOS-style magnifying command dock — cursor-driven icon springs, click
 * bounce, running-app dots, and a ⌘K command menu.
 * 2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
 */
export function MacOsDock({
  items = DEFAULT_ITEMS,
  activeIds = [],
  onSelect,
  onCommand,
  className,
}: {
  items?: DockApp[]
  /** tools marked with the macOS running-app dot */
  activeIds?: string[]
  onSelect?: (item: DockApp) => void
  /** the ⌘K slot was pressed (the menu opens or shuts) */
  onCommand?: () => void
  className?: string
}) {
  const reduce = !!useReducedMotion()
  const mouseX = useMotionValue(FAR)
  const [hovered, setHovered] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const copyTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const close = (refocus = false) => {
    setMenuOpen(false)
    if (refocus) slotRef.current?.querySelector("button")?.focus()
  }
  const run = (it: DockApp) => {
    onSelect?.(it)
    close(true)
  }
  const copyLink = () => {
    const done = () => {
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      // the tick holds a beat so it is read, then the menu shuts
      copyTimer.current = window.setTimeout(() => {
        setCopied(false)
        close(true)
      }, 700)
    }
    const href = typeof location !== "undefined" ? location.href : ""
    navigator.clipboard?.writeText(href).then(done, done) ?? done()
  }

  /* while the menu is open: Escape shuts it, 1 to 9 pick a tool, a press outside shuts it */
  useEffect(() => {
    if (!menuOpen) return
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true)
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= Math.min(9, items.length)) run(items[n - 1])
    }
    const down = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    window.addEventListener("keydown", key)
    window.addEventListener("pointerdown", down)
    return () => {
      window.removeEventListener("keydown", key)
      window.removeEventListener("pointerdown", down)
    }
  })

  return (
    <div
      ref={rootRef}
      onPointerMove={(e) => {
        if (!reduce && e.pointerType !== "touch") mouseX.set(e.clientX)
      }}
      onPointerLeave={() => {
        mouseX.set(FAR)
        setHovered(null)
      }}
      /* 22 = the icons' 10px corner + the 12px pad (spec 13.10) */
      className={cn("relative flex items-end gap-2 rounded-[22px] p-3", className)}
      style={{
        /* flat (his call, 2026-10-02): one 7% fill, a hairline, and a light short shadow; the
           gradient, the lit top edge and the specular streak are gone */
        background: "color-mix(in srgb, var(--foreground) 7%, var(--background))",
        boxShadow: [
          "0 0 0 1px var(--light-outline, color-mix(in srgb, var(--foreground) 6%, transparent))",
          "0 4px 12px -6px rgba(0,0,0,calc(0.2 * var(--shadow-k, 1)))",
        ].join(", "),
      }}
    >
      {items.map((it) => (
        <DockItem
          key={it.id}
          mouseX={mouseX}
          reduce={reduce}
          label={it.label}
          hovered={hovered === it.id}
          active={activeIds.includes(it.id)}
          onEnter={() => setHovered(it.id)}
          onClick={() => onSelect?.(it)}
        >
          {it.icon}
        </DockItem>
      ))}

      <div className="mx-1 h-8 w-px self-center bg-foreground/[0.08]" />

      <div ref={slotRef} className="contents">
        <DockItem
          mouseX={mouseX}
          reduce={reduce}
          label="Command menu"
          hovered={hovered === "⌘K" && !menuOpen}
          onEnter={() => setHovered("⌘K")}
          onClick={() => {
            setMenuOpen((o) => !o)
            onCommand?.()
          }}
        >
          <span className="flex h-full w-full items-center justify-center">
            {/* same icon grid as the tiles — a full-bleed plate here read a fifth
                larger than the app artwork beside it */}
            <span
              className={cn("flex items-center justify-center rounded-[22%] text-[12px] text-foreground/70", RAISED)}
              style={{ width: PLATE, height: PLATE }}
            >
              ⌘K
            </span>
          </span>
        </DockItem>
      </div>

      {/* ⌘K command menu — a quiet sheet floating above the dock's right end */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            role="menu"
            aria-label="Commands"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
            style={{
              transformOrigin: "bottom right",
              background: POPOVER_BG,
              boxShadow: "0 8px 24px var(--card-shadow, rgba(0,0,0,0.35))",
            }}
            /* the popover: 12 = the items' 8 + the 4px pad */
            className="absolute bottom-full right-0 z-30 mb-3 w-[190px] rounded-[12px] border border-foreground/[0.08] p-1"
          >
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                role="menuitem"
                onClick={() => run(it)}
                className={MENU_ITEM}
              >
                {it.label}
                {i < 9 && <span className="text-[10.5px] tabular-nums text-foreground/45">{i + 1}</span>}
              </button>
            ))}
            <div className="mx-2.5 my-1 h-px bg-foreground/[0.05]" />
            <button type="button" role="menuitem" onClick={copyLink} className={MENU_ITEM}>
              {copied ? "Copied" : "Copy link"}
              {copied && <Check className="h-3 w-3 text-foreground/90" strokeWidth={2.2} aria-hidden />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

