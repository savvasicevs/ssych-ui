"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Avatar Stack, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no rings: each coin is cut away where its neighbour overlaps it, so the gap between two
     coins is the page itself and no shadow is drawn
   · no floating box: the name being pointed at is plain text under the stack, as a status.
     It hangs from the stack, so the row still never widens
   · initial coins each take their own chart colour (2026-09-30), so people with no photo
     can still be told apart
   · pointing at a coin lifts it and dims the others
   · the "+N" count is tabular, and the stack names itself to a screen reader
   Props are the same. */

const EASE = [0.16, 1, 0.3, 1] as const
const LIFT_SPRING = { type: "spring", stiffness: 500, damping: 30 } as const

export interface AvatarStackProps {
  names: string[]
  /** Avatar image per name (same order); a missing entry falls back to initials. */
  images?: (string | undefined)[]
  /** Coins shown before folding the rest into a "+N" count. */
  max?: number
  className?: string
}

/** Initial coins: people are told apart, so each takes the next chart colour in the house
 * order, mixed over the page so a lifted coin stays solid. */
const COIN_INK = ["--chart-1", "--chart-5", "--chart-3", "--chart-amber", "--chart-2", "--chart-4"].map(
  (v) => `color-mix(in srgb, var(${v}) 26%, var(--background))`,
)

/** Bundled gradient profile orbs, the same set the Inbox uses. */
const DEFAULT_IMAGES = [1, 2, 3, 4, 5, 6].map((i) => `/lab-icons/avatars/abs-${i}.svg`)

/** coin 24px, overlap 6px: the neighbour on the left is centred 18px away, 2px of page around it */
const CUT = "radial-gradient(circle at -6px 50%, transparent 14px, black 14.5px)"

const initials = (n: string) =>
  n
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

function Coin({
  name,
  img,
  index,
  z,
  lifted,
  dim,
  onHover,
}: {
  name: string
  img?: string
  index: number
  z: number
  lifted: boolean
  dim: boolean
  onHover: (v: boolean) => void
}) {
  const reduced = useReducedMotion()
  /* the first coin lies on top of the rest; a lifted coin is whole */
  const mask = index > 0 && !lifted ? CUT : undefined
  return (
    <motion.span
      className="relative inline-block h-6 w-6 rounded-full"
      style={{ zIndex: lifted ? 50 : z }}
      animate={{ y: lifted && !reduced ? -4 : 0, opacity: dim ? 0.5 : 1 }}
      transition={reduced ? { duration: 0 } : { y: LIFT_SPRING, opacity: { duration: 0.16, ease: EASE } }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <span
        className="grid h-full w-full place-items-center overflow-hidden rounded-full text-[9px] font-medium text-foreground/90"
        style={{ background: img ? undefined : COIN_INK[index % COIN_INK.length], maskImage: mask, WebkitMaskImage: mask }}
      >
        {img ? <img src={img} alt={name} className="h-full w-full object-cover" draggable={false} /> : initials(name)}
      </span>
    </motion.span>
  )
}

/**
 * Overlapping portrait coins. Pointing at one lifts it out of the stack and writes its name
 * under the row; pointing at the "+N" count writes the names it folds away.
 */
export function AvatarStack({ names, images = DEFAULT_IMAGES, max = 4, className }: AvatarStackProps) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<string | null>(null)
  const [peek, setPeek] = useState(false)
  /** the last thing said stays in place while it fades */
  const [said, setSaid] = useState("")

  const shown = names.slice(0, max)
  const hidden = names.slice(max)
  const on = hot !== null || peek

  return (
    <span
      className={cn("relative inline-flex items-center tabular-nums", className)}
      role="group"
      aria-label={`${names.length} people: ${names.join(", ")}`}
      onPointerLeave={() => {
        setPeek(false)
        setHot(null)
      }}
    >
      <span className="flex -space-x-1.5">
        {shown.map((n, i) => (
          /* the coins settle in once on mount, 35ms apart; the Coin inside owns lift and dim */
          <motion.span
            key={n}
            className="relative inline-block"
            style={{ zIndex: hot === n ? 50 : shown.length - i }}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
          >
            <Coin
              name={n}
              img={images[names.indexOf(n)]}
              index={i}
              z={shown.length - i}
              lifted={hot === n}
              dim={(hot !== null && hot !== n) || peek}
              onHover={(v) => {
                setHot(v ? n : null)
                if (v) setSaid(n)
              }}
            />
          </motion.span>
        ))}
      </span>
      {hidden.length > 0 && (
        <motion.span
          className={cn(
            "ml-2 cursor-default text-[11px] transition-colors duration-150 motion-reduce:transition-none",
            peek ? "text-foreground/90" : "text-foreground/45",
          )}
          aria-label={`and ${hidden.length} more`}
          onPointerEnter={() => {
            setPeek(true)
            setSaid(hidden.join(" · "))
          }}
          onPointerLeave={() => setPeek(false)}
          whileHover={reduced ? undefined : { y: -2, transition: LIFT_SPRING }}
        >
          +{hidden.length}
        </motion.span>
      )}
      <span
        role="status"
        className="pointer-events-none absolute left-0 top-full mt-1.5 whitespace-nowrap text-[10px] text-foreground/90 transition-opacity duration-150 motion-reduce:transition-none"
        style={{ opacity: on ? 1 : 0 }}
      >
        {/* the name swaps in place: 4px and a 2px blur, 150ms */}
        <motion.span
          key={said}
          className="inline-block"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          {on ? said : ""}
        </motion.span>
      </span>
    </span>
  )
}
