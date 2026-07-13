import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { AvatarStack } from "@/components/ui/avatar-stack"
import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const ACCENT = "rgba(90,170,255,1)"
const SURFACE = "#0A0E16"

export interface InboxItem {
  id: string
  actor: string
  text: string
  time: string
}

const DEFAULT_ITEMS: InboxItem[] = [
  { id: "n1", actor: "Jane Doe", text: "assigned you SSI-14 · Audit chart contrast", time: "2m" },
  { id: "n2", actor: "Alex Kim", text: "commented on the metrics group", time: "18m" },
  { id: "n3", actor: "Mia Chen", text: "marked SSI-11 as done", time: "1h" },
  { id: "n4", actor: "Omar Ali", text: "requested a review on the footer block", time: "3h" },
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
      className={cn("w-full max-w-[420px] overflow-hidden rounded-xl border border-white/[0.04]", className)}
      style={{ background: SURFACE, boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.04)" }}
    >
      <div className="flex items-center justify-between border-b border-white/[0.04] bg-white/[0.02] px-4 py-2.5">
        <span className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">Inbox</span>
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
          className="rounded-md px-2 py-1 text-[10px] text-white/45 transition-all duration-150 hover:bg-white/[0.04] hover:text-white/75 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
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
            className="flex w-full items-center gap-3 border-b border-white/[0.03] px-4 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-white/[0.02]"
          >
            <motion.span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              animate={{ opacity: isRead ? 0 : 1, scale: isRead ? 0.4 : 1, backgroundColor: ACCENT }}
              transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
              aria-hidden
            />
            <AvatarStack names={[it.actor]} max={1} />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-[12px] transition-colors duration-300",
                  isRead ? "text-white/40" : "text-white/80",
                )}
              >
                <span className={isRead ? "" : "text-white"}>{it.actor.split(" ")[0]}</span> {it.text}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-[10px] text-white/30">{it.time}</span>
          </button>
        )
      })}
    </div>
  )
}
