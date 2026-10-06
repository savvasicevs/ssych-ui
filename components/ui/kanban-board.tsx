"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight, RotateCcw } from "lucide-react"

import { cn } from "@/lib/utils"
import { ICON_BUTTON, RAISED, SURFACE } from "@/components/ui/control-classes"

/* Kanban Board, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: the work of one team in three columns, moved on with one press.
   Read first: the count at the head of each column, then the cards under it.
   The pointer: point at a card and the others dim, and its arrow comes up at its right
   with a tip that says where it goes (Move to In progress, Move to Done, Reopen). Press
   the arrow and the card travels to the next column; a card in Done goes back to Backlog.
   Lab sketch: src/components/lab/KanbanBoard.tsx. Kept: three columns, the card shape
   (id, title, tag, owner, column), a press that moves the card on the layout spring, the
   counts taken from the cards. Changed: no card around the board, no header bands,
   column rules or outlined chips; capitals are sentence case; a done card's title steps
   back. Colour (2026-09-30): each column head carries its state's dot, backlog ink, in
   progress amber (pending), done green, so the three states tell apart; owners are roles
   and read as text; the sentence that explained the click is now the readout. A done
   card did nothing when pressed; it reopens.
   Formulas:
   · count of a column = cards whose column it is (sample: 3, 3, 2)
   · cards             = Σ counts (3 + 3 + 2 = 8), read in the board's aria-label
   2026-10-02: the "8 cards" line under the board at rest is gone (his call: the board did
   not need it). The total stays in the aria-label and each column head carries its own
   count; the line under the board reads only the card being pointed at and keeps its
   height when empty.
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit: he said the board looked weird after the surfaces pass; the two steps
   were one level too high. Each column is now the surface (7%, 18px corners, 6px inset)
   and the cards sit raised on it at 12px corners (18 = 12 + 6), with equal 10px padding and
   a faint 4% hover over the raised fill. A press used to move a card with no affordance
   and Done looped silently to Backlog; the move is now an arrow icon button at the card's
   right, up on hover and focus (always shown on touch), with a tip naming where it goes,
   and Reopen on a done card. The readout line under the board repeated the card's id and
   tag, so it is gone; the owner is a 16px mark on the card (two letters on ink, or the
   caller's drawing through the new `renderIcon(owner, size)` prop) with the role in its
   tip. Card ids at /45.
   2026-10-02 round 2: the cards are an exchange ops and model ops board in place of the
   library team's own tickets: list TAO-PERP, backfill March fills, reconcile treasury
   wallets, rotate exchange API keys, rerun evals on the new checkpoint, raise BTC-PERP
   position limits, onboard a second market maker, fix gaps in book snapshots. The counts
   hold at 3, 3 and 2. */

/** the house layout spring, for a card that changes column */
const SPRING = { type: "spring", stiffness: 400, damping: 32 } as const
const EASE = [0.16, 1, 0.3, 1] as const
/** the state each column stands for: waiting is ink, pending amber, done green */
const STATE: Record<KanbanColumn, string> = {
  backlog: "color-mix(in srgb, var(--foreground) 35%, transparent)",
  progress: "var(--chart-amber)",
  done: "var(--chart-up)",
}

export type KanbanColumn = "backlog" | "progress" | "done"

export interface KanbanCard {
  id: string
  title: string
  tag: string
  /** the role that holds the card */
  owner: string
  col: KanbanColumn
}

export interface KanbanBoardProps {
  cards?: KanbanCard[]
  onMove?: (id: string, to: KanbanColumn) => void
  /** draws an owner's mark (16px) in place of two letters on ink */
  renderIcon?: (owner: string, size: number) => ReactNode
  className?: string
}

const COLUMNS: { key: KanbanColumn; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "progress", label: "In progress" },
  { key: "done", label: "Done" },
]

const NEXT: Record<KanbanColumn, KanbanColumn> = { backlog: "progress", progress: "done", done: "backlog" }
const NAME: Record<KanbanColumn, string> = { backlog: "Backlog", progress: "In progress", done: "Done" }
/** what the arrow says it will do */
const MOVE: Record<KanbanColumn, string> = { backlog: "Move to In progress", progress: "Move to Done", done: "Reopen" }

const DEFAULT_CARDS: KanbanCard[] = [
  { id: "OPS-41", title: "List TAO-PERP", tag: "Listings", owner: "Listings lead", col: "backlog" },
  { id: "OPS-42", title: "Backfill March fills", tag: "Data", owner: "Data engineer", col: "backlog" },
  { id: "OPS-43", title: "Reconcile treasury wallets", tag: "Treasury", owner: "Treasury analyst", col: "backlog" },
  { id: "OPS-44", title: "Rotate exchange API keys", tag: "Security", owner: "Security engineer", col: "progress" },
  { id: "OPS-45", title: "Rerun evals on the new checkpoint", tag: "Models", owner: "ML engineer", col: "progress" },
  { id: "OPS-46", title: "Raise BTC-PERP position limits", tag: "Risk", owner: "Risk manager", col: "progress" },
  { id: "OPS-47", title: "Onboard a second market maker", tag: "Listings", owner: "Listings lead", col: "done" },
  { id: "OPS-48", title: "Fix gaps in book snapshots", tag: "Data", owner: "Data engineer", col: "done" },
]

/** a role reads as the first letters of its words: Listings lead is LL */
const lettersOf = (owner: string) =>
  owner
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()

/** a tip over a control: up on hover or keyboard focus */
function Tip({ label, children, align = "right" }: { label: string; children: ReactNode; align?: "right" | "center" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-full z-20 mb-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] text-foreground/90 opacity-0 shadow-[0_4px_12px_var(--card-shadow,rgba(0,0,0,0.25))] transition-opacity duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100",
          align === "right" ? "right-0" : "left-1/2 -translate-x-1/2",
          RAISED,
        )}
      >
        {label}
      </span>
    </span>
  )
}

/**
 * A three-column board in the Linear register. Each card's arrow sends it to the next
 * column on the layout spring; every count is the cards in that column, so the numbers add up.
 */
export function KanbanBoard({ cards = DEFAULT_CARDS, onMove, renderIcon, className }: KanbanBoardProps) {
  const reduced = useReducedMotion() ?? false
  const ns = useId().replace(/:/g, "")
  const [col, setCol] = useState<Record<string, KanbanColumn>>(() => Object.fromEntries(cards.map((c) => [c.id, c.col])))
  const [hot, setHot] = useState<string | null>(null)
  /** cards rise in once on mount; a card that changes column rides the layout spring only */
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
  }, [])

  const at = (c: KanbanCard) => col[c.id] ?? c.col
  const counts = COLUMNS.map((k) => cards.filter((c) => at(c) === k.key).length)

  const press = (c: KanbanCard) => {
    const to = NEXT[at(c)]
    setCol((prev) => ({ ...prev, [c.id]: to }))
    onMove?.(c.id, to)
  }

  return (
    <div className={cn("w-[520px] max-w-full tabular-nums", className)} role="group" aria-label={`Board, ${cards.length} cards: ${COLUMNS.map((k, i) => `${counts[i]} ${k.label.toLowerCase()}`).join(", ")}`}>
      <div className="grid grid-cols-3 gap-2" onPointerLeave={() => setHot(null)}>
        {COLUMNS.map((column, ci) => (
          /* the column is the surface: 18 = 12 (the raised cards) + 6 (the p-1.5 inset) */
          <div key={column.key} role="group" aria-label={`${column.label}, ${counts[ci]} cards`} className={cn("flex min-h-[280px] flex-col rounded-[18px] p-1.5", SURFACE)}>
            <div className="flex items-baseline justify-between px-1.5 pb-2 pt-1">
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground/60">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: STATE[column.key] }} />
                {column.label}
              </span>
              <span className="text-[11px] font-medium text-foreground/90">{counts[ci]}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {cards
                .filter((c) => at(c) === column.key)
                .map((card) => {
                  const done = at(card) === "done"
                  const order = cards.indexOf(card)
                  return (
                    <motion.div
                      key={card.id}
                      role="group"
                      layout={!reduced}
                      layoutId={`${ns}-${card.id}`}
                      /* on mount the first 8 cards rise 6px, 35ms apart */
                      initial={mounted.current || order >= 8 ? false : reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        reduced
                          ? { duration: 0.15, delay: mounted.current ? 0 : order * 0.035 }
                          : { ...SPRING, opacity: { duration: 0.3, ease: EASE, delay: mounted.current ? 0 : order * 0.035 }, y: { duration: 0.3, ease: EASE, delay: mounted.current ? 0 : order * 0.035 } }
                      }
                      onPointerEnter={() => setHot(card.id)}
                      onFocus={() => setHot(card.id)}
                      onBlur={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHot(null)
                      }}
                      aria-label={`${card.id} ${card.title}, ${card.tag}, ${card.owner}, in ${NAME[at(card)]}`}
                      /* raised on the column; the hover is a faint 4% laid over the raised fill */
                      className={cn(
                        "group relative rounded-[12px] p-2.5 text-left transition-[opacity,box-shadow] duration-200 hover:shadow-[inset_0_0_0_100px_color-mix(in_srgb,var(--foreground)_4%,transparent)] motion-reduce:transition-none",
                        RAISED,
                      )}
                      style={{ opacity: hot !== null && hot !== card.id ? 0.45 : 1 }}
                    >
                      <span className={cn("block pr-6 text-[12px] leading-[1.4]", done ? "text-foreground/45" : "text-foreground/90")}>{card.title}</span>
                      <span className="mt-2 flex items-center gap-1.5">
                        <span title={card.owner} className="inline-flex shrink-0">
                          {renderIcon ? (
                            renderIcon(card.owner, 16)
                          ) : (
                            <span aria-hidden className="grid h-4 w-4 place-items-center rounded-full bg-foreground/[0.12] text-[7px] font-semibold text-foreground/70">
                              {lettersOf(card.owner)}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[10px] text-foreground/60">{card.tag}</span>
                        <span className="text-[10px] text-foreground/45">{card.id}</span>
                      </span>
                      {/* the move lives on the card: up on hover or focus, always shown on touch */}
                      <span className="absolute right-1.5 top-1.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                        <Tip label={MOVE[at(card)]}>
                          <button type="button" onClick={() => press(card)} aria-label={`${MOVE[at(card)]}: ${card.title}`} className={cn(ICON_BUTTON, "h-6 w-6")}>
                            {done ? <RotateCcw size={12} strokeWidth={1.75} aria-hidden /> : <ArrowRight size={12} strokeWidth={1.75} aria-hidden />}
                          </button>
                        </Tip>
                      </span>
                    </motion.div>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
