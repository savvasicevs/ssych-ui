"use client"

import { useEffect, useId, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Kanban Board, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: the work of one team in three columns, moved on with one press.
   Read first: the count at the head of each column, then the cards under it.
   The pointer: point at a card and the others dim; the line under the board reads its
   id, tag and owner, and where a press will send it. Press a card and it travels to the
   next column; a card in Done goes back to Backlog.
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
   · cards             = Σ counts (3 + 3 + 2 = 8) */

/** the house layout spring, for a card that changes column */
const SPRING = { type: "spring", stiffness: 400, damping: 32 } as const
const LIFT = { type: "spring", stiffness: 500, damping: 30 } as const
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
  className?: string
}

const COLUMNS: { key: KanbanColumn; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "progress", label: "In progress" },
  { key: "done", label: "Done" },
]

const NEXT: Record<KanbanColumn, KanbanColumn> = { backlog: "progress", progress: "done", done: "backlog" }
const NAME: Record<KanbanColumn, string> = { backlog: "Backlog", progress: "In progress", done: "Done" }

const DEFAULT_CARDS: KanbanCard[] = [
  { id: "SSI-21", title: "Ship the metrics group", tag: "Lab", owner: "Design lead", col: "backlog" },
  { id: "SSI-22", title: "Audit chart colour contrast", tag: "A11y", owner: "QA analyst", col: "backlog" },
  { id: "SSI-23", title: "Write the billing webhook spec", tag: "API", owner: "Backend engineer", col: "backlog" },
  { id: "SSI-24", title: "Retire the beam effects", tag: "Design", owner: "Design lead", col: "progress" },
  { id: "SSI-25", title: "Tune the order book depth bars", tag: "Charts", owner: "Frontend engineer", col: "progress" },
  { id: "SSI-26", title: "Rotate the sample API keys", tag: "Infra", owner: "Backend engineer", col: "progress" },
  { id: "SSI-27", title: "Promote the radial gauge", tag: "Lab", owner: "Design lead", col: "done" },
  { id: "SSI-28", title: "Fix the sparkline zero span", tag: "Charts", owner: "Frontend engineer", col: "done" },
]

/**
 * A three-column board in the Linear register. A press sends a card to the next column on
 * the layout spring; every count is the cards in that column, so the numbers add up.
 */
export function KanbanBoard({ cards = DEFAULT_CARDS, onMove, className }: KanbanBoardProps) {
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
  const shown = cards.find((c) => c.id === hot)

  const press = (c: KanbanCard) => {
    const to = NEXT[at(c)]
    setCol((prev) => ({ ...prev, [c.id]: to }))
    onMove?.(c.id, to)
  }

  return (
    <div className={cn("w-full max-w-[520px] tabular-nums", className)} role="group" aria-label={`Board, ${cards.length} cards: ${COLUMNS.map((k, i) => `${counts[i]} ${k.label.toLowerCase()}`).join(", ")}`}>
      <div className="grid grid-cols-3 gap-3" onPointerLeave={() => setHot(null)}>
        {COLUMNS.map((column, ci) => (
          <div key={column.key} role="group" aria-label={`${column.label}, ${counts[ci]} cards`} className="flex min-h-[280px] flex-col">
            <div className="flex items-baseline justify-between px-1 pb-2">
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground/45">
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
                    <motion.button
                      key={card.id}
                      type="button"
                      layout={!reduced}
                      layoutId={`${ns}-${card.id}`}
                      /* on mount the first 8 cards rise 6px, 35ms apart */
                      initial={mounted.current || order >= 8 ? false : reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileTap={reduced ? undefined : { scale: 0.97, transition: LIFT }}
                      transition={
                        reduced
                          ? { duration: 0.15, delay: mounted.current ? 0 : order * 0.035 }
                          : { ...SPRING, opacity: { duration: 0.3, ease: EASE, delay: mounted.current ? 0 : order * 0.035 }, y: { duration: 0.3, ease: EASE, delay: mounted.current ? 0 : order * 0.035 } }
                      }
                      onClick={() => press(card)}
                      onPointerEnter={() => setHot(card.id)}
                      onFocus={() => setHot(card.id)}
                      onBlur={() => setHot(null)}
                      aria-label={`${card.id} ${card.title}, ${card.tag}, ${card.owner}, in ${NAME[at(card)]}. Move to ${NAME[NEXT[at(card)]]}`}
                      className="rounded-lg bg-foreground/[0.04] px-2.5 py-2 text-left outline-none transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.07] focus-visible:bg-foreground/[0.09] motion-reduce:transition-none"
                      style={{ opacity: hot !== null && hot !== card.id ? 0.45 : 1 }}
                    >
                      <span className={cn("block text-[12px] leading-[1.4]", done ? "text-foreground/45" : "text-foreground/90")}>{card.title}</span>
                      <span className="mt-1.5 flex items-baseline justify-between gap-2">
                        <span className="text-[10px] text-foreground/45">{card.tag}</span>
                        <span className="text-[10px] text-foreground/35">{card.id}</span>
                      </span>
                    </motion.button>
                  )
                })}
            </div>
          </div>
        ))}
      </div>

      <div role="status" className="mt-3 border-t border-foreground/[0.05] px-1 pt-2 text-[10.5px] text-foreground/45">
        {/* the line crosses over when the card changes (4px, 2px blur, 150ms) */}
        <motion.div
          key={shown ? `${shown.id}-${at(shown)}` : "rest"}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          {shown ? (
            <>
              <span className="font-medium text-foreground/90">{shown.id}</span> {shown.tag} · {shown.owner} · next: {NAME[NEXT[at(shown)]]}
            </>
          ) : (
            /* at rest the total only (2026-10-01): each column's count already heads it */
            `${cards.length} cards`
          )}
        </motion.div>
      </div>
    </div>
  )
}
