"use client"

import { useId, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Morph Disclosure, promoted through ssych-component (2026-09-29).
   What it is for: a row in a list of projects that opens in place into its own short
   sheet: a summary and a few facts, without leaving the list.
   Read first: the title; opened, the facts under the summary.
   The pointer: the whole head row is the target. Pressing it grows the row into the sheet
   and turns the plus into a cross; pressing again, "Close" or Escape folds it back.
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
   No figures are derived here. */

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
      /* 14 (the 28px Close pill) + 12 bottom padding = 26 */
      className={cn(
        "w-full max-w-[380px] rounded-[26px] tabular-nums transition-colors duration-200",
        open ? "bg-foreground/[0.05]" : "bg-foreground/[0.03] hover:bg-foreground/[0.05]",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => set(!open)}
        aria-expanded={open}
        aria-controls={`${uid}-sheet`}
        /* flush with the panel's top, so it takes the panel's 26 */
        className="group flex h-11 w-full items-center justify-between gap-4 rounded-[26px] px-4 text-left outline-none focus-visible:bg-foreground/[0.04]"
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
          inert, so its Close is out of the tab order. Reduced motion keeps only the fade */}
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
            <div className="px-4 pb-3">
              <div aria-hidden className="h-px bg-foreground/[0.05]" />
              <div className="pt-3 text-[12px] leading-relaxed text-foreground/70">{summary}</div>

              <div className="mt-3" role="list" aria-label={`${title} in facts`} onPointerLeave={() => setHot(null)}>
                {specs.map((s, i) => (
                  <div
                    key={s.label}
                    role="listitem"
                    onPointerEnter={() => setHot(i)}
                    className="-mx-2 flex items-baseline justify-between rounded-[4px] px-2 py-[7px] transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.04]"
                    style={{ opacity: hot !== null && hot !== i ? 0.45 : 1 }}
                  >
                    <span className="text-[11px] text-foreground/45">{s.label}</span>
                    <span className="text-[11.5px] font-medium text-foreground/90">{s.value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => set(false)}
                  className="h-7 rounded-full bg-foreground/[0.08] px-3 text-[11.5px] text-foreground/80 outline-none transition-[color,background-color,scale] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 hover:bg-foreground/[0.12] hover:text-foreground focus-visible:bg-foreground/[0.12]"
                >
                  Close
                </button>
              </div>
            </div>
        </div>
      </div>
    </div>
  )
}
