// provenance: original
"use client"

import { createContext, createElement, useContext, useState, type ComponentProps, type HTMLAttributes, type ImgHTMLAttributes } from "react"
import { motion as m, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* transitions.dev signature smooth-out easing */
const SMOOTH = [0.22, 1, 0.36, 1] as const

/* The notch that makes the "cutout": a filled corner whose inner edge is a soft curve,
   placed beside a label or pin so the card's surface seems to wrap around it. K sets how
   square the curve is (0.55 ≈ a circle, 1 = a sharp corner). */
const K = 0.75
const NOTCH = `M0 200C${200 * K} 200 200 ${200 * K} 200 0V200H0Z`

/** What every part of one card can read: whether the card is hovered, and a setter. */
export type CutoutCardContextValue = { hovered: boolean; setHovered: (next: boolean) => void }

const HoverContext = createContext<CutoutCardContextValue | null>(null)

/** hovered: controlled hover, for a parent that drives several cards. defaultHovered: the
 *  starting state when uncontrolled. onHoveredChange: told about every change.
 *  trackPointerHover: false = the pointer does not change hover; drive it yourself. */
export type CutoutCardProps = Omit<ComponentProps<typeof m.div>, "defaultValue"> & { hovered?: boolean; defaultHovered?: boolean; onHoveredChange?: (hovered: boolean) => void; trackPointerHover?: boolean }

/** A media card whose labels and pins sit in notches cut into the image. The root owns
 *  one hover state (controlled or not) that its action region reads, and fades in once
 *  on mount. */
export function CutoutCard({ className, hovered, defaultHovered = false, onHoveredChange, trackPointerHover = true, onMouseEnter, onMouseLeave, children, ...rest }: CutoutCardProps) {
  const reduced = useReducedMotion()
  const [own, setOwn] = useState(defaultHovered)
  const on = hovered ?? own
  const setHovered = (next: boolean) => {
    if (hovered === undefined) setOwn(next)
    onHoveredChange?.(next)
  }
  /* the pointer counts unless the caller opted out or handled the event itself */
  const follow = (next: boolean) => (e: React.MouseEvent<HTMLDivElement>, user?: (e: React.MouseEvent<HTMLDivElement>) => void) => {
    user?.(e)
    if (trackPointerHover && !e.defaultPrevented) setHovered(next)
  }

  return (
    <HoverContext.Provider value={{ hovered: on, setHovered }}>
      <m.div className={cn(className)} data-slot="cutout-card" data-state={on ? "hovered" : "idle"} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0.22 : 0.36, ease: SMOOTH }}
        onMouseEnter={(e) => follow(true)(e, onMouseEnter)}
        onMouseLeave={(e) => follow(false)(e, onMouseLeave)}
        {...rest}
      >
        {children}</m.div>
    </HoverContext.Provider>
  )
}

type Div = HTMLAttributes<HTMLDivElement>
export type { Div as CutoutCardMediaProps, Div as CutoutCardOverlayProps, Div as CutoutCardContentProps, Div as CutoutCardFooterProps, Div as CutoutCardInsetLabelProps, Div as CutoutCardPinProps }

/* the plain parts: a div with base classes and a data-slot, nothing else */
function slot(name: string, base: string) {
  const Part = ({ className, ...rest }: Div) =>
    createElement("div", { ...rest, className: cn(base, className), "data-slot": `cutout-card-${name}` })
  return Part
}

/** the image well: give it a size; the image fills it */
export const CutoutCardMedia = slot("media", "relative overflow-hidden")

/** a wash from the bottom so text over the image stays readable */
export const CutoutCardOverlay = slot(
  "overlay",
  "pointer-events-none absolute inset-0 bg-linear-to-t from-background/35 via-transparent to-transparent dark:from-background/50",
)

export const CutoutCardContent = slot("content", "p-6")

export const CutoutCardFooter = slot("footer", "flex items-center justify-between")

/** a strip set into an edge of the media (a "Featured" tab); put CutoutCorner notches
 *  beside it. It does not animate in, so no seam shows against the image edge. */
export const CutoutCardInsetLabel = slot("inset-label", "absolute")

/** a badge set into a corner (a "New" pin); same rules as the inset label */
export const CutoutCardPin = slot("pin", "absolute")

export type CutoutCardImageProps = ImgHTMLAttributes<HTMLImageElement>
/** the picture, covering its media well, drifting in a little on card hover */
export function CutoutCardImage({ className, alt = "", ...rest }: CutoutCardImageProps) {
  return (
    <img {...rest} alt={alt} data-slot="cutout-card-image"
      className={cn("absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover/cutout:scale-105", className)} />
  )
}

/** size: rendered width and height, px */
export type CutoutCornerProps = ComponentProps<"svg"> & { size?: number }

/** One notch. Colour it with the card's surface (text-card, text-background…) and
 *  rotate it to the corner it fills. */
export function CutoutCorner({ className, size = 32, viewBox = "0 0 200 200", ...rest }: CutoutCornerProps) {
  return (
    <svg aria-hidden className={cn(className)} data-slot="cutout-corner" width={size} height={size} viewBox={viewBox} xmlns="http://www.w3.org/2000/svg" {...rest}>
      <path d={NOTCH} fill="currentColor" />
    </svg>
  )
}

/** revealOnHover: true = shown only while the card is hovered; false = always shown */
export type CutoutCardActionProps = ComponentProps<typeof m.div> & { revealOnHover?: boolean }

/** A control that rises 8px into place when the card is hovered. */
export function CutoutCardAction({ className, revealOnHover = true, ...rest }: CutoutCardActionProps) {
  const card = useContext(HoverContext)
  if (!card) throw new Error("CutoutCardAction must sit inside a CutoutCard")
  const reduced = useReducedMotion()
  const shown = card.hovered || !revealOnHover

  return (
    <m.div
      className={cn("absolute", !shown && "pointer-events-none", className)}
      data-slot="cutout-card-action" data-reveal={revealOnHover ? "hover" : "always"}
      animate={{ opacity: shown ? 1 : 0, transform: `translateY(${shown || reduced ? 0 : 8}px)` }}
      /* it rises in 240ms and leaves quicker, 150ms; reduced motion only fades */
      transition={{ duration: reduced || !shown ? 0.15 : 0.24, ease: SMOOTH }}
      {...rest}
    />
  )
}
