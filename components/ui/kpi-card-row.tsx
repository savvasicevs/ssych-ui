// provenance: original
"use client"

import { useEffect, useId, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useInView, useIsPresent, useReducedMotion } from "motion/react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { ICON_BUTTON, SURFACE } from "@/components/ui/control-classes"
import { LiveFigure } from "@/components/ui/live-figure"
import { popupHost, scrimStyle } from "@/components/ui/popup-host"
import { ScrubLine } from "@/components/ui/scrub-line"

/* KPI Card Row, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card, outline or inner shadow around each metric: three columns on the page
   · the line is ink; only the change carries colour, green for a gain and red for a loss
     (it was blue, green and amber by position)
   · the value no longer counts up: the number is there to be read at once, and the count
     re-rendered the card sixty times a second
   · pointing at the line puts that point's value and date where the headline is, as plain
     text, so nothing floats over the chart
   · each chart names itself to a screen reader
   Motion (2026-10-01): once a column is in view its line and fill sweep in left to right
   through one clip, 50ms apart per column, landed by 0.9s (they drew on mount, off screen
   too); a new series morphs the line and the fill in place
   2026-10-02 audit: per his Stat Tile call each metric sits on its own surface card (7%
   foreground over the background, 12px padding, corner 18: the inner card of the card
   scale, 24 outside = 18 + the 6px gap), 6px apart, 152px each, so the row is 468px, the
   same width as Stat Tile, its family; the preview's zoom hack is gone. The figure swaps
   once as the pointer takes the line and once as it lets go, and moves at once in between
   (LiveFigure), where it replayed the swap on every step. The change is worked out from
   the series and names its window ("since Feb 24") on its own 12px sub line in its hue; a
   hand-written `delta` is still honoured when passed. Label 12px /45.
   Formulas:
   · headline  data[n − 1], or the pointed point's value while scrubbing
   · change    (data[n − 1] ÷ data[0] − 1) × 100 in percent, or data[n − 1] − data[0] in
               points when `diff` is "points" (metrics that are already a percent);
               the caller's `delta` string when one is passed
   · window    from labels[0] to the last point
   2026-10-02 round 2: his notes. The chart runs to the card's edges: no side padding and
   none under it, the card's 18px corner clips it (the plot is the card's full 152px). The
   window on the sub line is just the start date, "Feb 24", where it read "since Feb 24".
   2026-11-10, with Stat Tile's zoom: with `expandable`, a press on a card (a click, Enter
   or Space; the card carries a real button) grows it out of its own place into a large view
   of the same metric. The card's box, its label and its figure are shared elements, so the
   box zooms from the card to the view over 350ms on the house expo-out while the label and
   the figure ride along and grow; the rest (the close button, the change, the line drawn
   large with its dates along the axis and its high and low) fades in 80ms behind the box.
   Escape, the close button or a press on the dim ground closes it: the details go in 80ms
   and the box folds back into the card in 220ms, quicker than it came. Focus moves to the
   close button and comes back to the card. The same scrub works on the large line (and
   the arrow keys step it). Reduced motion, or a card drawn inside a scaled preview box: a
   crossfade, no growth. The view reads only what the card already has.
   Formulas in the view: high = max(data), low = min(data); the figure, the change and the
   window are the card's. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export type KpiItem = {
  label: string
  /** the metric's real series, in its own unit; the last point is the headline */
  data: number[]
  /** formats the headline and the hover readout */
  format?: (v: number) => string
  /** a hand-written signed change, written with + or −; unpassed it is worked out from `data` */
  delta?: string
  /** with `delta`: false marks the change as a loss (red), a gain is green; a worked-out
   *  change takes its colour from its sign */
  up?: boolean
  /** how the worked-out change is measured: a percent of the first point, or a plain difference */
  diff?: "percent" | "points"
}

export interface KpiCardRowProps {
  /** one column per metric */
  items?: KpiItem[]
  /** what each sample point is called, read out while pointing at it */
  labels?: string[]
  /** a press on a card opens a large view of its metric, grown out of the card; off by default */
  expandable?: boolean
  className?: string
}

const DEFAULT_ITEMS: KpiItem[] = [
  { label: "Requests", format: (v) => `${v.toFixed(1)}M`, data: [1.6, 1.7, 1.75, 1.9, 2.0, 2.1, 2.15, 2.25, 2.35, 2.4] },
  { label: "Accuracy", format: (v) => `${v.toFixed(1)}%`, diff: "points", data: [96.4, 96.8, 96.6, 97.2, 97.5, 97.8, 98.0, 98.1, 98.3, 98.4] },
  { label: "Uptime", format: (v) => `${v.toFixed(2)}%`, diff: "points", data: [99.98, 99.97, 99.98, 99.96, 99.97, 99.95, 99.94, 99.95, 99.93, 99.92] },
]

const DEFAULT_LABELS = ["Feb 24", "Mar 3", "Mar 10", "Mar 17", "Mar 24", "Mar 31", "Apr 7", "Apr 14", "Apr 21", "Apr 28"]

/** the chart's width: the card's full 152px, edge to edge (round 2) */
const W = 152
const H = 52
const TOP = 6
/** room under the lowest point, so the corner's curve does not cut the line */
const BOT = 8

const fallbackFormat = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1))

/* the box grows out of the card on the house expo-out over the settle length (0.35s), and
   folds back quicker: Stat Tile's zoom, the same values. Not the 400/32 layout spring: at
   this size its overshoot is a visible bounce, and the spec says never overshoot */
const OPEN = { duration: 0.35, ease: EASE } as const
const CLOSE = { duration: 0.22, ease: EASE } as const

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** the figures a card reads, shared by the card and its large view (formulas above) */
function measure(item: KpiItem, labels: string[]) {
  const data = item.data.length ? item.data : [0]
  const format = item.format ?? fallbackFormat
  const last = data.length - 1
  const max = Math.max(...data)
  const min = Math.min(...data)
  /* the change: the caller's string when given, else worked out from the series */
  const points = item.diff === "points"
  const worked = points ? data[last] - data[0] : data[0] ? (data[last] / data[0] - 1) * 100 : 0
  const delta = item.delta ?? `${worked >= 0 ? "+" : "−"}${Math.abs(worked).toFixed(points ? 2 : 1)}${points ? " pt" : "%"}`
  const hue = (item.delta ? item.up !== false : worked >= 0) ? GREEN : RED
  /** the window, just its start date (round 2: "since" made it too long) */
  const since = labels[0] ?? ""
  return { data, format, last, max, min, delta, hue, since }
}

function Kpi({
  item,
  labels,
  index,
  expandable,
  open,
  shared,
  onOpen,
  triggerRef,
}: {
  item: KpiItem
  labels: string[]
  index: number
  expandable: boolean
  /** this card's large view is up */
  open: boolean
  /** the layoutId namespace this card shares with its view; null when nothing is shared */
  shared: string | null
  onOpen: () => void
  triggerRef: (el: HTMLButtonElement | null) => void
}) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const boxRef = useRef<HTMLDivElement>(null)
  const [hi, setHi] = useState<number | null>(null)
  /* the entrance plays once, when a third of the column is in view; reduced motion lands at once */
  const rootRef = useRef<HTMLDivElement>(null)
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const play = !!reduced || seen
  /** a change of data glides between the two states */
  const morph = reduced ? { duration: 0 } : { duration: 0.35, ease: EASE }

  const { data, format, last, max, min, delta, hue, since } = measure(item, labels)
  const span = Math.max(1e-6, max - min)
  const x = (i: number) => (i / Math.max(1, last)) * W
  const y = (v: number) => TOP + (1 - (v - min) / span) * (H - TOP - BOT)
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ")
  const area = `${line} L ${W} ${H} L 0 ${H} Z`

  const onMove = (e: React.PointerEvent) => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setHi(Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / r.width) * last))))
  }

  const shown = hi ?? last
  /** with a shared box, the parts that are not shared ride along undistorted while it folds back */
  const carry = shared ? true : undefined

  return (
    /* corner 13.5: the inner card of the card scale (18 outside = 13.5 + the 4.5px gap) */
    <motion.div
      ref={rootRef}
      /* the box the large view grows out of and folds back into */
      layoutId={shared ? `${shared}-box` : undefined}
      transition={{ layout: CLOSE }}
      className={cn("w-[152px] shrink-0 overflow-hidden rounded-[13.5px] p-3", SURFACE, expandable && "relative")}
      /* the radius as a style too, so the shared box's corner stays round while it scales */
      style={shared ? { borderRadius: 13.5 } : undefined}
    >
      {/* the card's press: a real button laid over the card's figures and under its line (the
          line keeps its scrub and opens on a click too); its focus line sits on the card's own edge */}
      {expandable && (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${item.label}, ${format(data[last])}, ${delta}${since ? ` since ${since}` : ""}, open the large view`}
          onClick={onOpen}
          className="absolute inset-0 z-[1] cursor-pointer rounded-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground/20"
        />
      )}
      <motion.div layoutId={shared ? `${shared}-label` : undefined} transition={{ layout: CLOSE }} className={cn("text-[12px] text-foreground/45", shared && "w-fit max-w-full")}>
        {item.label}
      </motion.div>
      <div role="status" className="mt-2">
        {/* the figure swaps once as the line is taken and once as it is let go (4px, 2px
            blur, 150ms); along the line it moves at once */}
        {/* w-fit: the shared figure's box is as wide as the figure, so it scales evenly as it grows */}
        <motion.div layoutId={shared ? `${shared}-value` : undefined} transition={{ layout: CLOSE }} className={cn(shared && "w-fit max-w-full")}>
          <LiveFigure intent={hi === null ? null : "scrub"} className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
            {format(data[shown])}
          </LiveFigure>
        </motion.div>
        {/* the sub line swaps with the figure, so the change and the point's date never snap */}
        <motion.div layout={carry} transition={{ layout: CLOSE }}>
          <LiveFigure intent={hi === null ? null : "scrub"} className="mt-2 flex h-[15px] items-baseline gap-1.5 truncate text-[12px] leading-[15px]">
            {hi === null ? (
              <>
                <span className="font-medium" style={{ color: hue }}>
                  {delta}
                </span>
                <span className="text-foreground/45">{since}</span>
              </>
            ) : (
              <span className="text-foreground/45">{labels[hi] ?? ""}</span>
            )}
          </LiveFigure>
        </motion.div>
      </div>

      <motion.div layout={carry} transition={{ layout: CLOSE }} className="-mx-3 -mb-3 mt-3">
        <div
          ref={boxRef}
          className={cn("relative", expandable && "z-[2] cursor-pointer")}
          onPointerMove={onMove}
          onPointerLeave={() => setHi(null)}
          onClick={expandable ? onOpen : undefined}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full overflow-visible"
            fill="none"
            role="img"
            aria-label={`${item.label}, ${format(data[last])} now, ${delta}${since ? ` since ${since}` : ""}`}
          >
            <defs>
              <linearGradient id={`kpi-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.1" />
                <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
              </linearGradient>
              {/* the line and its fill sweep in left to right, a few px wider than the plot for the round caps */}
              <clipPath id={`kpi-reveal-${uid}`}>
                <motion.rect
                  x={-4}
                  y={-4}
                  height={H + 8}
                  initial={reduced ? false : { width: 0 }}
                  animate={{ width: play ? W + 8 : 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.8, ease: EASE, delay: index * 0.05 }}
                />
              </clipPath>
            </defs>
            <g clipPath={`url(#kpi-reveal-${uid})`}>
              <motion.path fill={`url(#kpi-${uid})`} initial={false} animate={{ d: area }} transition={morph} />
              <motion.path
                stroke="var(--foreground)"
                strokeOpacity={0.9}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                animate={{ d: line }}
                transition={morph}
              />
            </g>
            {hi !== null && (
              <g pointerEvents="none">
                <line x1={x(hi)} y1={0} x2={x(hi)} y2={H} stroke="var(--foreground)" strokeOpacity={0.28} strokeWidth="1" />
                <circle cx={x(hi)} cy={y(data[hi])} r="2.5" fill="var(--foreground)" />
              </g>
            )}
          </svg>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** The large view of one card: the same figure larger, its line drawn large with its dates
 *  along the axis and its high and low on the right, read point by point with the same scrub. */
function KpiView({
  item,
  labels,
  shared,
  host,
  onClose,
}: {
  item: KpiItem
  labels: string[]
  shared: string | null
  /** where the view is drawn: the page's body, or the preview box the row sits in */
  host: HTMLElement
  onClose: () => void
}) {
  const reduced = useReducedMotion()
  const titleId = useId()
  /* on its way out the view takes no more presses: a fading ground must not eat a click */
  const present = useIsPresent()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [hi, setHi] = useState<number | null>(null)
  const { data, format, last, max, min, delta, hue, since } = measure(item, labels)

  /* focus goes in, and the page under the view holds still while it is up */
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
    /* a view drawn inside a preview box leaves the page's scroll alone */
    if (host !== host.ownerDocument.body) return
    const html = host.ownerDocument.documentElement
    const prev = { overflow: html.style.overflow, paddingRight: html.style.paddingRight }
    /* the scrollbar's width is given back as padding, so the page (and the card the view
       grows out of) does not shift sideways as the scrollbar goes */
    const bar = (host.ownerDocument.defaultView?.innerWidth ?? html.clientWidth) - html.clientWidth
    html.style.overflow = "hidden"
    if (bar > 0) html.style.paddingRight = `${bar}px`
    return () => {
      html.style.overflow = prev.overflow
      html.style.paddingRight = prev.paddingRight
    }
  }, [host])

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    } else if (e.key === "Tab") {
      /* the close button is the one stop inside the view, so Tab stays on it */
      e.preventDefault()
      closeRef.current?.focus()
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      const step = e.key === "ArrowLeft" ? -1 : 1
      setHi((h) => clamp((h ?? last) + step, 0, last))
    }
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
    <div className={cn("fixed inset-0 z-[80] tabular-nums", !present && "pointer-events-none")} style={scrimStyle(host)} onKeyDown={onKey}>
      {/* the dim ground: a press on it closes the view */}
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
        /* corner 18, the outer card of the card scale (the cards in the row are 13.5); the
           radius as a style so it holds while the box scales */
        className={cn("absolute inset-0 m-auto flex h-fit max-h-[calc(100%-32px)] w-[min(720px,calc(100%-32px))] flex-col overflow-hidden p-6 text-foreground", SURFACE)}
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
              {format(data[hi ?? last])}
            </LiveFigure>
          </motion.div>
          <motion.div layout={carry} {...fade}>
            <LiveFigure intent={hi === null ? null : "scrub"} className="mt-3 flex h-[18px] items-baseline gap-1.5 text-[13px] leading-[18px]">
              {hi === null ? (
                <>
                  <span className="font-medium" style={{ color: hue }}>
                    {delta}
                  </span>
                  {since && <span className="text-foreground/45">since {since}</span>}
                </>
              ) : (
                <span className="text-foreground/45">{labels[hi] ?? ""}</span>
              )}
            </LiveFigure>
          </motion.div>
        </div>

        <motion.div layout={carry} {...fade} className="mt-6">
          <ScrubLine
            data={data}
            format={format}
            hi={hi}
            onHi={setHi}
            fill
            height={200}
            levels={[
              { name: "High", value: max },
              { name: "Low", value: min },
            ]}
            axis={data.map((_, i) => labels[i] ?? null)}
            label={`${item.label} over ${data.length} points, from ${format(data[0])} to ${format(data[last])}, high ${format(max)}, low ${format(min)}`}
          />
        </motion.div>
      </motion.div>
    </div>
  )
}

/**
 * A row of metric cards: the value, its signed change and the line it came from. Pointing
 * at a line reads any point in place of the headline, with its date. With `expandable`, a
 * press grows a card out of its own place into a large view of the same metric.
 */
export function KpiCardRow({ items = DEFAULT_ITEMS, labels = DEFAULT_LABELS, expandable = false, className }: KpiCardRowProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  /* the view is drawn into the page's body, or into the preview box the row sits in
     (ui/popup-host.ts), once there is one (never on the server) */
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => setHost(expandable ? popupHost(root.current) : null), [expandable])
  const triggers = useRef<(HTMLButtonElement | null)[]>([])

  const close = () => {
    const i = open
    setOpen(null)
    /* focus comes back to the card it opened from */
    if (i !== null) triggers.current[i]?.focus({ preventScroll: true })
  }
  /* a preview box scales what it holds, which a shared box cannot be measured through:
     there the view crossfades, as it does under reduced motion */
  const boxed = !!host && host.hasAttribute("data-popup-root")
  const sharedOf = (i: number) => (expandable && !reduced && !boxed ? `${uid}-${i}` : null)

  return (
    <div ref={root} className={cn("flex w-[468px] max-w-full flex-wrap items-start gap-1.5 tabular-nums", className)}>
      {items.map((item, i) => (
        <Kpi
          key={item.label}
          item={item}
          labels={labels}
          index={i}
          expandable={expandable}
          open={open === i}
          shared={sharedOf(i)}
          onOpen={() => setOpen(i)}
          triggerRef={(el) => {
            triggers.current[i] = el
          }}
        />
      ))}
      {expandable &&
        host &&
        createPortal(
          <AnimatePresence>
            {open !== null && items[open] && <KpiView key={open} item={items[open]} labels={labels} shared={sharedOf(open)} host={host} onClose={close} />}
          </AnimatePresence>,
          host,
        )}
    </div>
  )
}
