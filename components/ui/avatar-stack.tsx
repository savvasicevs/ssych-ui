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
   Props are the same.
   2026-10-02 audit: every coin and the "+N" count are real buttons with their names as
   labels, so the keyboard reaches them: focus lifts a coin and writes its name exactly as
   the pointer does, and a tap does the same on touch, where there is no hover. The names
   the count folds away are joined with commas.
   2026-10-02 round 2: his note was "weird overlapping icons". The cut-out masks are gone
   (each coin was cut by a circle sized for a 24px coin, and lifting one swapped its cut for a
   whole coin in one frame, which read as a jump). Now every coin is 28px with one 8px
   overlap, and each wears a 2px ring in the page's own colour, so the gap between two coins
   is drawn by the coin in front whatever the size. The "+N" count is a coin of the same
   size and ring, last in the row. Pointing lifts a coin 3px on a 200ms ease-out of its
   transform only (no spring, no size change), raises it above its neighbours and dims the
   rest. The people are on topic: the default is a trading desk with roles, and the line
   under the row reads "Priya Raman, head of rates". `names` is optional now (the desk), and
   `roles` is new (same order as names). */

const EASE = [0.16, 1, 0.3, 1] as const
/** the lift: transform only, 200ms ease-out (his rule 6) */
const LIFT = "transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms cubic-bezier(0.16, 1, 0.3, 1)"
/** a coin's size and how far each one tucks under the one before it */
const SIZE = 28
const OVERLAP = 8

export interface AvatarStackProps {
  /** the people, in order; a trading desk by default */
  names?: string[]
  /** each person's role, same order as names, read after the name under the row */
  roles?: (string | undefined)[]
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

const DESK = ["Priya Raman", "Marcus Hale", "Lena Vogt", "Tomás Ruiz", "Aiko Sato", "Dev Malhotra"]
const DESK_ROLES = ["head of rates", "crypto derivatives", "quant research", "execution", "risk", "model ops"]

/** the ring in the page's colour that parts a coin from the one it covers; keyboard focus
 *  brightens that same ring (the coin's own edge), never an outline with a gap */
const RING =
  "shadow-[0_0_0_2px_var(--background)] focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--foreground)_45%,var(--background))]"

const initials = (n: string) =>
  n
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

/**
 * Overlapping portrait coins. Pointing at one lifts it out of the stack and writes its name
 * under the row; pointing at the "+N" count writes the names it folds away.
 */
export function AvatarStack({ names = DESK, roles, images = DEFAULT_IMAGES, max = 4, className }: AvatarStackProps) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<string | null>(null)
  const [peek, setPeek] = useState(false)
  /** the last thing said stays in place while it fades */
  const [said, setSaid] = useState("")

  const roleList = roles ?? (names === DESK ? DESK_ROLES : [])
  const shown = names.slice(0, max)
  const hidden = names.slice(max)
  const on = hot !== null || peek
  const line = (n: string) => {
    const role = roleList[names.indexOf(n)]
    return role ? `${n}, ${role}` : n
  }

  /* one coin's look: its size, its ring, its place in the overlap and its lift */
  const coinStyle = (i: number, lifted: boolean, dim: boolean, z: number) => ({
    width: SIZE,
    height: SIZE,
    marginLeft: i === 0 ? 0 : -OVERLAP,
    zIndex: lifted ? 50 : z,
    transform: lifted && !reduced ? "translateY(-3px)" : "translateY(0)",
    opacity: dim ? 0.5 : 1,
    transition: reduced ? "none" : LIFT,
  })

  return (
    <span
      className={cn("relative inline-flex items-center tabular-nums", className)}
      role="group"
      aria-label={`${names.length} people: ${names.map(line).join("; ")}`}
      onPointerLeave={() => {
        setPeek(false)
        setHot(null)
      }}
    >
      {/* the coins settle in once on mount, 35ms apart; lift and dim are on the coin itself */}
      <motion.span
        className="flex items-center"
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
      >
        {shown.map((n, i) => {
          const img = images[names.indexOf(n)]
          const lifted = hot === n
          return (
            <button
              key={n}
              type="button"
              aria-label={line(n)}
              className={cn("relative block shrink-0 rounded-full outline-none", RING)}
              style={coinStyle(i, lifted, (hot !== null && !lifted) || peek, shown.length + 1 - i)}
              onPointerEnter={(e) => {
                if (e.pointerType === "touch") return
                setHot(n)
                setSaid(line(n))
              }}
              onPointerLeave={(e) => e.pointerType !== "touch" && setHot(null)}
              onFocus={() => {
                setHot(n)
                setSaid(line(n))
              }}
              onBlur={() => setHot(null)}
              onClick={() => {
                /* a tap on touch, where there is no hover: the same lift and name, toggled */
                setPeek(false)
                setHot((h) => (h === n ? null : n))
                setSaid(line(n))
              }}
            >
              <span
                className="grid h-full w-full place-items-center overflow-hidden rounded-full text-[10px] font-medium text-foreground/90"
                style={{ background: img ? undefined : COIN_INK[i % COIN_INK.length] }}
              >
                {img ? <img src={img} alt="" className="h-full w-full object-cover" draggable={false} /> : initials(n)}
              </span>
            </button>
          )
        })}
        {hidden.length > 0 && (
          <button
            type="button"
            className={cn(
              "relative grid shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_12%,var(--background))] text-[10.5px] font-medium outline-none",
              RING,
              peek ? "text-foreground/90" : "text-foreground/70",
            )}
            style={{ ...coinStyle(shown.length, peek, hot !== null, 0), transition: reduced ? "none" : `${LIFT}, color 150ms` }}
            aria-label={`and ${hidden.length} more: ${hidden.map(line).join("; ")}`}
            onPointerEnter={(e) => {
              if (e.pointerType === "touch") return
              setPeek(true)
              setSaid(hidden.join(", "))
            }}
            onPointerLeave={(e) => e.pointerType !== "touch" && setPeek(false)}
            onFocus={() => {
              setPeek(true)
              setSaid(hidden.join(", "))
            }}
            onBlur={() => setPeek(false)}
            onClick={() => {
              setHot(null)
              setPeek((p) => !p)
              setSaid(hidden.join(", "))
            }}
          >
            +{hidden.length}
          </button>
        )}
      </motion.span>
      <span
        role="status"
        className="pointer-events-none absolute left-0 top-full mt-2 whitespace-nowrap text-[11px] text-foreground/90 transition-opacity duration-150 motion-reduce:transition-none"
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
