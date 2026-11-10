// provenance: original
"use client"

import { useEffect, useId, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { ICON_BUTTON, SURFACE } from "@/components/ui/control-classes"
import { LiveFigure } from "@/components/ui/live-figure"

/* Stat Tile, new through ssych-component (2026-09-29).
   What it is for: one metric in the least room it can take: label, value, signed change and,
   when there is a series, a tiny line. 152px a tile, three in a row by default.
   Read first: the value. The change under it is the only colour.
   The pointer: pointing at a tile (or tabbing to it) dims the others. Moving across a tile
   that has a line reads that point: the value swaps to it and the change gives way to the
   point's label. Arrow keys walk the points.
   Sketch: lab/StatTile. Kept label, value, signed change and the optional line under them.
   The card, the count-up, the delta pill with its arrow, the info icon, the capacity meter
   and the full-bleed filled chart are gone.
   Against ui/kpi-card-row: this is the compact form at the same width, a 17px value
   against 22 and a 20px line with no area fill against a 48px filled chart.
   2026-10-02 audit: his call, each tile now sits in a box with the background: the surface
   step (7% foreground over the background), 12px padding, corner 18 (the inner card of the
   card scale: 24 outside, 18 inside at a 6px gap), tiles 6px apart. Tiles are 152px, so the
   row is 468px, the same width as KPI Card Row, its family. The value no longer replays its
   swap on every scrub step: it swaps once as the pointer (or the arrow keys) takes the line
   and once as it lets go, and moves at once in between (LiveFigure). Label 12px /45, the
   change 11px font-medium in its hue.
   Formulas:
   · value  = data[n − 1] when a series is given, else `value`
   · change = (data[n − 1] / data[0] − 1) × 100 in percent, or data[n − 1] − data[0] in
              points when `diff` is "points" (for metrics that are already a percent);
              with no series it is the `change` given
   2026-10-02 round 2: his note, the chart fills its container. The line runs the tile's
   full 152px, edge to edge, and sits on the tile's bottom edge with no padding under it (the
   18px corner clips it; the lowest point keeps 7px of room so the curve never cuts it). The
   focus ring sits on the tile's own edge, inset, in ink.
   2026-11-10, his note: "you click on the tile and then it goes full screen, it zooms in".
   With `expandable`, a click (or Enter or Space) opens the tile into a full screen view that
   grows out of the tile itself: the tile's box, its label and its value are shared elements
   (layoutId), so the box zooms from the tile's rect to the screen over 350ms on the house expo-out
   while the label and the value ride along and grow. The rest of the view (the
   close button, the change, the line drawn large, Start, High and Low) fades in 80ms behind
   the box. Escape, the close button or a click on the dim ground closes it: the details
   go in 80ms and the box folds back into the tile in 220ms, quicker than it came. Focus
   moves to the close button and comes back to the tile. Reduced motion: a crossfade only.
   The view reads only what the tile already has: its series, its labels and the figures
   derived from them.
   Formulas in the view: start = data[0], high = max(data), low = min(data); the value and
   the change are the tile's. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export interface StatTileItem {
  label: string
  /** the metric's series, oldest first; the last point is the value shown */
  data?: number[]
  /** the value when there is no series */
  value?: number
  /** the change when there is no series, in the unit `diff` names */
  change?: number
  /** how the change is measured: a percent of the first point, or a plain difference */
  diff?: "percent" | "points"
  format?: (v: number) => string
}

export interface StatTileProps {
  /** one tile per metric */
  items?: StatTileItem[]
  /** what each sample point is called, read out while pointing at it */
  labels?: string[]
  /** a click (or Enter or Space) on a tile opens it full screen; off by default */
  expandable?: boolean
  className?: string
}

const DEFAULT_ITEMS: StatTileItem[] = [
  { label: "Net P&L", format: (v) => `$${Math.round(v).toLocaleString("en-US")}`, data: [11510, 11620, 11480, 11760, 11900, 11840, 12120, 12260, 12310, 12480] },
  { label: "Win rate", format: (v) => `${v.toFixed(1)}%`, diff: "points", data: [56.1, 56.4, 56.0, 56.9, 57.2, 57.0, 57.6, 57.9, 58.1, 58.3] },
  { label: "Sharpe ratio", format: (v) => v.toFixed(2), data: [2.08, 2.05, 2.1, 2.04, 2.0, 2.02, 1.97, 1.95, 1.94, 1.92] },
]

const DEFAULT_LABELS = ["Feb 24", "Mar 3", "Mar 10", "Mar 17", "Mar 24", "Mar 31", "Apr 7", "Apr 14", "Apr 21", "Apr 28"]

/** the line's width: the tile's full 152px, edge to edge (round 2) */
const W = 152
const H = 30
/** room above the highest point */
const TOP = 3
/** room under the lowest point, so the corner's curve does not cut the line */
const BOT = 7

/* the box grows out of the tile on the house expo-out over the settle length (0.35s), and folds
   back quicker. Not the 400/32 layout spring: at this size its 1% overshoot is an 8px bounce,
   and the spec says never overshoot */
const OPEN = { duration: 0.35, ease: EASE } as const
const CLOSE = { duration: 0.22, ease: EASE } as const

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const fallbackFormat = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2))

/** the figures a tile reads, shared by the tile and its full screen view (formulas above) */
function measure(item: StatTileItem) {
  const data = item.data && item.data.length ? item.data : null
  const format = item.format ?? fallbackFormat
  const last = data ? data.length - 1 : 0
  const now = data ? data[last] : (item.value ?? 0)
  const points = item.diff === "points"
  const change = data ? (points ? data[last] - data[0] : data[0] ? (data[last] / data[0] - 1) * 100 : 0) : item.change
  const signed = change == null ? "" : `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(points ? 1 : 2)}${points ? " pt" : "%"}`
  return { data, format, last, now, change, signed }
}

function Tile({
  item,
  labels,
  index,
  dim,
  onHot,
  expandable,
  open,
  shared,
  onOpen,
  tileRef,
}: {
  item: StatTileItem
  labels: string[]
  index: number
  dim: boolean
  onHot: (on: boolean) => void
  expandable: boolean
  /** this tile's full screen view is up */
  open: boolean
  /** the layoutId namespace this tile shares with its view; null when nothing is shared */
  shared: string | null
  onOpen: () => void
  tileRef: (el: HTMLDivElement | null) => void
}) {
  const reduced = useReducedMotion()
  const [hi, setHi] = useState<number | null>(null)

  const { data, format, last, now, change, signed } = measure(item)

  const max = data ? Math.max(...data) : 1
  const min = data ? Math.min(...data) : 0
  const span = Math.max(1e-6, max - min)
  const x = (i: number) => (i / Math.max(1, last)) * W
  const y = (v: number) => TOP + (1 - (v - min) / span) * (H - TOP - BOT)
  const line = data ? data.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ") : ""

  const shown = hi ?? last
  const value = data ? data[shown] : now

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!data) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHi(clamp(Math.round((px / W) * last), 0, last))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (expandable && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault()
      onOpen()
      return
    }
    if (!data) return
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0
    if (step) {
      e.preventDefault()
      setHi(clamp((hi ?? last) + step, 0, last))
    } else if (e.key === "Escape") setHi(null)
  }
  const leave = () => {
    setHi(null)
    onHot(false)
  }

  return (
    <motion.div
      ref={tileRef}
      role={expandable ? "button" : "group"}
      tabIndex={0}
      aria-haspopup={expandable ? "dialog" : undefined}
      aria-expanded={expandable ? open : undefined}
      aria-label={`${item.label}, ${format(now)}${signed ? `, ${signed}` : ""}${expandable ? ", opens full screen" : ""}`}
      onPointerEnter={() => onHot(true)}
      onPointerMove={onMove}
      onPointerLeave={leave}
      onFocus={() => onHot(true)}
      onBlur={leave}
      onKeyDown={onKey}
      onClick={expandable ? onOpen : undefined}
      /* the box the full screen view grows out of and folds back into */
      layoutId={shared ? `${shared}-box` : undefined}
      /* with a shared box the dim runs through motion too, so it never fights the
         crossfade motion gives the box while it is handed to and from the view */
      animate={shared ? { opacity: dim ? 0.45 : 1 } : undefined}
      transition={{ layout: CLOSE, opacity: { duration: 0.2, ease: EASE } }}
      /* corner 13.5: the tile's own corner at 75% roundness, set as a style so it holds while the box scales */
      className={cn(
        "w-[152px] shrink-0 touch-none overflow-hidden rounded-[13.5px] p-3 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground/20",
        SURFACE,
        data ? "cursor-crosshair" : expandable && "cursor-pointer",
        !reduced && !shared && "transition-opacity duration-200",
      )}
      /* the radius as a style, so the shared box's corner stays round while it scales */
      style={shared ? { borderRadius: 13.5 } : { opacity: dim ? 0.45 : 1, borderRadius: 13.5 }}
    >
      <motion.div layoutId={shared ? `${shared}-label` : undefined} transition={{ layout: CLOSE }} className="w-fit max-w-full truncate text-[12px] text-foreground/45">
        {item.label}
      </motion.div>
      <div role="status" className="mt-1.5">
        {/* the value swaps once as the line is taken and once as it is let go (4px, 2px blur,
            150ms); along the line it moves at once */}
        {/* w-fit: the shared value box is as wide as its figure, so it scales evenly as it grows */}
        <motion.div layoutId={shared ? `${shared}-value` : undefined} transition={{ layout: CLOSE }} className="w-fit max-w-full">
          <LiveFigure intent={hi === null ? null : "scrub"} className="truncate text-[17px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
            {format(value)}
          </LiveFigure>
        </motion.div>
        {/* the line under it swaps with the value, so the change and the point's label never snap */}
        <motion.div layout={shared ? true : undefined} transition={{ layout: CLOSE }}>
          <LiveFigure intent={hi === null ? null : "scrub"} className="mt-1.5 h-[14px] truncate text-[11px] leading-[14px]">
            {hi !== null ? (
              <span className="text-foreground/45">{labels[hi] ?? ""}</span>
            ) : signed ? (
              <span className="font-medium" style={{ color: (change ?? 0) >= 0 ? GREEN : RED }}>
                {signed}
              </span>
            ) : null}
          </LiveFigure>
        </motion.div>
      </div>

      {data && (
        <motion.div layout={shared ? true : undefined} transition={{ layout: CLOSE }} className="-mx-3 -mb-3 mt-2">
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="block max-w-none"
            fill="none"
            role="img"
            aria-label={`${item.label} over ${data.length} points, from ${format(data[0])} to ${format(data[last])}`}
          >
            <motion.path
              d={line}
              stroke="var(--foreground)"
              strokeOpacity={0.9}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: index * 0.035 }}
            />
            {hi !== null && <circle cx={x(hi)} cy={y(data[hi])} r={2.2} fill="var(--foreground)" pointerEvents="none" />}
          </svg>
        </motion.div>
      )}
    </motion.div>
  )
}

/* the view's line, drawn in a 600 × 200 box stretched to the room it has; strokes keep 1.8px */
const VW = 600
const VH = 200
const VPAD = 12

/** The full screen view of one tile: the same figure larger, its line drawn large and readable
 *  point by point, and the start, high and low of the series. */
function TileView({
  item,
  labels,
  shared,
  onClose,
}: {
  item: StatTileItem
  labels: string[]
  shared: string | null
  onClose: () => void
}) {
  const reduced = useReducedMotion()
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [hi, setHi] = useState<number | null>(null)
  const { data, format, last, now, change, signed } = measure(item)

  /* focus goes in, and the page under the view holds still while it is up */
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
    const html = document.documentElement
    const prev = { overflow: html.style.overflow, paddingRight: html.style.paddingRight }
    /* the scrollbar's width is given back as padding, so the page (and the tile the view
       grows out of) does not shift sideways as the scrollbar goes */
    const bar = window.innerWidth - html.clientWidth
    html.style.overflow = "hidden"
    if (bar > 0) html.style.paddingRight = `${bar}px`
    return () => {
      html.style.overflow = prev.overflow
      html.style.paddingRight = prev.paddingRight
    }
  }, [])

  const max = data ? Math.max(...data) : 1
  const min = data ? Math.min(...data) : 0
  const span = Math.max(1e-6, max - min)
  const vx = (i: number) => (i / Math.max(1, last)) * VW
  const vy = (v: number) => VPAD + (1 - (v - min) / span) * (VH - VPAD * 2)
  const line = data ? data.map((v, i) => `${i === 0 ? "M" : "L"} ${vx(i).toFixed(1)} ${vy(v).toFixed(1)}`).join(" ") : ""
  const value = data && hi !== null ? data[hi] : now

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    } else if (e.key === "Tab") {
      /* the close button is the one stop inside the view, so Tab stays on it */
      e.preventDefault()
      closeRef.current?.focus()
    } else if (data && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault()
      const step = e.key === "ArrowLeft" ? -1 : 1
      setHi((h) => clamp((h ?? last) + step, 0, last))
    }
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!data) return
    const r = e.currentTarget.getBoundingClientRect()
    setHi(clamp(Math.round(((e.clientX - r.left) / r.width) * last), 0, last))
  }

  /* what is not shared fades in behind the growing box, and goes first on the way out */
  const fade = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.08 } }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0, transition: { duration: 0.08 } },
        transition: { opacity: { duration: 0.2, ease: EASE, delay: 0.08 }, layout: OPEN },
      }
  const carry = shared ? true : undefined

  return (
    <div className="fixed inset-0 z-[80] tabular-nums" onKeyDown={onKey}>
      {/* the dim ground: a click on it closes the view */}
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--background)_72%,transparent)]"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ duration: 0.2, ease: EASE }}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        layoutId={shared ? `${shared}-box` : undefined}
        transition={{ layout: OPEN, opacity: { duration: 0.15 } }}
        initial={shared ? undefined : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={shared ? undefined : { opacity: 0, transition: { duration: 0.1 } }}
        /* corner 18, the outer card of the card scale at 75% roundness; the radius as a style so it holds while the box scales */
        className={cn(
          "absolute inset-0 m-auto flex h-[min(520px,calc(100%-32px))] w-[min(720px,calc(100%-32px))] flex-col overflow-hidden p-6",
          SURFACE,
        )}
        style={{ borderRadius: 18 }}
      >
        <div className="flex items-start justify-between gap-4">
          <motion.div id={titleId} layoutId={shared ? `${shared}-label` : undefined} transition={{ layout: OPEN }} className="w-fit min-w-0 truncate text-[13px] text-foreground/45">
            {item.label}
          </motion.div>
          <motion.div layout={carry} {...fade} className="-mr-2 -mt-2">
            <button ref={closeRef} type="button" aria-label="Close" onClick={onClose} className={cn(ICON_BUTTON, "h-8 w-8")}>
              <X size={14} strokeWidth={2} aria-hidden />
            </button>
          </motion.div>
        </div>

        <div role="status" className="mt-2">
          <motion.div layoutId={shared ? `${shared}-value` : undefined} transition={{ layout: OPEN }} className="w-fit max-w-full">
            <LiveFigure intent={hi === null ? null : "scrub"} className="text-[40px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
              {format(value)}
            </LiveFigure>
          </motion.div>
          <motion.div layout={carry} {...fade}>
            <LiveFigure intent={hi === null ? null : "scrub"} className="mt-3 h-[18px] text-[13px] leading-[18px]">
              {hi !== null ? (
                <span className="text-foreground/45">{labels[hi] ?? ""}</span>
              ) : signed ? (
                <span className="font-medium" style={{ color: (change ?? 0) >= 0 ? GREEN : RED }}>
                  {signed}
                  {data && labels[0] && <span className="font-normal text-foreground/45"> since {labels[0]}</span>}
                </span>
              ) : null}
            </LiveFigure>
          </motion.div>
        </div>

        {data && (
          <>
            <motion.div layout={carry} {...fade} className="relative mt-6 min-h-0 flex-1 cursor-crosshair touch-none" onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
              <svg
                viewBox={`0 0 ${VW} ${VH}`}
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
                fill="none"
                role="img"
                aria-label={`${item.label} over ${data.length} points, from ${format(data[0])} to ${format(data[last])}`}
              >
                {[0.25, 0.5, 0.75].map((f) => (
                  <line key={f} x1={0} x2={VW} y1={f * VH} y2={f * VH} stroke="var(--foreground)" strokeOpacity={0.05} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                ))}
                <path d={line} stroke="var(--foreground)" strokeOpacity={hi === null ? 0.9 : 0.45} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {hi !== null && (
                  <line x1={vx(hi)} x2={vx(hi)} y1={0} y2={VH} stroke="var(--foreground)" strokeOpacity={0.16} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                )}
              </svg>
              {/* the pointed point, as a round dot the stretched box cannot squash */}
              {hi !== null && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
                  style={{ left: `${(vx(hi) / VW) * 100}%`, top: `${(vy(data[hi]) / VH) * 100}%`, boxShadow: "0 0 0 1.5px var(--background)" }}
                />
              )}
            </motion.div>
            <motion.div layout={carry} {...fade} className="mt-2 flex justify-between text-[10px] text-foreground/45">
              <span>{labels[0] ?? ""}</span>
              <span>{labels[last] ?? ""}</span>
            </motion.div>
            <motion.dl layout={carry} {...fade} className="mt-5 grid grid-cols-3 gap-4 border-t border-foreground/[0.06] pt-4">
              {[
                ["Start", data[0]],
                ["High", max],
                ["Low", min],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-[11px] text-foreground/45">{k}</dt>
                  <dd className="mt-1 text-[13px] font-medium text-foreground/90">{format(v as number)}</dd>
                </div>
              ))}
            </motion.dl>
          </>
        )}
      </motion.div>
    </div>
  )
}

/**
 * Compact metrics in a row: label, value, signed change and a tiny ink line, each on its
 * own surface, 152px each.
 * Pointing at a tile dims the others; moving across it reads any point of its line in
 * place of the value, with the point's label. With `expandable`, a click opens the tile
 * full screen, grown out of the tile itself.
 */
export function StatTile({ items = DEFAULT_ITEMS, labels = DEFAULT_LABELS, expandable = false, className }: StatTileProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const [hot, setHot] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  /* the view is drawn into the page's body, once there is one (never on the server) */
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(document.body), [])
  const tiles = useRef<(HTMLDivElement | null)[]>([])

  const close = () => {
    const i = open
    setOpen(null)
    /* focus comes back to the tile it opened from */
    if (i !== null) tiles.current[i]?.focus({ preventScroll: true })
  }
  const sharedOf = (i: number) => (expandable && !reduced ? `${uid}-${i}` : null)

  return (
    <div className={cn("flex w-[468px] max-w-full flex-wrap items-start gap-1.5 tabular-nums", className)}>
      {items.map((item, i) => (
        <Tile
          key={item.label}
          item={item}
          labels={labels}
          index={i}
          dim={hot !== null && hot !== i}
          onHot={(on) => setHot((h) => (on ? i : h === i ? null : h))}
          expandable={expandable}
          open={open === i}
          shared={sharedOf(i)}
          onOpen={() => setOpen(i)}
          tileRef={(el) => {
            tiles.current[i] = el
          }}
        />
      ))}
      {expandable &&
        host &&
        createPortal(
          <AnimatePresence>
            {open !== null && items[open] && (
              <TileView key={open} item={items[open]} labels={labels} shared={sharedOf(open)} onClose={close} />
            )}
          </AnimatePresence>,
          host,
        )}
    </div>
  )
}
