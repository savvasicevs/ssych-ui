"use client"


import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type MouseEventHandler,
} from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

// Minimal controllable-state hook (replaces @radix-ui/react-use-controllable-state)
function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop?: T
  defaultProp: T
  onChange?: (value: T) => void
}) {
  const [uncontrolled, setUncontrolled] = useState<T>(defaultProp)
  const isControlled = prop !== undefined
  const value = isControlled ? (prop as T) : uncontrolled
  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setUncontrolled(next)
      onChange?.(next)
    },
    [isControlled, onChange],
  )
  return [value, setValue] as const
}

const CORNER_PATH = "M0 200C155.996 199.961 200.029 156.308 200 0V200H0Z"

// ============================================================================
// Context
// ============================================================================

export interface CutoutCardContextValue {
  hovered: boolean
  setHovered: (next: boolean) => void
}

const CutoutCardContext = createContext<CutoutCardContextValue | null>(null)

function useCutoutCard() {
  const ctx = useContext(CutoutCardContext)
  if (!ctx) {
    throw new Error("useCutoutCard must be used within <CutoutCard>")
  }
  return ctx
}

// ============================================================================
// Root
// ============================================================================

export type CutoutCardProps = Omit<
  ComponentProps<typeof motion.div>,
  "defaultValue"
> & {
  /** When set, hover state is controlled by the parent. */
  hovered?: boolean
  /** Initial hover state when uncontrolled. */
  defaultHovered?: boolean
  /** Called when pointer hover changes (after internal state updates). */
  onHoveredChange?: (hovered: boolean) => void
  /**
   * When true (default), pointer enter/leave on the root update hover state.
   * Set false if you only drive hover programmatically or via CSS.
   */
  trackPointerHover?: boolean
}

export function CutoutCard({
  className,
  hovered: hoveredProp,
  defaultHovered = false,
  onHoveredChange,
  trackPointerHover = true,
  onMouseEnter,
  onMouseLeave,
  children,
  ...props
}: CutoutCardProps) {
  const reduceMotion = useReducedMotion()
  const [hovered, setHovered] = useControllableState({
    prop: hoveredProp,
    defaultProp: defaultHovered,
    onChange: onHoveredChange,
  })

  const setHoveredStable = useCallback(
    (next: boolean) => {
      setHovered(next)
    },
    [setHovered]
  )

  const ctx = useMemo<CutoutCardContextValue>(
    () => ({
      hovered: hovered ?? false,
      setHovered: setHoveredStable,
    }),
    [hovered, setHoveredStable]
  )

  const handleMouseEnter: MouseEventHandler<HTMLDivElement> = (e) => {
    onMouseEnter?.(e)
    if (e.defaultPrevented || !trackPointerHover) {
      return
    }
    setHoveredStable(true)
  }

  const handleMouseLeave: MouseEventHandler<HTMLDivElement> = (e) => {
    onMouseLeave?.(e)
    if (e.defaultPrevented || !trackPointerHover) {
      return
    }
    setHoveredStable(false)
  }

  return (
    <CutoutCardContext.Provider value={ctx}>
      <motion.div
        animate={{ opacity: 1 }}
        className={cn(className)}
        data-slot="cutout-card"
        data-state={ctx.hovered ? "hovered" : "idle"}
        initial={{ opacity: 0 }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        transition={
          reduceMotion
            ? { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.36, ease: [0.22, 1, 0.36, 1] }
        }
        {...props}
      >
        {children}
      </motion.div>
    </CutoutCardContext.Provider>
  )
}

// ============================================================================
// Layout primitives
// ============================================================================

export type CutoutCardMediaProps = HTMLAttributes<HTMLDivElement>

export function CutoutCardMedia({ className, ...props }: CutoutCardMediaProps) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      data-slot="cutout-card-media"
      {...props}
    />
  )
}

export type CutoutCardImageProps = ImgHTMLAttributes<HTMLImageElement>

/** Parent `CutoutCardMedia` should be `relative` with a defined block size. */
export function CutoutCardImage({ className, alt = "", ...props }: CutoutCardImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={cn(
        "absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/cutout:scale-105",
        className
      )}
      data-slot="cutout-card-image"
      {...props}
    />
  )
}

export type CutoutCardOverlayProps = HTMLAttributes<HTMLDivElement>

export function CutoutCardOverlay({
  className,
  ...props
}: CutoutCardOverlayProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 bg-linear-to-t from-background/35 via-transparent to-transparent dark:from-background/50",
        className
      )}
      data-slot="cutout-card-overlay"
      {...props}
    />
  )
}

export type CutoutCardContentProps = HTMLAttributes<HTMLDivElement>

export function CutoutCardContent({
  className,
  ...props
}: CutoutCardContentProps) {
  return (
    <div
      className={cn("p-6", className)}
      data-slot="cutout-card-content"
      {...props}
    />
  )
}

export type CutoutCardFooterProps = HTMLAttributes<HTMLDivElement>

export function CutoutCardFooter({
  className,
  ...props
}: CutoutCardFooterProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      data-slot="cutout-card-footer"
      {...props}
    />
  )
}

// ============================================================================
// Cutout geometry
// ============================================================================

export type CutoutCornerProps = ComponentProps<"svg"> & {
  /** Pixel width/height of the SVG viewBox (square). */
  size?: number
}

export function CutoutCorner({
  className,
  size = 32,
  viewBox = "0 0 200 200",
  ...props
}: CutoutCornerProps) {
  return (
    <>
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative corner mask; hidden from AT via aria-hidden */}
      <svg
        aria-hidden
        className={cn(className)}
        data-slot="cutout-corner"
        height={size}
        viewBox={viewBox}
        width={size}
        xmlns="http://www.w3.org/2000/svg"
        {...props}
      >
        <path d={CORNER_PATH} fill="currentColor" />
      </svg>
    </>
  )
}

export type CutoutCardInsetLabelProps = HTMLAttributes<HTMLDivElement>

/** Absolutely positioned strip (e.g. bottom-left “Featured”); add corners as siblings inside. Static (no entrance motion) to avoid compositing seams next to the media edge. */
export function CutoutCardInsetLabel({
  className,
  ...props
}: CutoutCardInsetLabelProps) {
  return (
    <div
      className={cn("absolute", className)}
      data-slot="cutout-card-inset-label"
      {...props}
    />
  )
}

export type CutoutCardPinProps = HTMLAttributes<HTMLDivElement>

/** Corner badge shell (e.g. top-right “New”); add corners as siblings inside. Static (no entrance motion). */
export function CutoutCardPin({ className, ...props }: CutoutCardPinProps) {
  return (
    <div
      className={cn("absolute", className)}
      data-slot="cutout-card-pin"
      {...props}
    />
  )
}

// ============================================================================
// Context-sensitive action region
// ============================================================================

export type CutoutCardActionProps = ComponentProps<typeof motion.div> & {
  /**
   * When true (default), visibility follows card hover from context.
   * Set false to always show the region.
   */
  revealOnHover?: boolean
}

export function CutoutCardAction({
  className,
  revealOnHover = true,
  ...props
}: CutoutCardActionProps) {
  const { hovered } = useCutoutCard()
  const reduceMotion = useReducedMotion()
  const visible = !revealOnHover || hovered

  return (
    <motion.div
      animate={
        visible
          ? { opacity: 1, transform: "translateY(0px)" }
          : { opacity: 0, transform: "translateY(8px)" }
      }
      className={cn(
        "absolute",
        revealOnHover && !visible && "pointer-events-none",
        className
      )}
      data-reveal={revealOnHover ? "hover" : "always"}
      data-slot="cutout-card-action"
      transition={
        reduceMotion
          ? { duration: 0.15, ease: [0.22, 1, 0.36, 1] }
          : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
      }
      {...props}
    />
  )
}
