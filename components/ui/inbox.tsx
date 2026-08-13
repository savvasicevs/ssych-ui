"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { AvatarStack } from "@/components/ui/avatar-stack"
import { cn } from "@/lib/utils"

// transitions.dev signature smooth-out easing.
const EASE = [0.22, 1, 0.36, 1] as const
const ACCENT = "rgba(90,170,255,1)"
const SURFACE = "var(--card)"

export interface InboxItem {
  id: string
  actor: string
  text: string
  time: string
  /** Actor portrait; falls back to an initial coin when omitted. */
  image?: string
}

const DEFAULT_ITEMS: InboxItem[] = [
  { id: "n1", actor: "Jane Doe", text: "assigned you SSI-14 · Audit chart contrast", time: "2m", image: "/lab-icons/avatars/abs-1.svg" },
  { id: "n2", actor: "Alex Kim", text: "commented on the metrics group", time: "18m", image: "/lab-icons/avatars/abs-2.svg" },
  { id: "n3", actor: "Mia Chen", text: "marked SSI-11 as done", time: "1h", image: "/lab-icons/avatars/abs-3.svg" },
  { id: "n4", actor: "Omar Ali", text: "requested a review on the footer block", time: "3h", image: "/lab-icons/avatars/abs-4.svg" },
]

/**
 * Notification inbox in the Linear register: unread dot, actor coin, one line
 * of ink, tabular time. Clicking a row reads it (the dot dissolves, the row
 * settles back); "mark all read" clears the column.
 */
export function Inbox({
  items = DEFAULT_ITEMS,
  initiallyRead = ["n3"],
  className,
}: {
  items?: InboxItem[]
  /** Ids that start in the read state. */
  initiallyRead?: string[]
  className?: string
}) {
  const reduced = useReducedMotion()
  const [read, setRead] = useState<Set<string>>(new Set(initiallyRead))
  const unread = items.filter((i) => !read.has(i.id)).length

  return (
    <div
      className={cn("w-full max-w-[420px] overflow-hidden rounded-xl border border-foreground/[0.04]", className)}
      style={{ background: SURFACE, boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)" }}
    >
      <div className="flex items-center justify-between border-b border-foreground/[0.04] bg-foreground/[0.02] px-4 py-2.5">
        <span className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.1em] text-foreground/40">Inbox</span>
          {unread > 0 && (
            <span className="tabular-nums text-[10px]" style={{ color: ACCENT }}>
              {unread}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setRead(new Set(items.map((i) => i.id)))}
          disabled={unread === 0}
          className="rounded-md px-2 py-1 text-[10px] text-foreground/45 transition-all duration-150 hover:bg-foreground/[0.04] hover:text-foreground/75 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
        >
          mark all read
        </button>
      </div>

      {items.map((it) => {
        const isRead = read.has(it.id)
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => setRead((prev) => new Set(prev).add(it.id))}
            className="flex w-full items-center gap-3 border-b border-foreground/[0.03] px-4 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-foreground/[0.02]"
          >
            <motion.span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              animate={{ opacity: isRead ? 0 : 1, scale: isRead ? 0.4 : 1, backgroundColor: ACCENT }}
              transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
              aria-hidden
            />
            {it.image ? (
              <img
                src={it.image}
                alt={it.actor}
                className="h-6 w-6 shrink-0 rounded-full"
                style={{ boxShadow: "0 0 0 2px var(--card)" }}
                draggable={false}
              />
            ) : (
              <AvatarStack names={[it.actor]} max={1} />
            )}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-[12px] transition-colors duration-300",
                  isRead ? "text-foreground/40" : "text-foreground/80",
                )}
              >
                <span className={isRead ? "" : "text-foreground"}>{it.actor.split(" ")[0]}</span> {it.text}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-[10px] text-foreground/30">{it.time}</span>
          </button>
        )
      })}
    </div>
  )
}
