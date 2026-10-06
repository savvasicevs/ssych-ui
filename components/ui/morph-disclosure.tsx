"use client"

import { useId, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { SURFACE } from "@/components/ui/control-classes"

/* Morph Disclosure, promoted through ssych-component (2026-09-29).
   What it is for: a row in a list of projects that opens in place into its own short
   sheet: a summary and a few facts, without leaving the list.
   Read first: the title; opened, the facts under the summary.
   The pointer: the whole head row is the target. Pressing it grows the row into the sheet
   and turns the plus into a cross; pressing again or Escape folds it back.
   Pointing at a fact dims the others.
   Sketch: lab/MorphDisclosure. Kept `title`, `tag`, `summary`, `specs` as label and value
   pairs, `onOpenChange`, the row that grows in place and Escape to close.
   Changed: every prop has a default, a made up project, since the sketch's demo named
   clients; the outline, the moving shine around the open card, the blue gradients and the
   glowing green dot are gone: the row is a faint fill with an 8px corner that gets one
   step stronger when open; tag and fact labels are sentence case; the plus and the cross
   are drawn, not typed; it starts open (`defaultOpen`) so the sheet is there to be seen;
   Escape is heard while the focus is inside, not window-wide; the grow takes 250ms on grid
   rows (0fr to 1fr, no height animation), down from 450, and the plus turns with it.
   No figures are derived here.
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit: one 12px inset all round (it was 16 at the sides and 12 at the bottom),
   so the card's corner is the card corner, 24, set from the 12px blocks inside at 12px.
   The Close pill is gone: the head's plus that turns to a cross already closes it, as does
   Escape. The card stays on the 7% surface open or shut (it went to 9%, off the two
   steps), and the pointer lays a 4% wash over the head instead. The hairline between the
   head and the summary is space now. Fact labels read at 60%.
   2026-10-02 round 2: his note was that the side paddings were lost. The inset is back to
   the 16px it had at the sides, now on all four sides (p-4), so the title, the summary and
   the facts sit 16px in from every edge. The head row is 24px, so the card shut is 56px
   (16 + 24 + 16) and the head's wash covers the top 48px when open (16 + 24 + the 8 above
   the summary). Corners nest: the card is 24 and the fact rows' hover fill reaches 8px from
   its edge (they keep their 8px of padding inside the 16), so its corner is 16 = 24 − 8. */

/** the grow and the plus share one curve so they move as one */
const SMOOTH = [0.22, 1, 0.36, 1] as const

export interface MorphSpec {
  label: string
  value: string
}

export interface MorphDisclosureProps {
  title?: string
  tag?: string
  summary?: string
  specs?: MorphSpec[]
  defaultOpen?: boolean
  /** told on open and close, so a parent can dim what is around it */
  onOpenChange?: (open: boolean) => void
  className?: string
}

const DEFAULT_SPECS: MorphSpec[] = [
  { label: "Role", value: "Product design" },
  { label: "Year", value: "2025" },
  { label: "Surface", value: "Operator console" },
  { label: "Screens", value: "14" },
]

/**
 * A project row that grows in place into a short sheet of summary and facts, and folds
 * back.
 */
export function MorphDisclosure({
  title = "Ledger console",
  tag = "Agent console",
  summary = "An operator surface for agents that reconcile a ledger: approval queues, a live stream of what the agent is doing, and a way to correct it before anything leaves the system.",
  specs = DEFAULT_SPECS,
  defaultOpen = true,
  onOpenChange,
  className,
}: MorphDisclosureProps) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const [open, setOpen] = useState(defaultOpen)
  const [hot, setHot] = useState<number | null>(null)

  const set = (v: boolean) => {
    setOpen(v)
    onOpenChange?.(v)
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) set(false)
      }}
      /* 24, the card corner: the fact rows' 16 + the 8px they stand off the edge (spec 13.10) */
      className={cn("relative w-[380px] max-w-full rounded-[24px] p-4 tabular-nums", SURFACE, className)}
    >
      <button
        type="button"
        onClick={() => set(!open)}
        aria-expanded={open}
        aria-controls={`${uid}-sheet`}
        /* the head's target and its 4% wash reach the card's edges: the whole card while shut,
           the top 48px (16 + 24 + the 8 above the summary) while open, so the whole head row
           answers, not only its words */
        className={cn(
          "group flex h-6 w-full items-center justify-between gap-4 text-left outline-none",
          "after:absolute after:inset-x-0 after:top-0 after:rounded-[24px] after:transition-colors after:duration-200 hover:after:bg-foreground/[0.04] focus-visible:after:bg-foreground/[0.06]",
          open ? "after:h-[48px] after:rounded-b-none" : "after:bottom-0",
        )}
      >
        <span className="truncate text-[13px] font-medium text-foreground/90">{title}</span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-[10.5px] text-foreground/45">{tag}</span>
          <motion.svg
            aria-hidden
            width={10}
            height={10}
            viewBox="0 0 10 10"
            className="text-foreground/45 transition-colors duration-200 group-hover:text-foreground/90"
            initial={false}
            animate={{ rotate: open ? 45 : 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.25, ease: SMOOTH }}
          >
            <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
          </motion.svg>
        </span>
      </button>

      {/* the sheet grows on grid rows 0fr → 1fr over 250ms, the same both ways; shut, it is
          inert. Reduced motion keeps only the fade */}
      <div
        id={`${uid}-sheet`}
        inert={!open}
        className="grid"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transition: reduced ? "opacity 150ms" : "grid-template-rows 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="min-h-0 overflow-hidden">
            <div className="pt-2">
              <div className="text-[12px] leading-relaxed text-foreground/70">{summary}</div>

              <div className="mt-3" role="list" aria-label={`${title} in facts`} onPointerLeave={() => setHot(null)}>
                {specs.map((s, i) => (
                  <div
                    key={s.label}
                    role="listitem"
                    onPointerEnter={() => setHot(i)}
                    className="-mx-2 flex items-baseline justify-between rounded-[16px] px-2 py-[7px] transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.04]"
                    style={{ opacity: hot !== null && hot !== i ? 0.45 : 1 }}
                  >
                    <span className="text-[11px] text-foreground/60">{s.label}</span>
                    <span className="text-[11.5px] font-medium text-foreground/90">{s.value}</span>
                  </div>
                ))}
              </div>

            </div>
        </div>
      </div>
    </div>
  )
}
