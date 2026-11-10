// provenance: original
"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { RowAction, rowExit, rowWash, useRowExit } from "@/components/ui/row-action"

/* Inbox, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card around it, no header band, no rings on the portraits: it sits on the page
   · the unread dot is ink, not blue: colour is kept for up and down
   · a portrait-less actor gets their own categorical hue so people are told apart (2026-09-30)
   · sentence case, every figure tabular, corners of 8px and under
   · pointing at a row dims the others; the list and each row name themselves
   2026-10-02 round 2: the sample is a trading desk's notifications in place of a design
   team's tickets: the risk desk flags order 84133, compliance asks for a review of
   withdrawal W-2291, an eval run on Atlas 3 finishes at a 91.4% pass rate, and BTC-PERP margin
   reaches 82%. A system sender has a one word name, since a row shows the first word.
   2026-11-10: a notification can be archived. A read row used to stay in the list for good,
   so the list never got shorter however much of it was dealt with. Each row now carries the
   house row action (row-action.tsx) in its own end column after the time: Archive comes up
   once the pointer has rested on the row for 80ms, so a cursor passing down the list does
   not flash four buttons, and at once under keyboard focus; it is always shown on touch.
   Pressed, the row holds for 420ms on a 10% ink wash reading "Archived" with a tick, then
   leaves 16px to the right while its height folds and the rows under it close up. The row
   is no longer one big button: the part that reads it and the Archive are siblings. The
   unread count is taken from the rows still listed; `onArchive` hears the id. */

const EASE = [0.16, 1, 0.3, 1] as const
/** how long the pointer rests on a row before its Archive comes up */
const INTENT_MS = 80
const INK = "var(--foreground)"

/* a portrait-less actor gets their own hue so two people are told apart at a glance,
   in the house categorical order; past six they share one quiet "other" ink */
const PEOPLE = ["var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-amber)", "var(--chart-2)", "var(--chart-4)"]
const OTHER = "color-mix(in srgb, var(--foreground) 22%, transparent)"

export interface InboxItem {
  id: string
  actor: string
  text: string
  time: string
  /** Actor portrait; falls back to the initial when omitted. */
  image?: string
}

const DEFAULT_ITEMS: InboxItem[] = [
  { id: "n1", actor: "Lena Novak", text: "on the risk desk flagged order 84133 on BTC-PERP", time: "2m", image: "/lab-icons/avatars/abs-1.svg" },
  { id: "n2", actor: "Marcus Hale", text: "in compliance asked you to review withdrawal W-2291", time: "18m", image: "/lab-icons/avatars/abs-2.svg" },
  { id: "n3", actor: "Evals", text: "finished the Atlas 3 run, 91.4% pass rate", time: "1h", image: "/lab-icons/avatars/abs-3.svg" },
  { id: "n4", actor: "Margin", text: "on BTC-PERP reached 82%", time: "3h", image: "/lab-icons/avatars/abs-4.svg" },
]

/**
 * Notification inbox: an unread dot, a portrait, one line of ink and the time. Pressing a
 * row reads it (the dot leaves and the line steps back); "Mark all read" clears the dots.
 * Rest on a row and Archive comes up at its end: the row reads Archived for a beat, then
 * slides out while the rows under it close up.
 */
export function Inbox({
  items = DEFAULT_ITEMS,
  initiallyRead = ["n3"],
  title = "Inbox",
  onArchive,
  className,
}: {
  items?: InboxItem[]
  /** Ids that start in the read state. */
  initiallyRead?: string[]
  title?: string
  /** hears the id of a notification as it is archived */
  onArchive?: (id: string) => void
  className?: string
}) {
  const reduced = useReducedMotion()
  const [read, setRead] = useState<Set<string>>(new Set(initiallyRead))
  const [archived, setArchived] = useState<Set<string>>(new Set())
  const [hot, setHot] = useState<string | null>(null)
  /** the row whose Archive is up: the pointed row once the pointer has rested, or the focused one */
  const [armed, setArmed] = useState<string | null>(null)
  const { leaving, start } = useRowExit()
  const intent = useRef<number | undefined>(undefined)
  const root = useRef<HTMLDivElement>(null)
  const rows = useRef(new Map<string, HTMLDivElement>())
  useEffect(() => () => window.clearTimeout(intent.current), [])

  const list = items.filter((i) => !archived.has(i.id))
  const unread = list.filter((i) => !read.has(i.id)).length
  const actors = [...new Set(items.map((i) => i.actor))]
  const hueOf = (actor: string) => PEOPLE[actors.indexOf(actor)] ?? OTHER

  const point = (id: string) => {
    window.clearTimeout(intent.current)
    setHot(id)
    setArmed((a) => (a === id ? a : null))
    intent.current = window.setTimeout(() => setArmed(id), INTENT_MS)
  }
  const focus = (id: string) => {
    window.clearTimeout(intent.current)
    setHot(id)
    setArmed(id)
  }
  const rest = () => {
    window.clearTimeout(intent.current)
    setHot(null)
    setArmed(null)
  }
  const archive = (id: string) => {
    if (leaving) return
    onArchive?.(id)
    start(id, () => {
      rest()
      /* a keyboard press must not drop the focus with the row: it goes to the row that
         closes up into this one's place, or to the inbox itself once the list is empty */
      const row = rows.current.get(id)
      if (row?.contains(row.ownerDocument.activeElement)) {
        const at = list.findIndex((i) => i.id === id)
        const next = list[at + 1] ?? list[at - 1]
        const to = next ? rows.current.get(next.id)?.querySelector("button") : root.current
        to?.focus()
      }
      setArchived((prev) => new Set(prev).add(id))
    })
  }

  return (
    <div ref={root} tabIndex={-1} className={cn("w-full max-w-[420px] tabular-nums outline-none", className)} role="group" aria-label={`${title}, ${unread} unread`}>
      <div className="flex items-baseline justify-between px-3 pb-2">
        <span className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-foreground/90">{title}</span>
          <span role="status" className="text-[11px] text-foreground/45">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={unread}
                className="inline-block"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
                transition={{ duration: 0.15, ease: EASE }}
              >
                {unread > 0 ? `${unread} unread` : "All read"}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
        <button
          type="button"
          onClick={() => setRead(new Set(items.map((i) => i.id)))}
          disabled={unread === 0}
          className="-mr-2 rounded-[9.5px] px-2 py-1 text-[11px] font-medium text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 hover:text-foreground/90 focus-visible:bg-foreground/[0.06] active:scale-[0.97] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-35"
        >
          Mark all read
        </button>
      </div>

      <div onPointerLeave={rest}>
        <AnimatePresence>
        {list.map((it, i) => {
          const isRead = read.has(it.id)
          const first = it.actor.split(" ")[0]
          const gone = leaving === it.id
          const lit = leaving ?? hot
          return (
            /* rows rise in once, 35ms apart, the stagger capped at the first eight; an archived
               row leaves on the house row exit and its folding height closes the list up */
            <motion.div
              key={it.id}
              className="overflow-hidden"
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={rowExit(reduced)}
              transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
            >
            {/* the outer row owns the dim, the hover fill and the wash; the part that reads the
                notification is the button, the Archive sits beside it in its own end column */}
            <div
              ref={(el) => {
                if (el) rows.current.set(it.id, el)
                else rows.current.delete(it.id)
              }}
              onPointerEnter={() => point(it.id)}
              onFocus={() => focus(it.id)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) rest()
              }}
              className={cn(
                "flex w-full items-center rounded-[16.5px] transition-[opacity,background-color] duration-200 hover:bg-foreground/[0.04] has-[:focus-visible]:bg-foreground/[0.06]",
                lit !== null && lit !== it.id && "opacity-50",
              )}
              style={{ background: gone ? rowWash(INK) : undefined }}
            >
            <button
              type="button"
              aria-label={`${it.actor} ${it.text}, ${it.time} ago, ${isRead ? "read" : "unread"}`}
              aria-pressed={isRead}
              onClick={() => setRead((prev) => new Set(prev).add(it.id))}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-[16.5px] py-2.5 pl-3 text-left outline-none transition-[transform,translate,scale,rotate] duration-200 active:scale-[0.98] motion-reduce:active:scale-100"
            >
              <motion.span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground"
                animate={{ opacity: isRead ? 0 : 1, scale: isRead ? 0.4 : 1 }}
                transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
              />
              {it.image ? (
                <img src={it.image} alt="" className="h-6 w-6 shrink-0 rounded-full" draggable={false} />
              ) : (
                <span
                  aria-hidden
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-medium"
                  style={
                    hueOf(it.actor) === OTHER
                      ? { background: OTHER, color: "color-mix(in srgb, var(--foreground) 90%, transparent)" }
                      : { background: `color-mix(in srgb, ${hueOf(it.actor)} 22%, transparent)`, color: hueOf(it.actor) }
                  }
                >
                  {first[0]}
                </span>
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[12px] transition-colors duration-200",
                  isRead ? "text-foreground/45" : "text-foreground/70",
                )}
              >
                <span className={cn("transition-colors duration-200", !isRead && "font-medium text-foreground/90")}>{first}</span> {it.text}
              </span>
              <span className="shrink-0 text-[10px] text-foreground/35">{it.time}</span>
            </button>
              {/* the row's own end column. The house action waits for the row's hover; here it
                  waits for `armed` instead, which is the same hover after the intent delay, or
                  keyboard focus anywhere on the row. Reduced motion drops its 4px rise */}
              <span
                className={cn(
                  "flex w-[96px] shrink-0 justify-end pr-3 motion-reduce:[&>button]:translate-y-0",
                  armed === it.id && "[&>button]:translate-y-0 [&>button]:opacity-100",
                )}
              >
                <RowAction
                  done={gone}
                  disabled={leaving !== null && !gone}
                  onClick={() => archive(it.id)}
                  label="Archive"
                  doneLabel="Archived"
                  aria-label={`${gone ? "Archived" : "Archive"}: ${it.actor} ${it.text}`}
                />
              </span>
            </div>
            </motion.div>
          )
        })}
        </AnimatePresence>
      </div>
    </div>
  )
}
