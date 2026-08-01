import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Front-facing MacBook mockup — render anything (a screenshot, gradient, app) on the screen. */
export function MacbookFrame({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex w-full flex-col items-center justify-center", className)}>
      {/* lid / screen */}
      <div className="relative w-full max-w-[860px] rounded-[18px] border border-foreground/[0.08] bg-[var(--surface-soft)] p-[10px] shadow-[0_30px_80px_-26px_rgba(0,0,0,0.85)]">
        {/* camera */}
        <span className="absolute left-1/2 top-[4px] z-10 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-foreground/20" />
        {/* display */}
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[9px] border border-foreground/[0.06] bg-[var(--surface)]">
          {children}
        </div>
      </div>
      {/* base / bottom deck — matches the lid width so it never overflows (no scrollbar) */}
      <div className="relative h-[12px] w-full max-w-[860px] rounded-b-[12px] rounded-t-[2px] border-t border-foreground/[0.12] bg-gradient-to-b from-[#1b1f29] via-[var(--surface)] to-[#04060c] shadow-[0_18px_30px_-12px_rgba(0,0,0,0.7)]">
        {/* lid-open notch */}
        <span className="absolute left-1/2 top-0 h-[6px] w-[15%] -translate-x-1/2 rounded-b-[8px] bg-[var(--surface-soft)]" />
      </div>
    </div>
  );
}
