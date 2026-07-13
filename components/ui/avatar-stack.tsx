import { cn } from "@/lib/utils"

export interface AvatarStackProps {
  names: string[]
  /** Coins shown before folding the rest into a "+N" count. */
  max?: number
  className?: string
}

const COIN_BG = ["#1d2634", "#24202f", "#1e2b26", "#2b2420"]

const initials = (n: string) =>
  n
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

/**
 * Overlapping initial coins with a surface ring so each stays legible; the
 * overflow count is just ink.
 */
export function AvatarStack({ names, max = 4, className }: AvatarStackProps) {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length

  return (
    <span className={cn("inline-flex items-center", className)}>
      <span className="flex -space-x-1.5">
        {shown.map((n, i) => (
          <span
            key={n}
            title={n}
            className="grid h-6 w-6 place-items-center rounded-full text-[9px] text-white/70"
            style={{
              background: COIN_BG[i % COIN_BG.length],
              boxShadow: "0 0 0 2px #070a12",
              zIndex: shown.length - i,
            }}
          >
            {initials(n)}
          </span>
        ))}
      </span>
      {rest > 0 && <span className="ml-2 text-[11px] text-white/40">+{rest}</span>}
    </span>
  )
}
