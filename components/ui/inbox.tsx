"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Inbox, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card around it, no header band, no rings on the portraits: it sits on the page
   · the unread dot is ink, not blue: colour is kept for up and down
   · a portrait-less actor gets their own categorical hue so people are told apart (2026-09-30)
   · sentence case, every figure tabular, corners of 8px and under
   · pointing at a row dims the others; the list and each row name themselves */

const EASE = [0.16, 1, 0.3, 1] as const

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
  { id: "n1", actor: "Jane Doe", text: "assigned you SSI-14 · Audit chart contrast", time: "2m", image: "/lab-icons/avatars/abs-1.svg" },
  { id: "n2", actor: "Alex Kim", text: "commented on the metrics group", time: "18m", image: "/lab-icons/avatars/abs-2.svg" },
  { id: "n3", actor: "Mia Chen", text: "marked SSI-11 as done", time: "1h", image: "/lab-icons/avatars/abs-3.svg" },
  { id: "n4", actor: "Omar Ali", text: "requested a review on the footer block", time: "3h", image: "/lab-icons/avatars/abs-4.svg" },
]

/**
 * Notification inbox: an unread dot, a portrait, one line of ink and the time. Pressing a
 * row reads it (the dot leaves and the line steps back); "Mark all read" clears the list.
 */
export function Inbox({
  items = DEFAULT_ITEMS,
  initiallyRead = ["n3"],
  title = "Inbox",
  className,
}: {
  items?: InboxItem[]
  /** Ids that start in the read state. */
  initiallyRead?: string[]
  title?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const [read, setRead] = useState<Set<string>>(new Set(initiallyRead))
  const [hot, setHot] = useState<string | null>(null)
  const unread = items.filter((i) => !read.has(i.id)).length
  const actors = [...new Set(items.map((i) => i.actor))]
  const hueOf = (actor: string) => PEOPLE[actors.indexOf(actor)] ?? OTHER

  return (
    <div className={cn("w-full max-w-[420px] tabular-nums", className)} role="group" aria-label={`${title}, ${unread} unread`}>
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
          className="-mr-2 rounded-full px-2 py-1 text-[11px] font-medium text-foreground/45 outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 hover:text-foreground/90 focus-visible:bg-foreground/[0.06] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35"
        >
          Mark all read
        </button>
      </div>

      <div onPointerLeave={() => setHot(null)}>
        {items.map((it, i) => {
          const isRead = read.has(it.id)
          const first = it.actor.split(" ")[0]
          return (
            /* rows rise in once, 35ms apart, the stagger capped at the first eight */
            <motion.div
              key={it.id}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
            >
            <button
              type="button"
              aria-label={`${it.actor} ${it.text}, ${it.time} ago, ${isRead ? "read" : "unread"}`}
              aria-pressed={isRead}
              onClick={() => setRead((prev) => new Set(prev).add(it.id))}
              onPointerEnter={() => setHot(it.id)}
              onFocus={() => setHot(it.id)}
              onBlur={() => setHot(null)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-[opacity,background-color,transform,translate,scale,rotate] duration-200 hover:bg-foreground/[0.04] active:scale-[0.98] focus-visible:bg-foreground/[0.06]",
                hot !== null && hot !== it.id && "opacity-50",
              )}
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
                <span className={isRead ? "" : "font-medium text-foreground/90"}>{first}</span> {it.text}
              </span>
              <span className="shrink-0 text-[10px] text-foreground/35">{it.time}</span>
            </button>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
