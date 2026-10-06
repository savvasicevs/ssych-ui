"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Check, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { BUTTON_PRIMARY } from "@/components/ui/control-classes"
import { rowWash } from "@/components/ui/row-action"

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
   · pending = approvers − approved (read out in the aria-label only)
   · the headline is the `amount` as given, $ grouped to 2dp
   2026-10-02 audit: the amount was hidden in a 13px title, so the header now has the three
   tiers: the action as the label (Release to settlement) at /45, the amount as the 26px
   headline with its decimals at /35, and "2 of 3 approved" as the sub line. The status line
   no longer sums three counts at rest. The two letter discs per role are gone (gate P2):
   a 14px check in ink when the role has signed, a clock while it waits. Pending is ink
   /45, only approved is green. The demo Reset is gone and the action the quorum guards is
   here: a Release button, disabled until the quorum is met, that plays out on press with a
   green wash, a tick and Released. New props: `label`, `amount`, `onRelease`; `title` now
   names the group for a screen reader (a custom title with no label still shows as the
   label, as before). */

const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const
const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const DEFAULT_TITLE = "Release $250,000.00 to settlement"

export interface Approver {
  /** the role that signs */
  name: string
  /** kept for callers that pass it; roles no longer wear letter discs (2026-10-02 audit) */
  initials: string
  /** when it signed, for approvals that arrive with the data */
  at?: string
}

export interface ApprovalQuorumProps {
  /** the action being held, read by a screen reader; shown as the label when no `label` is given */
  title?: string
  /** the action, as the label over the headline */
  label?: string
  /** the amount the action moves, in dollars; the headline */
  amount?: number
  approvers?: Approver[]
  /** approvals needed to unlock */
  quorum?: number
  /** indexes of the approvers that have already signed */
  initial?: number[]
  /** called once Release is pressed with the quorum met */
  onRelease?: () => void
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
 * N of M sign-off. The amount leads; each role is a row that says where it stands; the
 * meter has one segment per approval needed, and Release unlocks when the last fills.
 */
export function ApprovalQuorum({
  title = DEFAULT_TITLE,
  label,
  amount,
  approvers = DEFAULT_APPROVERS,
  quorum = 3,
  initial = DEFAULT_INITIAL,
  onRelease,
  className,
}: ApprovalQuorumProps) {
  const reduced = useReducedMotion()
  /* all state is this set: counts, meter and status derive from it */
  const [approvals, setApprovals] = useState<Set<number>>(() => new Set(initial))
  const [hot, setHot] = useState<number | null>(null)
  /* once pressed, the button washes green with a tick and Released, and the rows lock */
  const [done, setDone] = useState(false)

  const isDefault = title === DEFAULT_TITLE
  const shownLabel = label ?? (isDefault ? "Release to settlement" : title)
  const shownAmount = amount ?? (isDefault ? 250000 : undefined)
  const [whole, cents] = (shownAmount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(".")

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

  const press = () => {
    if (!met || done) return
    setDone(true)
    onRelease?.()
  }

  return (
    <div
      className={cn("w-[360px] max-w-full tabular-nums", className)}
      role="group"
      aria-label={`${title}. ${count} of ${quorum} approvals, ${met ? "quorum met" : `${remaining} more needed`}, ${pending} pending${done ? ", released" : ""}`}
    >
      {/* the three tiers (spec 14.1): the action, the amount, where the quorum stands */}
      <div className="px-3">
        <div className="mb-3 flex items-baseline justify-between text-[12px]">
          <span className="truncate text-foreground/45">{shownLabel}</span>
        </div>
        {shownAmount !== undefined && (
          <div className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-foreground/90">
            ${whole}
            <span className="text-foreground/35">.{cents}</span>
          </div>
        )}
        <div role="status" className="mt-2 text-[12px] font-medium" style={{ color: met ? GREEN : undefined }}>
          {/* the count swaps in place as a signature goes in or comes back (a change of intent) */}
          <motion.span
            key={met ? "met" : count}
            className={cn("inline-block", !met && "text-foreground/90")}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            {count} of {quorum} approved
          </motion.span>
        </div>
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

      <div className="mt-3" onPointerLeave={() => setHot(null)}>
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
                disabled={done}
                aria-label={`${a.name}: ${on ? `approved${a.at ? ` at ${a.at}` : ""}${done ? "" : ", press to take back"}` : `pending${done ? "" : ", press to approve"}`}`}
                onClick={() => toggle(i)}
                onPointerEnter={() => setHot(i)}
                onFocus={() => setHot(i)}
                onBlur={() => setHot(null)}
                initial={false}
                animate="rest"
                whileTap={reduced ? undefined : "lift"}
                /* a 36px row: 18 = half its height, a full pill */
                className={cn(
                  "flex h-9 w-full items-center gap-2.5 rounded-[18px] px-3 text-left outline-none transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] disabled:pointer-events-none motion-reduce:transition-none",
                  hot !== null && hot !== i && "opacity-50",
                )}
              >
                <motion.span
                  aria-hidden
                  variants={{ rest: { y: 0 }, lift: { y: -3 } }}
                  transition={reduced ? { duration: 0 } : LIFT_SPRING}
                  className={cn("grid h-3.5 w-3.5 shrink-0 place-items-center transition-colors duration-200", on ? "text-foreground/90" : "text-foreground/45")}
                >
                  {on ? <Check size={14} strokeWidth={2} /> : <Clock size={14} strokeWidth={1.75} />}
                </motion.span>
                <span className={cn("flex-1 text-[12px] transition-colors duration-200", on ? "font-medium text-foreground/90" : "text-foreground/70")}>{a.name}</span>
                <span
                  className={cn("text-[11px] transition-colors duration-200 motion-reduce:transition-none", !on && "text-foreground/45")}
                  style={on ? { color: GREEN } : undefined}
                >
                  {on ? (a.at ? `Approved ${a.at}` : "Approved") : "Pending"}
                </span>
              </motion.button>
            </motion.div>
          )
        })}
      </div>

      {/* the action the quorum guards: locked until it is met, then it plays out on press */}
      <div className="mt-3 px-3">
        <button
          type="button"
          disabled={!met}
          aria-disabled={done || undefined}
          onClick={press}
          className={cn(BUTTON_PRIMARY, "h-9 text-[13px]", done && "pointer-events-none")}
          style={done ? { background: rowWash(GREEN), color: GREEN } : undefined}
        >
          <motion.span
            key={done ? "released" : "release"}
            className="inline-flex items-center gap-1.5"
            initial={reduced ? false : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            {done && <Check size={14} strokeWidth={2.2} aria-hidden />}
            {done ? "Released" : "Release"}
          </motion.span>
        </button>
      </div>
    </div>
  )
}
