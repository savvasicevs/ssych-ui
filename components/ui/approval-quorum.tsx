"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Approval Quorum, new through ssych-component (2026-09-29).
   What it is for: an action that unlocks only when N of M approvers have signed.
   Read first: the state line, as text: how many are in, how many are still needed, or
   that the quorum is met.
   What the pointer does: pointing at an approver dims the others; pressing one signs
   for that role, pressing again takes the signature back. The coin lifts on the press.
   Sketch: src/components/lab/ApprovalQuorum.tsx. Kept: the data shape (approvers with
   name and initials, quorum), one Set of approvals that every number derives from, the
   meter that walks to the quorum, the lift spring on the coin, the status text, Reset.
   Changed: no card, header band, outline or rings; approvers are rows with the role and
   its state written out, so nothing depends on a tooltip; roles, not people; amber is
   gone from the gate, the meter is ink until the quorum is met and green after; the meter
   is one segment per needed approval. Each row's state is green once approved and amber
   while pending (given back 2026-09-30: they are done and waiting states).
   Formulas:
   · approved = size of the approvals set
   · still needed = max(0, quorum − approved)
   · meter segments filled = min(approved, quorum) of quorum
   · pending = approvers − approved */

const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
/* pending is the waiting state, so it carries amber; a signature is done, so it is green */
const AMBER = "var(--chart-amber)"

export interface Approver {
  /** the role that signs */
  name: string
  initials: string
  /** when it signed, for approvals that arrive with the data */
  at?: string
}

export interface ApprovalQuorumProps {
  /** the action being held */
  title?: string
  approvers?: Approver[]
  /** approvals needed to unlock */
  quorum?: number
  /** indexes of the approvers that have already signed */
  initial?: number[]
  className?: string
}

const DEFAULT_APPROVERS: Approver[] = [
  { name: "Risk", initials: "Ri", at: "09:14" },
  { name: "Treasury", initials: "Tr", at: "09:31" },
  { name: "Ops", initials: "Op" },
  { name: "Compliance", initials: "Co" },
  { name: "Finance", initials: "Fi" },
]

const DEFAULT_INITIAL = [0, 1]

/**
 * N of M sign-off. Each role is a row that says where it stands; the meter has one
 * segment per approval needed and turns green with the status line when the last fills.
 */
export function ApprovalQuorum({
  title = "Release $250,000.00 to settlement",
  approvers = DEFAULT_APPROVERS,
  quorum = 3,
  initial = DEFAULT_INITIAL,
  className,
}: ApprovalQuorumProps) {
  const reduced = useReducedMotion()
  /* all state is this set: counts, meter and status derive from it */
  const [approvals, setApprovals] = useState<Set<number>>(() => new Set(initial))
  const [hot, setHot] = useState<number | null>(null)

  const count = approvals.size
  const met = count >= quorum
  const remaining = Math.max(0, quorum - count)
  const filled = Math.min(count, quorum)
  const pending = approvers.length - count

  const toggle = (i: number) =>
    setApprovals((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div
      className={cn("w-full max-w-[360px] tabular-nums", className)}
      role="group"
      aria-label={`${title}. ${count} of ${quorum} approvals, ${met ? "quorum met" : `${remaining} more needed`}`}
    >
      <div className="flex items-baseline justify-between gap-3 px-3">
        <span className="truncate text-[13px] font-medium text-foreground/90">{title}</span>
      </div>

      <div aria-hidden className="mt-3 flex gap-[3px] px-3">
        {Array.from({ length: quorum }, (_, i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-colors duration-200 motion-reduce:transition-none"
            style={{ background: i < filled ? (met ? GREEN : "color-mix(in srgb, var(--foreground) 90%, transparent)") : "color-mix(in srgb, var(--foreground) 10%, transparent)" }}
          />
        ))}
      </div>

      <div role="status" className="mt-2 px-3 text-[11.5px]">
        {met ? (
          <motion.span
            key="met"
            className="inline-block font-medium"
            style={{ color: GREEN }}
            initial={reduced ? false : { opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
          >
            Quorum met · unlocked
          </motion.span>
        ) : (
          /* the count swaps in place as a signature goes in or comes back: a 4px rise
             through a 2px blur */
          <motion.span
            key={count}
            className="inline-block"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            <span className="font-medium text-foreground/90">
              {count} of {quorum} approved
            </span>
            <span className="text-foreground/45">
              {" "}
              · {remaining} more needed · {pending} pending
            </span>
          </motion.span>
        )}
      </div>

      <div className="mt-2.5" onPointerLeave={() => setHot(null)}>
        {approvers.map((a, i) => {
          const on = approvals.has(i)
          return (
            /* the rows rise in once, 35ms apart; the wrapper owns the entrance so the
               button keeps its own dim */
            <motion.div
              key={a.name}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
            >
            <motion.button
              type="button"
              aria-pressed={on}
              aria-label={`${a.name}: ${on ? `approved${a.at ? ` at ${a.at}` : ""}, press to take back` : "pending, press to approve"}`}
              onClick={() => toggle(i)}
              onPointerEnter={() => setHot(i)}
              onFocus={() => setHot(i)}
              onBlur={() => setHot(null)}
              initial={false}
              animate="rest"
              whileTap={reduced ? undefined : "lift"}
              /* 12 (the 24px round avatar) + 6 top padding = 18 */
              className={cn(
                "flex w-full items-center gap-3 rounded-[18px] px-3 py-1.5 text-left outline-none transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] motion-reduce:transition-none",
                hot !== null && hot !== i && "opacity-50",
              )}
            >
              <motion.span
                aria-hidden
                variants={{ rest: { y: 0 }, lift: { y: -3 } }}
                transition={reduced ? { duration: 0 } : LIFT_SPRING}
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold transition-colors duration-200 motion-reduce:transition-none",
                  on ? "bg-foreground text-background" : "bg-foreground/[0.06] text-foreground/45",
                )}
              >
                {a.initials}
              </motion.span>
              <span className={cn("flex-1 text-[12px] transition-colors duration-200", on ? "font-medium text-foreground/90" : "text-foreground/70")}>{a.name}</span>
              <span className="text-[11px] transition-colors duration-200 motion-reduce:transition-none" style={{ color: on ? GREEN : AMBER }}>
                {on ? (a.at ? `Approved ${a.at}` : "Approved") : "Pending"}
              </span>
            </motion.button>
            </motion.div>
          )
        })}
      </div>

      <div className="mt-1 flex justify-end px-3">
        <button
          type="button"
          onClick={() => setApprovals(new Set(initial))}
          className="-mr-2 rounded-full px-2 py-0.5 text-[10.5px] font-medium text-foreground/45 outline-none transition-[color,transform,translate,scale,rotate] duration-150 hover:text-foreground/90 focus-visible:bg-foreground/[0.06] active:scale-[0.97] motion-reduce:transition-none"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
