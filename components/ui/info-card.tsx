"use client"

import type { ReactNode } from "react"
import { Send } from "lucide-react"

import { cn } from "@/lib/utils"

/* the ground is Dialog Stack's top card, value for value (user call, 2026-10-01): a solid
   8% foreground over the page, no outline */
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
   component with those as props. */

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
  title = "Need help?",
  line = "Ask about a component, an install or your own screen.",
  action = "Send a message",
  icon = <Send className="h-4 w-4" strokeWidth={1.75} />,
  href = "/contact",
  onPress,
  className,
}: InfoCardProps) {
  return (
    <div role="group" aria-label={title} className={cn("group/box bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] px-5 pb-[18px] pt-[18px]", CARD_RADIUS, className)}>
      <div className="text-[14px] font-semibold leading-snug text-foreground">{title}</div>
      <p className="mt-1 text-[11.5px] font-medium leading-[1.55] text-foreground/50">{line}</p>
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
