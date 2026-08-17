"use client"

import { useState, type CSSProperties } from "react"
import { ArrowUpRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  CutoutCard,
  CutoutCardMedia,
  CutoutCardOverlay,
  CutoutCardAction,
} from "@/components/ui/cutout-card"
import { MetalFx } from "metal-fx"
import { type CardData } from "@/components/ui/project-card-utils"

/** Switcher-matched card surface (gradient bg + bezel stroke). */
const SURFACE_STYLE: CSSProperties = {
  background: "linear-gradient(180deg, var(--panel) 0%, var(--surface-soft) 100%)",
  border: "1px solid color-mix(in srgb, var(--foreground) 5%, transparent)",
  borderTop: "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
}

// The project image, heavily blurred + over-scaled so it reads as an ambient
// color gradient rather than the literal screenshot. (No video — that's the
// "actual visual" we're replacing.)
const BLUR_MEDIA =
  "absolute inset-0 h-full w-full scale-[1.75] object-cover blur-[44px] saturate-[1.4] brightness-90 transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/cutout:scale-[2]"

function CardMedia({ card }: { card: CardData }) {
  const src = card.image
  if (!src) {
    return (
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 30% 25%, #1b2433, var(--surface) 70%)" }}
      />
    )
  }
  return <img src={src} alt="" aria-hidden className={BLUR_MEDIA} />
}

/**
 * The shared project card — a CutoutCard with blurred-gradient media, a
 * hover-reveal action, and a liquid-metal hover ring. Used by CardStack,
 * CardGrid, and CardList. The parent supplies size + positioning.
 *
 * `variant`   "overlay" = media-fill with a scooped content tray (stack/grid);
 *             "list"     = horizontal media + text row.
 * `emphasis`  text scale for the overlay tray ("lg" for stack, "sm" for grid).
 */
export function ProjectCard({
  card,
  variant = "overlay",
  emphasis = "lg",
}: {
  card: CardData
  variant?: "overlay" | "list"
  emphasis?: "lg" | "sm"
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="relative h-full w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CutoutCard
        style={SURFACE_STYLE}
        className={cn(
          "group/cutout relative z-10 overflow-hidden rounded-[28px] transition-colors duration-500",
          variant === "list" ? "flex w-full flex-col items-stretch sm:flex-row" : "h-full w-full"
        )}
      >
        {variant === "list" ? (
          <>
            {/* media fills the whole row; it fades to black before the text
                column, so the type never sits on the image itself */}
            <CutoutCardMedia className="absolute inset-0">
              <CardMedia card={card} />
              <div
                aria-hidden
                className="absolute inset-0 sm:hidden"
                style={{ background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 55%, #000 82%)" }}
              />
              <div
                aria-hidden
                className="absolute inset-0 hidden sm:block"
                style={{ background: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.85) 40%, #000 60%)" }}
              />
            </CutoutCardMedia>
            <div className="relative z-10 ml-auto flex min-h-[124px] w-full min-w-0 flex-col justify-end py-5 pl-5 pr-12 pt-24 sm:w-[55%] sm:justify-center sm:pt-5">
              <h3 className="truncate text-[18px] font-semibold text-white/95">{card.title}</h3>
              <p className="mt-1.5 line-clamp-2 text-[14px] text-white/60">{card.description}</p>
            </div>
            {/* blur: the project photo underneath — the arrow sits directly on the
                media, and a flat scrim at this size would punch a hole in the image. */}
            <CutoutCardAction className="right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur sm:top-1/2 sm:-translate-y-1/2">
              <ArrowUpRight className="h-4 w-4" />
            </CutoutCardAction>
          </>
        ) : (
          <>
            <CutoutCardMedia className="absolute inset-0">
              <CardMedia card={card} />
              <CutoutCardOverlay className="from-black/40 via-transparent to-transparent" />
              {/* the image runs the full card and dissolves to black just above
                  the title — no tray, no second surface, the type stands on
                  the fade */}
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[58%]"
                style={{ background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.88) 52%, #000 100%)" }}
              />
            </CutoutCardMedia>

            {/* blur: the project photo underneath — same reason as the overlay variant. */}
            <CutoutCardAction className="right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur">
              <ArrowUpRight className="h-4 w-4" />
            </CutoutCardAction>

            <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-5 pt-4">
              <h3
                className={cn(
                  "font-semibold text-white/95",
                  emphasis === "lg" ? "text-[20px] sm:text-[24px]" : "text-[16px]"
                )}
              >
                {card.title}
              </h3>
              <p
                className={cn(
                  "mt-1 line-clamp-2 text-white/60",
                  emphasis === "lg" ? "max-w-2xl text-[14px] sm:text-[16px]" : "text-[12px] sm:text-[14px]"
                )}
              >
                {card.description}
              </p>
            </div>
          </>
        )}
      </CutoutCard>

      {/* Liquid-metal stroke — masked ring shown only while hovering. */}
      {hovered && (
        <span
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[28px]"
          style={{
            padding: "1px",
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        >
          <MetalFx variant="button" preset="silver" theme="dark" normalizeHostStyles={false}>
            <span className="block h-[760px] w-[1120px]" />
          </MetalFx>
        </span>
      )}
    </div>
  )
}
