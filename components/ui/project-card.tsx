import { useState, type CSSProperties } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  CutoutCard,
  CutoutCardMedia,
  CutoutCardOverlay,
  CutoutCardAction,
  CutoutCorner,
} from "@/components/ui/cutout-card";
import { MetalFx } from "metal-fx";
import { type CardData } from "@/components/ui/project-card-utils";

/** Switcher-matched card surface (gradient bg + bezel stroke). */
const SURFACE_STYLE: CSSProperties = {
  background: "linear-gradient(180deg, #0e121b 0%, #070a11 100%)",
  border: "1px solid rgba(255,255,255,0.05)",
  borderTop: "1px solid rgba(255,255,255,0.1)",
};

// The project image, heavily blurred + over-scaled so it reads as an ambient
// color gradient rather than the literal screenshot. (No video — that's the
// "actual visual" we're replacing.)
const BLUR_MEDIA =
  "absolute inset-0 h-full w-full scale-[1.75] object-cover blur-[44px] saturate-[1.4] brightness-90 transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/cutout:scale-[2]";

function CardMedia({ card }: { card: CardData }) {
  const src = card.image;
  if (!src) {
    return (
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 30% 25%, #1b2433, #0a0e16 70%)" }}
      />
    );
  }
  return <img src={src} alt="" aria-hidden className={BLUR_MEDIA} />;
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
  card: CardData;
  variant?: "overlay" | "list";
  emphasis?: "lg" | "sm";
}) {
  const [hovered, setHovered] = useState(false);

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
            <CutoutCardMedia className="relative aspect-[16/9] w-full shrink-0 overflow-hidden border-b border-white/5 bg-secondary sm:aspect-[3/2] sm:w-72 sm:border-b-0 sm:border-r">
              <CardMedia card={card} />
            </CutoutCardMedia>
            <div className="flex min-w-0 flex-1 flex-col justify-center py-5 pl-5 pr-12">
              <h3 className="truncate text-lg font-semibold text-card-foreground">{card.title}</h3>
              <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{card.description}</p>
            </div>
            <CutoutCardAction className="right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/70 text-foreground backdrop-blur sm:top-1/2 sm:-translate-y-1/2">
              <ArrowUpRight className="h-4 w-4" />
            </CutoutCardAction>
          </>
        ) : (
          <>
            <CutoutCardMedia className="absolute inset-0">
              <CardMedia card={card} />
              <CutoutCardOverlay className="from-black/40 via-transparent to-transparent" />
            </CutoutCardMedia>

            <CutoutCardAction className="right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur">
              <ArrowUpRight className="h-4 w-4" />
            </CutoutCardAction>

            {/* Cutout content tray — scooped out of the media via concave corners */}
            <div
              className="absolute inset-x-0 bottom-0 z-10 px-5 pb-5 pt-4"
              style={{ background: "linear-gradient(180deg, #0e121b 0%, #070a11 100%)" }}
            >
              <CutoutCorner aria-hidden size={26} className="absolute bottom-full left-0 -scale-x-100 text-[#0e121b]" />
              <CutoutCorner aria-hidden size={26} className="absolute bottom-full right-0 text-[#0e121b]" />
              <h3
                className={cn(
                  "font-semibold text-card-foreground",
                  emphasis === "lg" ? "text-xl sm:text-2xl" : "text-base"
                )}
              >
                {card.title}
              </h3>
              <p
                className={cn(
                  "mt-1 line-clamp-2 text-muted-foreground",
                  emphasis === "lg" ? "max-w-2xl text-sm sm:text-base" : "text-xs sm:text-sm"
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
  );
}
