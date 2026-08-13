"use client"

import { type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ChevronRight, MessageCircle, CreditCard, Heart, Keyboard, User } from "lucide-react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const

export interface PreferenceRow {
  icon: ReactNode
  title: string
  hint: string
}

const iconCls = "h-[15px] w-[15px] text-foreground/55"

const DEFAULT_ROWS: PreferenceRow[] = [
  { icon: <User className={iconCls} />, title: "Profile", hint: "Name, email and workspace identity." },
  { icon: <CreditCard className={iconCls} />, title: "Payment method", hint: "Visa **** 3111" },
  { icon: <MessageCircle className={iconCls} />, title: "Communication", hint: "Manage your email newsletter, get help, or join our Slack." },
  { icon: <Keyboard className={iconCls} />, title: "Shortcuts", hint: "Press ? anytime for a cheat sheet." },
  { icon: <Heart className={iconCls} />, title: "Share feedback", hint: "Bugs, suggestions or a simple hello?" },
]

/**
 * Settings register in the Ink register: an icon tile, a title over a
 * one-line hint, and a chevron that only walks in on hover. Rows stay quiet;
 * the hover surface is a 2% lift, never a border.
 */
export function PreferencesCard({
  rows = DEFAULT_ROWS,
  width = 340,
  onSelect,
  className,
}: {
  rows?: PreferenceRow[]
  width?: number
  onSelect?: (title: string) => void
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <div style={{ width }} className={cn("flex flex-col", className)}>
      {rows.map((r, i) => (
        <motion.button
          key={r.title}
          type="button"
          onClick={() => onSelect?.(r.title)}
          className="group -mx-2 flex items-center gap-3.5 rounded-xl px-3 py-3 text-left transition-colors duration-200 hover:bg-foreground/[0.03]"
          initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.45, ease: EASE, delay: i * 0.06 }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-foreground/[0.04] bg-foreground/[0.03]">
            {r.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-foreground/85">{r.title}</span>
            <span className="mt-0.5 block truncate text-[12px] leading-snug text-foreground/40">{r.hint}</span>
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-foreground/0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-foreground/35" />
        </motion.button>
      ))}
    </div>
  )
}
