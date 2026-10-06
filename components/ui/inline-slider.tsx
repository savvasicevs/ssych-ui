"use client"

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Inline Slider, promoted through ssych-component (2026-09-29).
   What it is for: a filter you set by dragging, in a column of filters. The name sits
   inside the left of the track and the value inside the right, so the control is one
   labelled object, 28px tall, the height of every other control.
   Read first: the value on the right.
   The pointer: the thumb follows the pointer pixel for pixel and settles onto the nearest
   step when let go; a press anywhere on the track sends the thumb there; where the thumb
   crosses the name or the value its stem fades and its two ends part, so the words stay
   readable; arrow keys move one step, Page Up and Page Down ten, Home and End go to the
   ends. With `range` there are two thumbs and the nearer one takes the press. A filter
   that has been moved shows a small cross that puts it back.
   Sketch: lab/InlineSlider (idea from beui.dev's inline slider: the label and the value
   inside the track, the thumb that parts over text). Kept every prop, the ten ticks, the
   step grid, the drag and settle, the range and the keys.
   Changed: colours are foreground tokens, the sketch was white on dark only; the track is
   fully round and 28px, the fill is the control material (10% ink since 2026-10-02); `max` and `label`
   have defaults; the slider keeps its own value when no handler is given, so it moves
   with no props; a range with no `readout` prints "low to high"; the thumb is 2px wide.
   Fixed 2026-10-01 (ported from the GPU pods copy): while a filter is at rest (not
   `active`, nothing held) a range's fill runs the whole track edge to edge, behind both
   handles; once a range is picked it shrinks to that run. A single value fills from the
   left edge to its thumb. This is the
   default here (`fillAtRest`). The track is measured in layout pixels, so a preview
   drawn inside a scaled stage no longer packs the thumbs against the left edge, and the
   text sits in far enough that a thumb resting at either end clears it (14px, see below).
   2026-10-02: the handle now always sits inside the fill (his call: the handles looked
   too wide and sat outside the filled part, a low value left the handle on the bare left
   edge). Spec 14.5: the handle is a 2px by 10px bar (10, not 14: his call, the rounded
   ends left a taller stem reading as outside the fill) 6px in from the fill's right edge, and
   for a range each handle is 6px inside its end of the filled run, so even at the minimum
   there is a 14px fill (6 + 2 + 6) around the handle. The track rests at 6% ink and the
   fill at 10%, the name reads at 60% and the value at 90%. The words sit 14px in, where
   the smallest fill ends. New `stops`: values marked as 2px dots on the track with their
   labels under it (10px, 45%, the chosen one 90%), pressing a label goes there; they take
   the place of the ten ticks. Leverage Ticket uses it.
   Formulas:
   · value = min + (x − start) ÷ (end − start) × (max − min), rounded to the step
   · handle x runs from 6 to width − 8; fill right = handle x + 2 + 6, a range's fill left = low handle x − 6
   · the ticks split the travel into nine equal parts; none is drawn under a word
   2026-10-02 audit: the name and the value inside the track are 11.5px, the control text
   size of spec 14.4 (they were 11px). Nothing else changed; every prop and export holds. */

const TICKS = 10
const THUMB_W = 2
/** how far the handle sits inside its end of the fill (spec 14.5) */
const INSET = 6
/* the handle's left edge at the minimum and at the maximum: 6px in from either end */
const START = INSET
const END_INSET = INSET
/** the narrowest fill: the handle and its inset on both sides, 6 + 2 + 6 */
const MIN_FILL = INSET + THUMB_W + INSET
/* 14: the words start where the smallest fill ends, so a handle at either end keeps 6px clear */
const TEXT_INSET = MIN_FILL
/** over how many pixels the thumb goes from whole to parted */
const PART_PX = 6
/* the house lift spring: the thumb is a physical object, so it settles */
const SETTLE = { type: "spring", stiffness: 500, damping: 30 } as const
const EASE = [0.16, 1, 0.3, 1] as const

type End = "lo" | "hi"

export interface InlineSliderProps {
  label?: ReactNode
  min?: number
  max?: number
  step?: number
  /** one thumb */
  value?: number
  onChange?: (value: number) => void
  /** two thumbs; wins over `value` */
  range?: [number, number]
  onRangeChange?: (range: [number, number]) => void
  /** the text on the right; the formatted value when left out */
  readout?: ReactNode
  format?: (value: number) => string
  /** lit styling: the filter is doing something */
  active?: boolean
  /** shows a small cross after the value while active */
  onClear?: () => void
  ariaLabel?: string
  className?: string
  /** a range at rest (not `active`, nothing held) fills the whole track behind both handles;
   *  once picked it covers just the chosen run. Single values are unaffected. On by default */
  fillAtRest?: boolean
  /** values marked on the track as 2px dots, each with a label under it that goes there when
   *  pressed; they replace the ten ticks */
  stops?: number[]
  /** a stop's label; `format` when left out */
  formatStop?: (value: number) => ReactNode
}

const snap = (v: number, min: number, max: number, step: number) => {
  const s = Math.round((v - min) / step) * step + min
  const p = step.toFixed(6).replace(/0+$/, "").split(".")[1]?.length ?? 0
  return Math.min(max, Math.max(min, Number(s.toFixed(p))))
}

/** the thumb: a stem with a dot at each end; over text the stem fades and the dots part */
function Thumb({ x, part, held, still }: { x: number; part: number; held: boolean; still: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute left-0 top-[9px] block h-[10px]"
      style={{ width: THUMB_W }}
      initial={false}
      animate={{ x, scaleY: held && !still ? 1.2 : 1 }}
      transition={still || held ? { duration: 0 } : SETTLE}
    >
      <span className="absolute left-0 top-0 h-[2px] w-[2px] rounded-full bg-foreground" style={{ transform: `translateY(${-part * 3}px)` }} />
      <span className="absolute inset-y-0 left-0 w-[2px] rounded-full bg-foreground" style={{ opacity: 1 - part }} />
      <span className="absolute bottom-0 left-0 h-[2px] w-[2px] rounded-full bg-foreground" style={{ transform: `translateY(${part * 3}px)` }} />
    </motion.span>
  )
}

/**
 * A slider with its name and its value inside the track. The thumb parts over the words,
 * follows the pointer and settles on the step grid.
 */
export function InlineSlider({
  label = "Memory",
  min = 0,
  max = 100,
  step = 1,
  value = min,
  onChange,
  range,
  onRangeChange,
  readout,
  format = String,
  active = false,
  onClear,
  ariaLabel,
  className,
  fillAtRest = true,
  stops,
  formatStop,
}: InlineSliderProps) {
  const reduced = useReducedMotion() ?? false
  const dual = !!range
  const track = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const readoutRef = useRef<HTMLSpanElement>(null)
  const [geo, setGeo] = useState({ width: 300, labelW: 48, readoutW: 28 })
  /** `k` is screen px per layout px, above 1 or below it when a stage scales the slider */
  const gesture = useRef<{ id: number; left: number; k: number; offset: number; end: End } | null>(null)
  const [drag, setDrag] = useState<{ end: End; x: number } | null>(null)
  /** true after an arrow key: a key moves the thumb at once, only a release settles */
  const [keyed, setKeyed] = useState(false)

  /* the slider's own copy of the value: it follows the props, and moves without them */
  const [own, setOwn] = useState<[number, number]>(range ?? [value, value])
  const given = range ? `${range[0]}:${range[1]}` : String(value)
  useEffect(() => {
    setOwn(range ?? [value, value])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [given])
  const [lo, hi] = own

  useLayoutEffect(() => {
    const t = track.current
    const l = labelRef.current
    const r = readoutRef.current
    if (!t || !l || !r || typeof ResizeObserver === "undefined") return
    /* layout widths, not getBoundingClientRect: a stage that scales its preview would hand
       back scaled sizes, and a transform never fires the observer to correct them */
    const measure = () => {
      const width = t.offsetWidth
      if (!width) return
      const next = { width, labelW: l.offsetWidth, readoutW: r.offsetWidth }
      setGeo((p) => (p.width === next.width && p.labelW === next.labelW && p.readoutW === next.readoutW ? p : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(t)
    ro.observe(l)
    ro.observe(r)
    return () => ro.disconnect()
  }, [])

  /* value and pixel are one straight map; the step grid lives in value space */
  const endX = Math.max(START, geo.width - END_INSET - THUMB_W)
  const span = max - min || 1
  const xOf = (v: number) => START + ((v - min) / span) * (endX - START)
  const vOf = (x: number) => min + ((x - START) / (endX - START || 1)) * span

  const loX = drag?.end === "lo" ? drag.x : xOf(lo)
  const hiX = drag?.end === "hi" ? drag.x : xOf(hi)

  /* how far a thumb sits over either word, 0 to 1 across six pixels */
  /* each word's zone reaches 4px past its letters, so a stem fades before it touches one
     (2026-10-02: at 10× the leverage stem stood on the last letter of "Leverage") */
  const CLEAR = 4
  const labelStart = TEXT_INSET - CLEAR
  const labelEnd = TEXT_INSET + geo.labelW + CLEAR
  const readStart = geo.width - TEXT_INSET - geo.readoutW - CLEAR
  const readEnd = geo.width - TEXT_INSET + CLEAR
  const overlap = (x: number, s: number, e: number) => Math.max(0, Math.min(1, (x + THUMB_W + 1 - s) / PART_PX, (e - x + 1) / PART_PX))
  const partOf = (x: number) => Math.max(overlap(x, labelStart, labelEnd), overlap(x, readStart, readEnd))
  const underText = (x: number) => (x + THUMB_W >= labelStart && x <= labelEnd) || (x + THUMB_W >= readStart && x <= readEnd)
  /* the stops when given (the two ends need no dot), else nine equal parts; a thumb's
     centre is its left edge + 1, so a dot sits where the handle would stand */
  const marks = stops
    ? stops.filter((v) => v > min && v < max).map((v) => xOf(v))
    : Array.from({ length: TICKS - 2 }, (_, i) => START + ((i + 1) / (TICKS - 1)) * (endX - START))
  /* a dot under a word, or within 8px of a handle, would read as a second mark: hidden */
  const ticks = marks.filter((x) => !underText(x) && Math.abs(x - hiX) >= 8 && (!dual || Math.abs(x - loX) >= 8))

  const commit = (end: End, v: number) => {
    if (dual) {
      const next: [number, number] = end === "lo" ? [Math.min(v, hi), hi] : [lo, Math.max(v, lo)]
      if (next[0] === lo && next[1] === hi) return
      setOwn(next)
      onRangeChange?.(next)
    } else {
      if (v === hi) return
      setOwn([v, v])
      onChange?.(v)
    }
  }

  const clampX = (x: number, end: End) => {
    const c = Math.min(endX, Math.max(START, x))
    if (!dual) return c
    return end === "lo" ? Math.min(c, xOf(hi)) : Math.max(c, xOf(lo))
  }

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || gesture.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width) return
    e.preventDefault()
    const k = rect.width / (e.currentTarget.offsetWidth || rect.width) || 1
    const px = (e.clientX - rect.left) / k
    /* the nearer thumb takes the press; a grab keeps its exact grab point */
    const end: End = !dual ? "hi" : Math.abs(px - loX) <= Math.abs(px - hiX) ? "lo" : "hi"
    const tx = end === "lo" ? loX : hiX
    const offset = Math.abs(px - tx - THUMB_W / 2) <= 10 ? px - tx : THUMB_W / 2
    gesture.current = { id: e.pointerId, left: rect.left, k, offset, end }
    setKeyed(false)
    setDrag({ end, x: tx })
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const x = clampX((e.clientX - g.left) / g.k - g.offset, g.end)
    setDrag({ end: g.end, x })
    /* the thumb moves pixel for pixel; the page hears whole steps */
    commit(g.end, snap(vOf(x), min, max, step))
  }
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    gesture.current = null
    const x = clampX(e.type === "pointerup" ? (e.clientX - g.left) / g.k - g.offset : (drag?.x ?? xOf(g.end === "lo" ? lo : hi)), g.end)
    commit(g.end, snap(vOf(x), min, max, step))
    setDrag(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const key = (end: End) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const cur = end === "lo" ? lo : hi
    const by = (n: number) => snap(cur + n * step, min, max, step)
    const moves: Record<string, number | undefined> = {
      ArrowRight: by(1),
      ArrowUp: by(1),
      ArrowLeft: by(-1),
      ArrowDown: by(-1),
      PageUp: by(10),
      PageDown: by(-10),
      Home: min,
      End: max,
    }
    const next = moves[e.key]
    if (next === undefined) return
    e.preventDefault()
    setKeyed(true)
    commit(end, next)
  }

  const name = ariaLabel ?? (typeof label === "string" ? label : "Value")
  const handle = (end: End, x: number, v: number) => (
    <button
      key={end}
      type="button"
      role="slider"
      aria-label={`${name}${dual ? (end === "lo" ? ", lowest" : ", highest") : ""}`}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={v}
      aria-valuetext={format(v)}
      onKeyDown={key(end)}
      className="absolute inset-y-0 w-4 cursor-[inherit] rounded-full outline-none focus-visible:bg-foreground/[0.1]"
      style={{ left: x - (16 - THUMB_W) / 2 }}
    />
  )

  /* a range at rest fills the whole track; picked, it is the run thumb to thumb. A single
     value always fills from the left edge to its thumb, so the fill shows where it sits
     (user call, 2026-10-01: a whole fill left the thumb reading as a text cursor).
     2026-10-02: every handle stands 6px inside its end of the fill, never past it */
  const whole = fillAtRest && dual && !active && !drag
  const fillLeft = whole ? 0 : dual ? Math.max(0, loX - INSET) : 0
  const fillRight = whole ? geo.width : Math.min(geo.width, Math.max(fillLeft + MIN_FILL, hiX + THUMB_W + INSET))
  const fillWidth = fillRight - fillLeft
  const still = reduced || keyed

  const body = (
    <div
      ref={track}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      className={cn(
        "relative h-7 w-full touch-none select-none overflow-hidden rounded-full bg-foreground/[0.07] tabular-nums dark:bg-foreground/[0.06]",
        drag ? "cursor-grabbing" : "cursor-grab",
        !stops && className,
      )}
    >
      {/* the fill spans the track and is cut to the chosen run by a clip, so it moves on the
          compositor instead of animating a width; at rest the clip opens to the whole track */}
      <motion.span
        aria-hidden
        className={cn("absolute inset-0 hidden rounded-full transition-colors duration-150 dark:block", active ? "bg-foreground/[0.13]" : "bg-foreground/[0.10]")}
        initial={false}
        animate={{ clipPath: `inset(0px ${Math.max(0, geo.width - fillLeft - fillWidth).toFixed(1)}px 0px ${fillLeft.toFixed(1)}px round 999px)` }}
        transition={still || drag ? { duration: 0 } : { duration: 0.25, ease: EASE }}
      />
      {/* light (his call, 2026-10-02: "the inline slider is not readable on light; the part
          between the handles could be lighter, maybe with some shadow"): the chosen run is a
          raised WHITE segment with a hairline and a soft shadow over the grey track, like a
          segmented control's thumb. A clip would cut a shadow off, so this one is placed and
          sized instead; 2px in from the track's edge so the hairline shows all round */}
      <motion.span
        aria-hidden
        className="absolute inset-y-[2px] block rounded-full bg-white shadow-[0_0_0_1px_var(--light-outline,rgba(0,0,0,0.09)),0_1px_3px_rgba(0,0,0,0.08)] dark:hidden"
        initial={false}
        animate={{ left: Math.max(2, fillLeft + (fillLeft > 0 ? 0 : 2)), width: Math.max(0, Math.min(geo.width - 2, fillLeft + fillWidth) - Math.max(2, fillLeft + (fillLeft > 0 ? 0 : 2))) }}
        transition={still || drag ? { duration: 0 } : { duration: 0.25, ease: EASE }}
      />
      <div className="pointer-events-none absolute inset-0">
        <span
          ref={labelRef}
          className={cn("absolute top-1/2 max-w-[52%] -translate-y-1/2 truncate whitespace-nowrap text-[11.5px] transition-colors duration-150", active ? "text-foreground/90" : "text-foreground/60")}
          style={{ left: TEXT_INSET }}
        >
          {label}
        </span>
        <span
          ref={readoutRef}
          className={cn(
            "absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium transition-colors duration-150",
            active ? "text-foreground" : "text-foreground/90",
          )}
          style={{ right: TEXT_INSET }}
        >
          {readout ?? (dual ? `${format(lo)} to ${format(hi)}` : format(hi))}
          {active && onClear ? (
            <button
              type="button"
              aria-label={`Reset ${name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onClear}
              className="pointer-events-auto -mr-1.5 grid h-4 w-4 cursor-pointer place-items-center rounded-full text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.1] hover:text-foreground focus-visible:bg-foreground/[0.1] active:scale-[0.97] motion-reduce:active:scale-100"
            >
              <svg aria-hidden viewBox="0 0 8 8" width={7} height={7}>
                <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </span>
        {ticks.map((x) => (
          <span key={x} aria-hidden className="absolute top-1/2 h-[2px] w-[2px] -translate-y-1/2 rounded-full bg-foreground/20" style={{ left: x }} />
        ))}
      </div>
      {dual ? <Thumb x={loX} part={partOf(loX)} held={drag?.end === "lo"} still={still} /> : null}
      <Thumb x={hiX} part={partOf(hiX)} held={drag?.end === "hi"} still={still} />
      {dual ? handle("lo", loX, lo) : null}
      {handle("hi", hiX, hi)}
    </div>
  )

  if (!stops) return body
  /* stops: labels under the track, each under the spot its handle would stand on; the two
     ends align to the track's edges so they never spill past it */
  return (
    <div className={cn("w-full", className)}>
      {body}
      <div className="relative mt-1 h-4">
        {stops.map((v) => {
          const cx = xOf(v) + THUMB_W / 2
          const on = !dual ? v === hi : v === lo || v === hi
          return (
            <button
              key={v}
              type="button"
              onClick={() => {
                setKeyed(false)
                if (dual) commit(Math.abs(v - lo) <= Math.abs(v - hi) ? "lo" : "hi", v)
                else commit("hi", v)
              }}
              aria-label={`Set ${name} to ${format(v)}`}
              className={cn(
                "absolute top-0 h-4 whitespace-nowrap text-[10px] outline-none transition-colors duration-150 hover:text-foreground/90 focus-visible:text-foreground/90",
                on ? "text-foreground/90" : "text-foreground/45",
              )}
              style={v <= min ? { left: 0 } : v >= max ? { right: 0 } : { left: cx, transform: "translateX(-50%)" }}
            >
              {formatStop ? formatStop(v) : format(v)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const money = (v: number) => `$${v.toFixed(2)}`

/** Three filters of one search, as they sit in a column: two single values and a range.
 *  A filter is lit once it has been moved from where it started, and its cross puts it
 *  back. */
export function InlineSliderSet({ className }: { className?: string }) {
  /* the price range starts with nothing picked: the whole range, handles at both ends */
  const START_AT = { cores: 16, memory: 64, price: [0, 4] as [number, number] }
  const [cores, setCores] = useState(START_AT.cores)
  const [memory, setMemory] = useState(START_AT.memory)
  const [price, setPrice] = useState<[number, number]>(START_AT.price)
  const moved = [cores !== START_AT.cores, memory !== START_AT.memory, price[0] !== START_AT.price[0] || price[1] !== START_AT.price[1]]

  return (
    <div className={cn("flex w-[320px] max-w-full flex-col gap-1.5 tabular-nums", className)} role="group" aria-label={`3 filters, ${moved.filter(Boolean).length} changed`}>
      <InlineSlider label="Cores" min={2} max={64} step={2} value={cores} onChange={setCores} active={moved[0]} onClear={() => setCores(START_AT.cores)} />
      <InlineSlider
        label="Memory"
        min={8}
        max={256}
        step={8}
        value={memory}
        onChange={setMemory}
        format={(v) => `${v} GB`}
        active={moved[1]}
        onClear={() => setMemory(START_AT.memory)}
      />
      <InlineSlider
        label="Price per hour"
        min={0}
        max={4}
        step={0.1}
        range={price}
        onRangeChange={setPrice}
        format={money}
        active={moved[2]}
        onClear={() => setPrice(START_AT.price)}
      />
    </div>
  )
}
