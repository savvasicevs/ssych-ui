"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

const ACCENT: [number, number, number] = [72, 159, 250]
const accentRgba = (a: number) => `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},${a})`

/** layout effect on the client, plain effect during SSR so the registry item stays portable */
const useIsoLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect

export interface CoverflowSlide {
  /** optional artwork; without it the card draws its own deterministic cover */
  src?: string
  alt: string
  title?: string
  subtitle?: string
  /** label/value rows under the caption, right-aligned and tabular */
  meta?: { label: string; value: string }[]
}

/* deterministic cover art, Lehmer LCG — no asset files, no Math.random, and it
   retints with the theme because every colour is a token */
const DEFAULT_SLIDES: CoverflowSlide[] = (() => {
  const names = ["Meridian", "Northwind", "Halcyon", "Vantage", "Ridgeline", "Beacon", "Lantern"]
  let s = 7
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647
  return names.map((name, i) => ({
    alt: `${name} cover`,
    title: name,
    subtitle: ["Quarterly report", "Field notes", "Release", "Case study"][i % 4],
    meta: [
      { label: "issue", value: `No. ${String(i + 1).padStart(2, "0")}` },
      { label: "pages", value: String(24 + Math.round(next() * 40)) },
      { label: "change", value: `${next() > 0.45 ? "+" : "−"}${(next() * 9 + 0.4).toFixed(1)}%` },
    ],
  }))
})()

/**
 * A cover rail you throw with a finger. The centre card faces you square,
 * its neighbours rake away and sink back, and the tilt eases off as they
 * travel so the second card stays readable instead of folding shut. Flick it
 * and the throw carries at most two cards before it settles.
 */
export function CoverflowRail({
  slides = DEFAULT_SLIDES,
  rotate = 44,
  depth = 0.6,
  perspective = 3,
  falloff = 0.56,
  fade = 0.1,
  cardWidth = "clamp(148px, 22vw, 240px)",
  gap = 0.05,
  loop = true,
  showCaption = true,
  showPagination = true,
  showNavigation = true,
  label = "Cover rail",
  className,
}: {
  slides?: CoverflowSlide[]
  /** degrees the first neighbour tilts */
  rotate?: number
  /** how far the first neighbour recedes, as a fraction of card width */
  depth?: number
  /** viewer distance as a multiple of card width; smaller is a wider lens */
  perspective?: number
  /** exponent on distance; below 1 the rake eases off as cards travel out */
  falloff?: number
  /** opacity lost per step from the centre */
  fade?: number
  /** any CSS length; everything else derives from it, so the rake scales */
  cardWidth?: string
  /** space between cards, as a fraction of card width */
  gap?: number
  loop?: boolean
  showCaption?: boolean
  showPagination?: boolean
  showNavigation?: boolean
  /** names the rail for assistive tech */
  label?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const count = slides.length

  const frame = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLDivElement | null)[]>([])
  /** fractional card index at the centre, the single source of truth */
  const pos = useRef(0)
  /** where the current settle is headed; stepping off pos would swallow a
      keypress that lands mid-flight, before the round-off moves */
  const target = useRef(0)
  const width = useRef(0)
  const raf = useRef<number | null>(null)
  const drag = useRef<{ id: number; x: number; pos: number; v: number; t: number } | null>(null)

  const [selected, setSelected] = useState(0)

  const indexAt = useCallback((p: number) => ((Math.round(p) % count) + count) % count, [count])

  /* painted straight to the DOM: sixty state updates a second would re-render
     every card for numbers React never needs to see */
  const paint = useCallback(() => {
    const w = width.current
    if (!w) return
    const pitch = w * (1 + gap)
    const p = pos.current

    cards.current.forEach((card, i) => {
      if (!card) return

      /* fold the distance into the shorter way round the ring — this is the
         whole looping mechanism, with no cloned nodes and no DOM shuffling */
      let offset = i - p
      if (loop) {
        offset = ((offset % count) + count) % count
        if (offset > count / 2) offset -= count
      }

      const distance = Math.abs(offset)
      const ramp = Math.pow(distance, falloff)
      /* capped short of edge-on so a far card never turns its back */
      const tilt = Math.min(rotate * ramp, 82) * Math.sign(offset)

      card.style.transform =
        `translateX(calc(-50% + ${offset * pitch}px)) ` +
        `translateZ(${-depth * w * ramp}px) rotateY(${-tilt}deg)`

      /* a card is teleported across the ring at exactly half a turn out, so it
         has to be gone by then or the jump is visible */
      const edge = loop ? Math.min(1, Math.max(0, count / 2 - distance)) : 1
      card.style.opacity = String(Math.max(0, 1 - fade * distance) * edge)
      card.style.zIndex = String(100 - Math.round(distance))
    })
  }, [count, depth, fade, falloff, gap, loop, rotate])

  const settle = useCallback(
    (to: number) => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
      target.current = to
      setSelected(indexAt(to))

      /* reduced motion gets the destination, not the journey */
      if (reduced) {
        pos.current = to
        paint()
        raf.current = null
        return
      }

      const step = () => {
        const remaining = to - pos.current
        if (Math.abs(remaining) < 0.0004) {
          pos.current = to
          paint()
          raf.current = null
          return
        }
        /* exponential ease-out rather than a spring: the rail should arrive and
           stop, never overshoot past the card you asked for */
        pos.current += remaining * 0.16
        paint()
        raf.current = requestAnimationFrame(step)
      }
      raf.current = requestAnimationFrame(step)
    },
    [indexAt, paint, reduced],
  )

  const clamp = useCallback(
    (p: number) => (loop ? p : Math.max(0, Math.min(count - 1, p))),
    [count, loop],
  )

  const goTo = useCallback(
    (i: number) => {
      /* take the shorter way round rather than unwinding the whole ring */
      const to = loop ? i + Math.round((target.current - i) / count) * count : i
      settle(clamp(to))
    },
    [clamp, count, loop, settle],
  )

  const nudge = useCallback(
    (by: number) => settle(clamp(Math.round(target.current) + by)),
    [clamp, settle],
  )

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (raf.current !== null) {
      cancelAnimationFrame(raf.current)
      raf.current = null
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    target.current = pos.current
    drag.current = { id: e.pointerId, x: e.clientX, pos: pos.current, v: 0, t: performance.now() }
  }

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const pitch = width.current * (1 + gap)
    if (!pitch) return

    const now = performance.now()
    const previous = pos.current
    pos.current = clamp(d.pos - (e.clientX - d.x) / pitch)
    /* cards per second, for the throw */
    d.v = ((pos.current - previous) / Math.max(now - d.t, 1)) * 1000
    d.t = now

    const i = indexAt(pos.current)
    if (i !== selected) setSelected(i)
    paint()
  }

  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    /* let a flick carry, but never more than two cards */
    const carried = Math.max(-2, Math.min(2, d.v * 0.18))
    settle(clamp(Math.round(pos.current + carried)))
  }

  /* card width drives pitch, depth and perspective, so it is the only thing
     worth measuring, and only when the box actually changes */
  useIsoLayout(() => {
    const box = frame.current
    if (!box) return
    const measure = () => {
      const card = cards.current[0]
      if (!card) return
      width.current = card.offsetWidth
      paint()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [paint])

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    },
    [],
  )

  const active = slides[selected]

  return (
    <div
      className={cn("w-full max-w-[640px]", className)}
      style={{ ["--cf-card" as string]: cardWidth }}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
    >
      <div className="relative">
        <div
          ref={frame}
          tabIndex={0}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault()
              nudge(-1)
            } else if (e.key === "ArrowRight") {
              e.preventDefault()
              nudge(1)
            }
          }}
          /* vertical padding keeps the card shadows clear of the overflow clip */
          className="cursor-grab overflow-hidden py-10 outline-none active:cursor-grabbing"
          style={{
            perspective: `calc(var(--cf-card) * ${perspective})`,
            /* horizontal drag is ours, the page keeps vertical scrolling */
            touchAction: "pan-y",
          }}
        >
          <div
            className="relative select-none"
            style={{ height: "var(--cf-card)", transformStyle: "preserve-3d" }}
          >
            {slides.map((slide, i) => (
              <div
                key={slide.alt}
                ref={(node) => {
                  cards.current[i] = node
                }}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                className="absolute left-1/2 top-0 aspect-square overflow-hidden rounded-xl border border-foreground/[0.04] will-change-transform"
                style={{
                  width: "var(--cf-card)",
                  background: "var(--card)",
                  boxShadow: "0 18px 40px var(--card-shadow, rgba(0,0,0,0.45))",
                }}
              >
                {slide.src ? (
                  <img
                    src={slide.src}
                    alt={slide.alt}
                    draggable={false}
                    className="h-full w-full select-none object-cover"
                  />
                ) : (
                  <Cover index={i} title={slide.title ?? slide.alt} />
                )}
              </div>
            ))}
          </div>
        </div>

        {showNavigation && (
          <>
            <button
              type="button"
              aria-label="Previous cover"
              onClick={() => nudge(-1)}
              className="absolute left-1 top-1/2 z-[200] grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[10px] border border-foreground/[0.04] text-foreground/55 transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground/85"
              style={{
                background: "var(--card)",
                boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)",
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next cover"
              onClick={() => nudge(1)}
              className="absolute right-1 top-1/2 z-[200] grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[10px] border border-foreground/[0.04] text-foreground/55 transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground/85"
              style={{
                background: "var(--card)",
                boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)",
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {showCaption && active?.title && (
        <div className="mt-2 flex flex-col items-center px-6">
          <p className="text-[13px] font-medium text-foreground/85">{active.title}</p>
          {active.subtitle && (
            <p className="mt-1 text-[11px] text-foreground/50">{active.subtitle}</p>
          )}
          {active.meta && active.meta.length > 0 && (
            <dl className="mt-5 w-full max-w-[230px]">
              {active.meta.map((row) => (
                <div key={row.label} className="flex justify-between py-[5px]">
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-foreground/30">
                    {row.label}
                  </dt>
                  <dd className="text-[11px] font-medium tabular-nums text-foreground/85">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {showPagination && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {slides.map((slide, i) => (
            <button
              key={slide.alt}
              type="button"
              aria-label={`Go to ${slide.title ?? `cover ${i + 1}`}`}
              aria-current={i === selected}
              onClick={() => goTo(i)}
              className="h-1.5 rounded-full transition-all duration-150"
              style={{
                width: i === selected ? 16 : 6,
                background:
                  i === selected
                    ? accentRgba(0.9)
                    : "color-mix(in srgb, var(--foreground) 18%, transparent)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* the default cover: a token-built plate rather than a photograph, so the rail
   ships with zero assets and retints with the theme */
function Cover({ index, title }: { index: number; title: string }) {
  const hue = `var(--chart-${(index % 5) + 1})`
  return (
    <div className="relative h-full w-full">
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(150deg, color-mix(in srgb, ${hue} 34%, transparent) 0%, color-mix(in srgb, ${hue} 8%, transparent) 46%, transparent 78%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(color-mix(in srgb, var(--foreground) 5%, transparent) 1px, transparent 1px) 0 0 / 14px 14px",
        }}
      />
      <span
        aria-hidden
        className="absolute left-4 top-3.5 text-[10px] uppercase tracking-[0.1em] text-foreground/30"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="absolute bottom-4 left-4 right-4 truncate text-[15px] font-medium text-foreground/85">
        {title}
      </span>
    </div>
  )
}
