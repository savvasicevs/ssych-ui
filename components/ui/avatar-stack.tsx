"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"

export interface AvatarStackProps {
  names: string[]
  /** Avatar image per name (same order); a missing entry falls back to initials. */
  images?: (string | undefined)[]
  /** Coins shown before folding the rest into a "+N" count. */
  max?: number
  className?: string
}

/** Initials-fallback coin faces — a tint of the chart ramp over the card surface,
 * so the four faces stay distinguishable in either theme without a fixed hex. */
const COIN_BG = [
  "color-mix(in srgb, var(--chart-1) 18%, var(--card))",
  "color-mix(in srgb, var(--chart-5) 18%, var(--card))",
  "color-mix(in srgb, var(--chart-2) 18%, var(--card))",
  "color-mix(in srgb, var(--chart-3) 18%, var(--card))",
]

/** Bundled gradient profile orbs — the same set the Inbox uses. */
const DEFAULT_IMAGES = [1, 2, 3, 4, 5, 6].map((i) => `/lab-icons/avatars/abs-${i}.svg`)

const initials = (n: string) =>
  n
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

/** Floating label above a coin or the overflow chip — never widens the row. */
function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <motion.span
      className="pointer-events-none absolute -top-7 left-1/2 z-50 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[9.5px] text-foreground/85"
      style={{
        background: "var(--card)",
        borderColor: "color-mix(in srgb, var(--foreground) 8%, transparent)",
        boxShadow: "0 6px 18px var(--card-shadow)",
      }}
      initial={{ opacity: 0, y: 3, x: "-50%" }}
      animate={{ opacity: 1, y: 0, x: "-50%" }}
      exit={{ opacity: 0, y: 3, x: "-50%" }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.span>
  )
}

function Coin({
  name,
  img,
  z,
  lifted,
  onHover,
}: {
  name: string
  img?: string
  z: number
  lifted: boolean
  onHover: (v: boolean) => void
}) {
  return (
    <motion.span
      className="relative inline-grid h-6 w-6 place-items-center rounded-full text-[9px] text-foreground/70"
      style={{
        background: COIN_BG[z % COIN_BG.length],
        boxShadow: "0 0 0 2px var(--surface-soft)",
        zIndex: lifted ? 50 : z,
      }}
      animate={{ y: lifted ? -5 : 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {img ? (
        <img src={img} alt={name} className="h-full w-full rounded-full object-cover" draggable={false} />
      ) : (
        initials(name)
      )}
      <AnimatePresence>{lifted && <Tooltip>{name}</Tooltip>}</AnimatePresence>
    </motion.span>
  )
}

/**
 * Overlapping gradient-orb coins with a surface ring so each stays legible.
 * Hovering a coin lifts it out of the stack and floats its name; hovering the
 * "+N" chip floats the hidden names above it — the stack itself never widens.
 * Falls back to initial coins when an image is missing.
 */
export function AvatarStack({ names, images = DEFAULT_IMAGES, max = 4, className }: AvatarStackProps) {
  const [hot, setHot] = useState<string | null>(null)
  const [peek, setPeek] = useState(false)

  const shown = names.slice(0, max)
  const hidden = names.slice(max)

  return (
    <span
      className={cn("inline-flex items-center", className)}
      onMouseLeave={() => {
        setPeek(false)
        setHot(null)
      }}
    >
      <span className="flex -space-x-1.5">
        {shown.map((n, i) => (
          <Coin
            key={n}
            name={n}
            img={images[names.indexOf(n)]}
            z={shown.length - i}
            lifted={hot === n}
            onHover={(v) => setHot(v ? n : null)}
          />
        ))}
      </span>
      {hidden.length > 0 && (
        <motion.span
          className="relative ml-2 cursor-default text-[11px] text-foreground/40"
          onMouseEnter={() => setPeek(true)}
          onMouseLeave={() => setPeek(false)}
          whileHover={{ y: -2 }}
        >
          +{hidden.length}
          <AnimatePresence>{peek && <Tooltip>{hidden.join(" · ")}</Tooltip>}</AnimatePresence>
        </motion.span>
      )}
    </span>
  )
}
