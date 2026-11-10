// provenance: original
"use client"

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { animate, motion, motionValue, useReducedMotion, type MotionValue } from "motion/react"
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
   hold at 3, 3 and 2.
   2026-11-10: a card can be dragged by its body to any column. The arrow only ever moved a
   card one step on, so sending one back to Backlog or straight to Done took several presses.
   · press and travel 4px: the card lifts (1.02 on the lift spring, a soft shadow) and from
     then on it is the pointer: its place is written straight to its transform from the
     pointer's position on every move, with the pointer captured, so it keeps following
     outside the board and no render runs per move
   · the column under the pointer takes the 4% hover fill over 150ms, unless it is the
     card's own, where letting go changes nothing
   · let go over another column and the card is that column's: the counts change at once
     and the card settles from where it was let go into its slot on the layout spring
   · let go anywhere else, or press Escape, and it goes back to its slot on the same spring
   The slot (which rides the layout spring between columns) and the face (which follows the
   pointer) are two elements, and a card's offset lives on the board, so it outlives the
   card changing column and a card caught mid-flight is simply picked up from where it is.
   A horizontal touch drags a card, a vertical one still scrolls the page (touch-action
   pan-y: the columns sit side by side). The arrow stays for one press and for the keyboard,
   and a keyboard press now keeps the focus on the card's arrow in its new column (it used
   to be dropped with the old element). Reduced motion: no lift scale and no spring, the
   card still follows the pointer and is placed over the board's short 150ms move. */

/** the house layout spring, for a card that changes column */
const SPRING = { type: "spring", stiffness: 400, damping: 32 } as const
/** the lift: a card coming up under the pointer */
const LIFT = { type: "spring", stiffness: 500, damping: 30 } as const
/** px a press travels before it is a drag */
const SLOP = 4
/** a lifted card: the 4% hover over the raised fill, and the popover's shadow under it */
const LIFTED = "inset 0 0 0 100px color-mix(in srgb, var(--foreground) 4%, transparent), 0 8px 24px var(--card-shadow, rgba(0,0,0,0.35))"
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

/** where a card sits against its slot: the board keeps these, so they outlive a change of column */
interface Held {
  x: MotionValue<number>
  y: MotionValue<number>
  scale: MotionValue<number>
}

/** a tip over a control: up on hover or keyboard focus */
function Tip({ label, children, align = "right" }: { label: string; children: ReactNode; align?: "right" | "center" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-full z-20 mb-1.5 whitespace-nowrap rounded-[7.5px] px-2 py-0.5 text-[10.5px] text-foreground/90 opacity-0 shadow-[0_4px_12px_var(--card-shadow,rgba(0,0,0,0.25))] transition-opacity duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100",
          align === "right" ? "right-0" : "left-1/2 -translate-x-1/2",
          RAISED,
        )}
      >
        {label}
      </span>
    </span>
  )
}

/** one card: the slot keeps its place in the column, the face is what the pointer carries */
function Card({
  card,
  at,
  order,
  dim,
  first,
  reduced,
  layoutId,
  held,
  lifted,
  top,
  refocus,
  renderIcon,
  onHot,
  onPress,
  onLift,
  onOver,
  onDrop,
  onFly,
}: {
  card: KanbanCard
  /** the column the card is in now */
  at: KanbanColumn
  order: number
  dim: boolean
  /** the board is mounting: the card rises in */
  first: boolean
  reduced: boolean
  layoutId: string
  held: Held
  /** in the hand */
  lifted: boolean
  /** in the hand or still landing: drawn over the other cards */
  top: boolean
  /** a keyboard press moved this card here: its arrow takes the focus back */
  refocus: boolean
  renderIcon?: (owner: string, size: number) => ReactNode
  onHot: (on: boolean) => void
  onPress: (keyboard: boolean) => void
  /** the press became a drag; false when another card is already in the hand */
  onLift: (cancel: () => void) => boolean
  onOver: (x: number, y: number) => void
  onDrop: (commit: boolean) => void
  /** the slot has started its move to another column */
  onFly: () => void
}) {
  const done = at === "done"
  const slot = useRef<HTMLDivElement>(null)
  const face = useRef<HTMLDivElement>(null)
  const arrow = useRef<HTMLButtonElement>(null)
  /** the press in progress: where it began, where on the card it holds, the scale the board is drawn at */
  const grip = useRef<{ id: number; x: number; y: number; dx: number; dy: number; k: number; up: boolean; off?: () => void } | null>(null)
  /* the entrance waits its turn on mount only; a dim later answers at once */
  const delay = first ? order * 0.035 : 0

  useEffect(() => {
    if (refocus) arrow.current?.focus()
    // on mount only: the card is a new element in its new column
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => grip.current?.off?.(), [])

  const end = (commit: boolean) => {
    const g = grip.current
    if (!g) return
    grip.current = null
    g.off?.()
    const el = face.current
    if (el?.hasPointerCapture(g.id)) el.releasePointerCapture(g.id)
    if (g.up) onDrop(commit)
  }

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    /* one pointer, the main button, and never from the arrow: that is a press of its own */
    if (grip.current || !e.isPrimary || e.button !== 0 || (e.target as Element).closest("button")) return
    const el = slot.current
    if (!el) return
    const r = e.currentTarget.getBoundingClientRect()
    grip.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      /* the point held, measured from the face's centre (a scale about the centre keeps it) */
      dx: e.clientX - (r.left + r.width / 2),
      dy: e.clientY - (r.top + r.height / 2),
      /* a board drawn scaled (a fitted preview) moves 1px of transform by k px of screen */
      k: el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1,
      up: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = grip.current
    const el = slot.current
    if (!g || !el || e.pointerId !== g.id) return
    if (!g.up) {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < SLOP) return
      if (!onLift(() => end(false))) {
        end(false)
        return
      }
      g.up = true
      /* a card still landing is caught where it is */
      held.x.stop()
      held.y.stop()
      if (!reduced) animate(held.scale, 1.02, LIFT)
      const doc = el.ownerDocument
      const key = (k: KeyboardEvent) => {
        if (k.key === "Escape") end(false)
      }
      doc.addEventListener("keydown", key)
      g.off = () => doc.removeEventListener("keydown", key)
    }
    /* 1:1: the held point stays under the pointer, measured against the slot as it is now */
    const r = el.getBoundingClientRect()
    held.x.set((e.clientX - g.dx - (r.left + r.width / 2)) / g.k)
    held.y.set((e.clientY - g.dy - (r.top + r.height / 2)) / g.k)
    onOver(e.clientX, e.clientY)
  }

  return (
    <motion.div
      ref={slot}
      role="group"
      layout={!reduced}
      layoutId={layoutId}
      /* on mount the first 8 cards rise 6px, 35ms apart */
      initial={!first || order >= 8 ? false : reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
      /* motion owns the opacity, entrance and hover dim alike, so a CSS transition never lags it */
      animate={{ opacity: dim ? 0.45 : 1, y: 0 }}
      transition={
        reduced
          ? { duration: 0.15, delay }
          : { ...SPRING, opacity: { duration: first ? 0.3 : 0.2, ease: EASE, delay }, y: { duration: 0.3, ease: EASE, delay } }
      }
      onLayoutAnimationStart={onFly}
      onPointerEnter={() => onHot(true)}
      onFocus={() => onHot(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHot(false)
      }}
      aria-label={`${card.id} ${card.title}, ${card.tag}, ${card.owner}, in ${NAME[at]}`}
      className={cn("relative", top && "z-30")}
    >
      {/* the face: raised on the column; the hover is a faint 4% laid over the raised fill */}
      <motion.div
        ref={face}
        style={{ x: held.x, y: held.y, scale: held.scale, boxShadow: lifted ? LIFTED : undefined }}
        /* a mark drawn as an image must not start the browser's own drag */
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => end(true)}
        onPointerCancel={() => end(false)}
        onLostPointerCapture={() => end(false)}
        className={cn(
          "group relative touch-pan-y select-none rounded-[9px] p-2.5 text-left transition-[box-shadow] duration-200 hover:shadow-[inset_0_0_0_100px_color-mix(in_srgb,var(--foreground)_4%,transparent)] motion-reduce:transition-none",
          lifted ? "cursor-grabbing" : "cursor-grab",
          RAISED,
        )}
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
        {/* the move lives on the card: up on hover or focus, always shown on touch, away while the card is in the hand */}
        <span
          className={cn(
            "absolute right-1.5 top-1.5 opacity-0 transition-opacity duration-150",
            !lifted && "focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          <Tip label={MOVE[at]}>
            <button
              ref={arrow}
              type="button"
              /* a press from the keyboard has no pointer detail */
              onClick={(e) => onPress(e.detail === 0)}
              aria-label={`${MOVE[at]}: ${card.title}`}
              className={cn(ICON_BUTTON, "h-6 w-6 cursor-default")}
            >
              {done ? <RotateCcw size={12} strokeWidth={1.75} aria-hidden /> : <ArrowRight size={12} strokeWidth={1.75} aria-hidden />}
            </button>
          </Tip>
        </span>
      </motion.div>
    </motion.div>
  )
}

/**
 * A quiet three-column board. Drag a card by its body to any column: it lifts under the
 * pointer, the column it is over brightens, and letting go drops it into place. Each card's
 * arrow still sends it one column on with a press; every count is the cards in that column,
 * so the numbers add up.
 */
export function KanbanBoard({ cards = DEFAULT_CARDS, onMove, renderIcon, className }: KanbanBoardProps) {
  const reduced = useReducedMotion() ?? false
  const ns = useId().replace(/:/g, "")
  const [col, setCol] = useState<Record<string, KanbanColumn>>(() => Object.fromEntries(cards.map((c) => [c.id, c.col])))
  const [hot, setHot] = useState<string | null>(null)
  /** the card in the hand, the card drawn over the rest (in the hand or landing), the column it is over */
  const [drag, setDrag] = useState<string | null>(null)
  const [top, setTop] = useState<string | null>(null)
  const [over, setOver] = useState<KanbanColumn | null>(null)
  /** the same three for the handlers, which must not wait for a render */
  const live = useRef<{ drag: string | null; over: KanbanColumn | null; cancel: (() => void) | null; flying: string | null }>({ drag: null, over: null, cancel: null, flying: null })
  /** the fallback for a slot that never reports its move */
  const late = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(late.current), [])
  const held = useRef(new Map<string, Held>())
  const columns = useRef(new Map<KanbanColumn, HTMLDivElement>())
  /** the card a keyboard press just moved: its arrow takes the focus back in the new column */
  const refocus = useRef<string | null>(null)
  /** cards rise in once on mount; a card that changes column rides the layout spring only */
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    refocus.current = null
  })

  const at = (c: KanbanCard) => col[c.id] ?? c.col
  const counts = COLUMNS.map((k) => cards.filter((c) => at(c) === k.key).length)
  const heldOf = (id: string) => {
    let h = held.current.get(id)
    if (!h) {
      h = { x: motionValue(0), y: motionValue(0), scale: motionValue(1) }
      held.current.set(id, h)
    }
    return h
  }

  const send = (c: KanbanCard, to: KanbanColumn) => {
    setCol((prev) => ({ ...prev, [c.id]: to }))
    onMove?.(c.id, to)
  }
  const press = (c: KanbanCard, keyboard: boolean) => {
    if (keyboard) refocus.current = c.id
    send(c, NEXT[at(c)])
  }

  const lift = (c: KanbanCard, cancel: () => void) => {
    if (live.current.drag) return false
    live.current = { ...live.current, drag: c.id, over: null, cancel }
    setDrag(c.id)
    setTop(c.id)
    setHot(c.id)
    return true
  }
  /** the column under the pointer, if dropping there would move the card */
  const aim = (c: KanbanCard, x: number, y: number) => {
    let next: KanbanColumn | null = null
    for (const [key, el] of columns.current) {
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) next = key
    }
    if (next === at(c)) next = null
    if (next === live.current.over) return
    live.current.over = next
    setOver(next)
  }
  const drop = (c: KanbanCard, commit: boolean) => {
    const to = commit ? live.current.over : null
    live.current = { ...live.current, drag: null, over: null, cancel: null }
    setDrag(null)
    setOver(null)
    setHot(null)
    if (to) send(c, to)
    if (!to) {
      settle(c.id)
      return
    }
    /* into another column: the offset waits for the slot to start its own move there, so
       the two run frame for frame (started a frame apart, the card swings wide of its path) */
    live.current.flying = c.id
    window.clearTimeout(late.current)
    late.current = window.setTimeout(() => fly(c.id), 120)
  }
  /** the face closes on its slot, on the same transition the slot rides between columns (the
      layout spring, or the short 150ms move under reduced motion), so the two read as one
      move from where the card was let go. No velocity is carried in: the house spring never
      overshoots a slot */
  const settle = (id: string) => {
    const h = heldOf(id)
    const how = reduced ? { duration: 0.15 } : SPRING
    animate(h.scale, 1, how)
    Promise.all([animate(h.x, 0, how), animate(h.y, 0, how)]).then(() => setTop((t) => (t === id && live.current.drag !== id ? null : t)))
  }
  const fly = (id: string) => {
    if (live.current.flying !== id) return
    live.current.flying = null
    window.clearTimeout(late.current)
    settle(id)
  }

  /* a card taken off the board while it is in the hand: the drag ends with it */
  const lost = drag !== null && !cards.some((c) => c.id === drag)
  useEffect(() => {
    if (!lost) return
    live.current.cancel?.()
    live.current = { ...live.current, drag: null, over: null, cancel: null }
    setDrag(null)
    setTop(null)
    setOver(null)
  }, [lost])

  return (
    <div className={cn("w-[520px] max-w-full tabular-nums", className)} role="group" aria-label={`Board, ${cards.length} cards: ${COLUMNS.map((k, i) => `${counts[i]} ${k.label.toLowerCase()}`).join(", ")}`}>
      <div className="grid grid-cols-3 gap-2" onPointerLeave={() => setHot(null)}>
        {COLUMNS.map((column, ci) => (
          /* the column is the surface: 18 = 12 (the raised cards) + 6 (the p-1.5 inset) */
          <div
            key={column.key}
            ref={(el) => {
              if (el) columns.current.set(column.key, el)
              else columns.current.delete(column.key)
            }}
            role="group"
            aria-label={`${column.label}, ${counts[ci]} cards`}
            className={cn("relative flex min-h-[280px] flex-col rounded-[13.5px] p-1.5", SURFACE)}
          >
            {/* the column a carried card is over brightens: the 4% hover fill, laid under the cards */}
            <span
              aria-hidden
              className={cn("pointer-events-none absolute inset-0 rounded-[inherit] bg-foreground/[0.04] transition-opacity duration-150", over === column.key ? "opacity-100" : "opacity-0")}
            />
            <div className="relative flex items-baseline justify-between px-1.5 pb-2 pt-1">
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground/60">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: STATE[column.key] }} />
                {column.label}
              </span>
              <span className="text-[11px] font-medium text-foreground/90">{counts[ci]}</span>
            </div>
            <div className="relative flex flex-col gap-1.5">
              {cards
                .filter((c) => at(c) === column.key)
                .map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    at={column.key}
                    order={cards.indexOf(card)}
                    dim={hot !== null && hot !== card.id}
                    first={!mounted.current}
                    reduced={reduced}
                    layoutId={`${ns}-${card.id}`}
                    held={heldOf(card.id)}
                    lifted={drag === card.id}
                    top={top === card.id}
                    refocus={refocus.current === card.id}
                    renderIcon={renderIcon}
                    onHot={(on) => setHot(on ? card.id : null)}
                    onPress={(keyboard) => press(card, keyboard)}
                    onLift={(cancel) => lift(card, cancel)}
                    onOver={(x, y) => aim(card, x, y)}
                    onDrop={(commit) => drop(card, commit)}
                    onFly={() => fly(card.id)}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
