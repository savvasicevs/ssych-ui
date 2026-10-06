"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { BadgePercent, Bell, ChevronRight, KeyRound, ListChecks, ShieldCheck } from "lucide-react"

import { cn } from "@/lib/utils"
import { RAISED, SURFACE } from "@/components/ui/control-classes"

/* Preferences Card, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card and no outlined icon tiles: the rows sit on the page, the icon keeps a faint
     fill as its only ground
   · corners of 8px and under (rows were 12, tiles 10)
   · every figure is tabular, so the card number in a hint lines up
   · pointing at a row, or focusing it, dims the others; the chevron still walks in
   · the list names itself to a screen reader and every row carries its own label
   · the entrance is shorter (0.3s, 35ms apart) and hover changes stay under 200ms
   Props are the same. `icon` on a row may now be left out.
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit: it is a card again, so the name holds: the list sits on the 7% surface,
   rounded 24 with 6px inside, the rows rounded 18 (24 = 18 + 6), and the icon tiles on the
   raised step rounded 8, set 10px in (18 = 8 + 10). Each hint is one short clause, so none
   truncates (one read "Manage your email newsletter, get help, or join our Slack."), and
   hints read at 60%.
   2026-10-02 round 2: the rows are an exchange account's settings in place of generic SaaS
   ones: API keys, two factor, withdrawal whitelist, fee tier and notifications, each with a
   one clause hint short enough to never truncate. */

const EASE = [0.16, 1, 0.3, 1] as const

export interface PreferenceRow {
  icon?: ReactNode
  title: string
  hint: string
}

const iconCls = "h-[15px] w-[15px]"

const DEFAULT_ROWS: PreferenceRow[] = [
  { icon: <KeyRound className={iconCls} />, title: "API keys", hint: "3 active, one with trading rights" },
  { icon: <ShieldCheck className={iconCls} />, title: "Two factor", hint: "On, with an authenticator app" },
  { icon: <ListChecks className={iconCls} />, title: "Withdrawal whitelist", hint: "4 addresses, 24h hold on new ones" },
  { icon: <BadgePercent className={iconCls} />, title: "Fee tier", hint: "VIP 2: 0.02% maker, 0.05% taker" },
  { icon: <Bell className={iconCls} />, title: "Notifications", hint: "Fills, margin calls and funding" },
]

/**
 * Settings list: an icon, a title over a one-line hint, and a chevron that walks in when
 * the row is pointed at. The pointed row takes a faint fill and the others step back.
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
  const [hot, setHot] = useState<number | null>(null)
  /* only the first paint is staggered; a hover must answer at once */
  const first = useRef(true)
  const entering = first.current
  useEffect(() => {
    first.current = false
  }, [])

  return (
    <div
      style={{ width }}
      /* 24 = 18 (the rows) + 6 padding */
      className={cn("flex max-w-full flex-col rounded-[24px] p-1.5 tabular-nums", SURFACE, className)}
      role="group"
      aria-label={`Preferences, ${rows.length} sections`}
      onPointerLeave={() => setHot(null)}
    >
      {rows.map((r, i) => (
        <motion.button
          key={r.title}
          type="button"
          aria-label={`${r.title}. ${r.hint}`}
          onClick={() => onSelect?.(r.title)}
          onPointerEnter={() => setHot(i)}
          onFocus={() => setHot(i)}
          onBlur={() => setHot(null)}
          className="group flex items-center gap-3 rounded-[18px] px-2.5 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] motion-reduce:transition-none"
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: hot === null || hot === i ? 1 : 0.5, y: 0 }}
          whileTap={reduced ? undefined : { scale: 0.97, transition: { type: "spring", stiffness: 500, damping: 30 } }}
          transition={
            reduced
              ? { duration: 0 }
              : entering
                ? { duration: 0.3, ease: EASE, delay: i * 0.035 }
                : { duration: 0.16, ease: EASE }
          }
        >
          {r.icon ? (
            <span
              aria-hidden
              /* 18 = 8 + the row's 10px inset */
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-foreground/60 transition-colors duration-150 group-hover:text-foreground/90 group-focus-visible:text-foreground/90 motion-reduce:transition-none",
                RAISED,
              )}
            >
              {r.icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-foreground/90">{r.title}</span>
            <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-foreground/60">{r.hint}</span>
          </span>
          <ChevronRight
            aria-hidden
            strokeWidth={1.8}
            className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-foreground/60 opacity-0 transition-[opacity,translate] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:translate-x-0 motion-reduce:transition-opacity"
          />
        </motion.button>
      ))}
    </div>
  )
}
