"use client"

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* copied from src/components/library/controls.ts, so the file ships alone */
const TRACK = "rounded-full border border-foreground/[0.04] p-0.5"
const THUMB = "bg-foreground/[0.08] shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--foreground)_6%,transparent)]"
const SEGMENT_OFF = "text-foreground/45 hover:text-foreground/75"

/* View Switch, the library shell's part as a primitive (2026-09-30).
   What it is for: the switcher above a preview: Desktop, Mobile, Code, or the sizes of a
   screen. One of the options is on; the rest wait as icons.
   Read first: the option that is on, the only one that shows its name.
   The pointer: an off option's icon brightens under it; a press slides the ONE thumb
   from the option that was on to the one that is, the names fading across on the
   control's 250ms tween. Arrow keys move the choice; Home and End go to the ends.
   Taken from: src/components/library/ViewSwitch.tsx, value for value: the TRACK and the
   THUMB from controls.ts, 32px options (36px with `tall`), the measured fixed width
   (every option as an icon, less one, plus one option at the longest name), the narrow
   fall-back under 640px where no name shows. The device icons are the shell's own
   strokes (ComponentShowcase.tsx) and Code is the Phosphor glyph it imports, inlined here.
   Added: arrow keys, and a default set of options so it renders with no props.
   Motion (2026-09-30): the thumb slides on transform, not `left`, 250ms both ways; a choice
   made with the arrow keys lands at once (keys repeat), only a press gets the tween.
   No figures are derived here. */

export interface ViewOption<T extends string> {
  id: T
  /** what the button is called for assistive tech and the tooltip */
  label: string
  /** what it says on the button while it is on */
  short: string
  icon: ReactNode
}

/** the track's own padding and the gap between options, in px (p-0.5, gap-0.5) */
const PAD = 2
const GAP = 2
/** the control's tween (segmented-control.tsx): 250ms, smooth-out */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
const MS = 250

/* the shell's device glyphs: 1.6px strokes, drawn by hand so they sit at 13 and 14px */
const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const

export function DesktopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </svg>
  )
}

export function MobileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  )
}

/* Phosphor's Code glyph (regular), inlined so the file carries no icon package */
function CodeIcon({ className }: { className?: string }) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 256 256" fill="currentColor" className={className} aria-hidden>
      <path d="M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z" />
    </svg>
  )
}

export type PreviewView = "desktop" | "mobile" | "code"

/** the component page's three views, as the shell names them */
export const PREVIEW_VIEWS: ViewOption<PreviewView>[] = [
  { id: "desktop", label: "Desktop · full width", short: "Desktop", icon: <DesktopIcon /> },
  { id: "mobile", label: "Mobile · 390px", short: "Mobile", icon: <MobileIcon /> },
  { id: "code", label: "Code", short: "Code", icon: <CodeIcon className="h-3.5 w-3.5" /> },
]

export interface ViewSwitchProps<T extends string> {
  options?: ViewOption<T>[]
  /** controlled value; omit to let the switch keep its own */
  value?: T
  defaultValue?: T
  onChange?: (v: T) => void
  /** something that sits in the track ahead of the options and is not one of them (an expand link) */
  leading?: ReactNode
  /** 36px options, for a toolbar that is the page's main control; 32px otherwise */
  tall?: boolean
  /** what the group is called */
  label?: string
  className?: string
}

/**
 * The Segmented Control's parts, a hairline track and one thumb, with only the option
 * that is on showing its name. The row is one fixed width, so nothing jumps.
 */
export function ViewSwitch<T extends string = PreviewView>({
  options = PREVIEW_VIEWS as unknown as ViewOption<T>[],
  value,
  defaultValue,
  onChange,
  leading,
  tall = false,
  label = "View",
  className,
}: ViewSwitchProps<T>) {
  const reduced = useReducedMotion()
  const off = tall ? 36 : 32
  const measureRef = useRef<HTMLDivElement>(null)
  const leadRef = useRef<HTMLSpanElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const [inner, setInner] = useState<T>(() => defaultValue ?? options[0].id)
  const current = value ?? inner
  /** the width of the option that is on: the longest name, measured */
  const [on, setOn] = useState<number | null>(null)
  const [lead, setLead] = useState(0)
  const [narrow, setNarrow] = useState(false)
  /** the last choice came from the keyboard: it lands at once */
  const [byKey, setByKey] = useState(false)

  const select = (v: T) => {
    setInner(v)
    onChange?.(v)
  }

  useEffect(() => {
    if (typeof matchMedia !== "function") return
    const mq = matchMedia("(max-width: 639px)")
    const read = () => setNarrow(mq.matches)
    read()
    mq.addEventListener("change", read)
    return () => mq.removeEventListener("change", read)
  }, [])

  const names = options.map((o) => o.short).join("|")
  useLayoutEffect(() => {
    const measure = () => {
      const box = measureRef.current
      // layout pixels (offsetWidth), not the drawn box: inside a scaled preview stage a
      // getBoundingClientRect width comes back scaled and the thumb clipped the name
      if (box) setOn(Math.ceil(Math.max(0, ...[...box.children].map((c) => (c as HTMLElement).offsetWidth))))
      setLead(leadRef.current ? leadRef.current.offsetWidth + GAP : 0)
    }
    measure()
    // the name is set in the page's face, which can land after the first measure
    document.fonts?.ready.then(measure).catch(() => {})
  }, [names, tall, leading != null])

  const widthOn = narrow ? off : on
  const index = Math.max(0, options.findIndex((o) => o.id === current))
  const still = reduced || byKey
  const slide = still ? "none" : `transform ${MS}ms ${EASE}`
  const pad = tall ? 14 : 12

  /* arrow keys walk the options and choose as they go, Home and End jump to the ends */
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    let next = -1
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(last, index + 1)
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, index - 1)
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = last
    if (next < 0 || next === index) return
    e.preventDefault()
    setByKey(true)
    select(options[next].id)
    buttons.current[next]?.focus()
  }

  return (
    <div role="group" aria-label={label} className={cn("relative inline-flex items-center gap-0.5", TRACK, className)}>
      {/* every option as it looks when it is on, out of sight, to find the longest */}
      <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex h-0 overflow-hidden whitespace-nowrap">
        {options.map((o) => (
          <span key={o.id} className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium" style={{ paddingInline: pad }}>
            {o.icon}
            {o.short}
          </span>
        ))}
      </div>

      {/* the thumb: one, for the whole row */}
      {widthOn != null && (
        <span
          aria-hidden
          className={cn("pointer-events-none absolute rounded-full", THUMB)}
          style={{ top: PAD, bottom: PAD, left: PAD + lead, width: widthOn, transform: `translateX(${index * (off + GAP)}px)`, transition: slide }}
        />
      )}

      {leading && (
        <span ref={leadRef} className="relative flex">
          {leading}
        </span>
      )}
      {options.map((o, i) => {
        const active = o.id === current
        return (
          <button
            key={o.id}
            ref={(el) => {
              buttons.current[i] = el
            }}
            type="button"
            onClick={() => {
              setByKey(false)
              select(o.id)
            }}
            onKeyDown={onKeyDown}
            aria-pressed={active}
            aria-label={o.label}
            title={o.label}
            className={cn(
              "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] transition-colors duration-200",
              tall ? "h-9" : "h-8",
              active ? "text-foreground" : SEGMENT_OFF,
            )}
            style={{
              // before the measure lands an option is as wide as what it holds, so nothing is clipped
              width: widthOn == null ? undefined : active ? widthOn : off,
              transition: still ? "color 200ms" : `width ${MS}ms ${EASE}, color 200ms`,
            }}
          >
            {/* icon and name are centred in the option; the name's own width closes to
                nothing when the option is off, which leaves the icon alone in the middle */}
            <span className="flex shrink-0 items-center justify-center">{o.icon}</span>
            <span
              aria-hidden={!active}
              className="overflow-hidden whitespace-nowrap font-medium"
              style={{
                maxWidth: active && !narrow ? 96 : 0,
                paddingLeft: active && !narrow ? 6 : 0,
                opacity: active && !narrow ? 1 : 0,
                transition: still
                  ? reduced
                    ? "opacity 150ms"
                    : "none"
                  : `max-width ${MS}ms ${EASE}, padding-left ${MS}ms ${EASE}, opacity ${active ? MS : 120}ms ease-out ${active ? 60 : 0}ms`,
              }}
            >
              {o.short}
            </span>
          </button>
        )
      })}
    </div>
  )
}
