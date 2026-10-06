"use client"

import type { ReactNode } from "react"
import { PiggyBank } from "lucide-react"

import { cn } from "@/lib/utils"

/* the ground is the surface step (spec 14.8): a solid 7% foreground over the page, no outline */
/** the library's one card corner, copied from src/components/library/controls.ts (CARD_RADIUS) */
const CARD_RADIUS = "rounded-[24px]"

/* Info Card, the rail's small card (shell primitives brief, 2026-09-30).
   What it is for: one statement with one way to act on it: "Need help?", "Request a free
   component", "Generator". Two or three of them sit under the Pro card in the right rail.
   Read first: the title, then the line. At rest that is all there is, so a rail of them
   reads as statements, not as statements with links under them.
   The pointer: on the card (or the keyboard's focus inside it) the action row opens, its
   height easing from nothing over 250ms and its label fading in; leaving closes it. A touch screen
   has no pointer to wait for, so there the row is always open. The action itself is a
   real link or button, in the tab order even while its row is shut.
   Taken from: src/components/library/SidebarInfoMenu.tsx, boxClass, titleClass,
   bodyClass, actionClass and Reveal, class for class. The corner is controls.ts (24px);
   the text inset is React Bits' 20px.
   Decided: nothing. The shell's three cards differ only in words and icon, so this is one
   component with those as props.
   2026-10-02 audit: his note said the right padding was wrong, so the inset is now one 20px
   value on all four sides (the corner holds only text, so no nesting sum applies) and the line
   sets balanced so its last word never sits alone and reads as a gap at the right. The fill
   moved to the 7% surface step, the title to 13px medium /90 and the line to 12px /60 so it
   reads; the default width is the rail's 280px.
   2026-10-02 round 2: the defaults are a fintech callout (idle USDC earning 4.8%, with Move to
   yield) instead of the library's own help card. Nothing in the library shell renders this
   component, so no rail copy depended on the old words. */

export interface InfoCardProps {
  title?: string
  line?: string
  action?: string
  /** the action's icon, a Phosphor glyph at 16px */
  icon?: ReactNode
  href?: string
  onPress?: () => void
  className?: string
}

/** The action row: shut until the card is pointed at or focused into, open on touch. */
function Reveal({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-within/box:grid-rows-[1fr] group-focus-within/box:opacity-100 group-hover/box:grid-rows-[1fr] group-hover/box:opacity-100 motion-reduce:transition-[opacity] [@media(hover:none)]:grid-rows-[1fr] [@media(hover:none)]:opacity-100">
      <div className="flex min-h-0 flex-col overflow-hidden">{children}</div>
    </div>
  )
}

/** colour 150ms; a press gives to 0.97, dropped under reduced motion */
const ACTION = "mt-3 inline-flex items-center gap-1.5 self-start text-[12px] font-semibold text-foreground/80 transition-[color,scale] duration-150 hover:text-foreground active:scale-[0.97] motion-reduce:active:scale-100"

/**
 * A quiet card with a title, one line, and an action that shows itself when the card
 * is pointed at.
 */
export function InfoCard({
  title = "Idle USDC earns 4.8%",
  line = "12,400 USDC sits idle in spot. In yield it accrues daily and you can withdraw any time.",
  action = "Move to yield",
  icon = <PiggyBank className="h-4 w-4" strokeWidth={1.75} />,
  href = "#yield",
  onPress,
  className,
}: InfoCardProps) {
  return (
    <div role="group" aria-label={title} className={cn("group/box w-[280px] bg-background shadow-[0_0_0_1px_var(--light-outline,color-mix(in_srgb,var(--foreground)_9%,transparent)),0_1px_2px_rgba(0,0,0,0.04)] dark:bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] dark:shadow-none p-5", CARD_RADIUS, className)}>
      <div className="text-[13px] font-medium leading-snug text-foreground/90">{title}</div>
      <p className="mt-1 text-balance text-[12px] leading-[1.55] text-foreground/60">{line}</p>
      <Reveal>
        {onPress ? (
          <button type="button" onClick={onPress} className={ACTION}>
            {icon}
            {action}
          </button>
        ) : (
          <a href={href} className={ACTION}>
            {icon}
            {action}
          </a>
        )}
      </Reveal>
    </div>
  )
}
