"use client"

import { useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const SURFACE = "var(--surface)"
const HAIRLINE = "var(--border)"
const TEXT_MUTED = "var(--muted-foreground)"

export interface ProjectIndexItem {
  title: string
  tag: string
  year: string
  href?: string
  /** Cover image URL; falls back to `grad` (a CSS background) when absent. */
  image?: string
  grad?: string
}

const DEFAULT_ITEMS: ProjectIndexItem[] = [
  { title: "Atlas Analytics", tag: "Market intelligence", year: "2025", grad: "radial-gradient(120% 140% at 20% 10%, rgba(90,170,255,0.55), transparent 60%), linear-gradient(150deg, #16233c, var(--surface))" },
  { title: "Nimbus Cloud", tag: "GPU compute platform", year: "2025", grad: "radial-gradient(120% 140% at 80% 15%, rgba(42,161,115,0.5), transparent 60%), linear-gradient(150deg, #102a24, var(--surface))" },
  { title: "Meridian CRM", tag: "Sales operating system", year: "2024", grad: "radial-gradient(120% 140% at 30% 85%, rgba(185,134,52,0.5), transparent 60%), linear-gradient(150deg, #2b2010, var(--surface))" },
  { title: "Northwind Pay", tag: "Payments infrastructure", year: "2024", grad: "radial-gradient(120% 140% at 70% 80%, rgba(167,139,250,0.5), transparent 60%), linear-gradient(150deg, #241a38, var(--surface))" },
]

/**
 * Project index in the Ink register — the quiet alternative to a bento: bare
 * rows (title · tag · year · arrow), and the cover only exists while you
 * hover, floating beside the cursor. The list stays ink; the image is the
 * reward.
 */
export function ProjectIndex({
  items = DEFAULT_ITEMS,
  className,
}: {
  items?: ProjectIndexItem[]
  className?: string
}) {
  const reduced = useReducedMotion()
  const wrap = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  const onMove = (e: React.PointerEvent) => {
    const r = wrap.current?.getBoundingClientRect()
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top })
  }

  return (
    <div ref={wrap} onPointerMove={onMove} className={cn("relative w-full max-w-[560px]", className)}>
      {items.map((r, i) => (
        <a
          key={r.title}
          href={r.href ?? "#"}
          onClick={r.href ? undefined : (e) => e.preventDefault()}
          onPointerEnter={() => setHover(i)}
          onPointerLeave={() => setHover(null)}
          className="group flex items-baseline gap-4 border-t py-4 transition-colors duration-200 last:border-b"
          style={{ borderColor: HAIRLINE }}
        >
          <span
            className={cn(
              "text-[19px] font-semibold transition-colors duration-200",
              hover === null || hover === i ? "text-foreground" : "text-foreground/30",
            )}
          >
            {r.title}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: TEXT_MUTED }}>
            {r.tag}
          </span>
          <span className="tabular-nums text-[11px]" style={{ color: TEXT_MUTED }}>
            {r.year}
          </span>
          <span
            aria-hidden
            className="text-[13px] text-foreground/40 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-foreground"
            style={{ transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}
          >
            →
          </span>
        </a>
      ))}

      {/* floating cover — only alive while a row is hovered */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute z-10 w-[220px] overflow-hidden rounded-lg border border-foreground/[0.04]"
        style={{ left: 0, top: 0, background: SURFACE, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}
        animate={{
          x: Math.min(pos.x + 24, 336),
          y: pos.y - 70,
          opacity: hover !== null ? 1 : 0,
          scale: hover !== null ? 1 : 0.96,
        }}
        transition={
          reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 28, opacity: { duration: 0.2, ease: EASE } }
        }
      >
        {items.map((r, i) => (
          <div
            key={r.title}
            aria-hidden
            className="relative aspect-[4/3] w-full"
            style={{ display: hover === i ? "block" : "none", background: r.grad }}
          >
            {r.image ? (
              <img src={r.image} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            ) : (
              <>
                {/* skeleton chrome so the gradient reads as a product cover */}
                <span className="absolute left-[8%] top-[10%] h-[6%] w-[34%] rounded-full bg-foreground/[0.16]" />
                <span className="absolute left-[8%] top-[24%] h-[5%] w-[52%] rounded-full bg-foreground/[0.08]" />
                <span className="absolute inset-x-[8%] bottom-[10%] top-[42%] rounded-md border border-foreground/[0.09] bg-background/25" />
              </>
            )}
          </div>
        ))}
      </motion.div>
    </div>
  )
}
