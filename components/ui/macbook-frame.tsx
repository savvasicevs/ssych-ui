import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

/* MacBook Frame: a front-facing laptop to set a screen in.
   2026-10-02 audit: the base was a gradient between two hard-coded hexes and the lid carried
   an outline under a big shadow, so both are flat token fills now: the lid is the 7% surface
   step with one soft shadow and no outline, the display has no border, and the base is the
   12% raised step with the lid-open notch cut in the surface step. The display corner nests
   in the lid: 18 = 8 + the 10px bezel. The default width is 640, the Device frame family's one
   width (Browser Window is the same), and it still shrinks in a narrow parent. */

const LID = "bg-background shadow-[0_0_0_1px_var(--light-outline,color-mix(in_srgb,var(--foreground)_9%,transparent)),0_1px_2px_rgba(0,0,0,0.04)] dark:bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] dark:shadow-none"
const BASE = "bg-[color-mix(in_srgb,var(--foreground)_12%,var(--background))]"

/** Front-facing MacBook mockup — render anything (a screenshot, gradient, app) on the screen. */
export function MacbookFrame({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex w-[640px] max-w-full flex-col items-center justify-center", className)}>
      {/* lid / screen: 18 = the display's 8 + the 10px bezel */}
      <div
        className={cn("relative w-full rounded-[18px] p-[10px]", LID)}
        style={{ boxShadow: "0 24px 60px -24px var(--card-shadow, rgba(0,0,0,0.5))" }}
      >
        {/* camera */}
        <span className="absolute left-1/2 top-[4px] z-10 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-foreground/20" />
        {/* display */}
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[8px] bg-background">{children}</div>
      </div>
      {/* base / bottom deck — matches the lid width so it never overflows (no scrollbar) */}
      <div className={cn("relative h-[12px] w-full rounded-b-[12px] rounded-t-[2px]", BASE)}>
        {/* lid-open notch */}
        <span className={cn("absolute left-1/2 top-0 h-[6px] w-[15%] -translate-x-1/2 rounded-b-[8px]", LID)} />
      </div>
    </div>
  )
}
