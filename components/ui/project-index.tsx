"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Project Index, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · the floating cover has no outline and no shadow, and its corner is 8px
   · the sample covers are one ink at four strengths from tokens; they were blue, green,
     amber and purple written as hex and rgb
   · pointing at a row dims the whole of every other row to 0.35, not only its title
   · the list names itself to a screen reader, each row carries its own label, and a row
     reached by keyboard shows its cover beside it
   · the arrow is drawn, not a text glyph; row rules are 1px at 5% ink
   · hover changes are 200ms and under, every figure tabular from the root
   Props are the same. */

const EASE = [0.16, 1, 0.3, 1] as const
const LAYOUT_SPRING = { type: "spring", stiffness: 400, damping: 32 } as const

export interface ProjectIndexItem {
  title: string
  tag: string
  year: string
  href?: string
  /** Cover image URL; falls back to `grad` (a CSS background) when absent. */
  image?: string
  grad?: string
}

/** a sample cover: one soft light of ink from a corner, over the surface */
const cover = (at: string, ink: number) =>
  `radial-gradient(120% 140% at ${at}, color-mix(in srgb, var(--foreground) ${ink}%, transparent), transparent 60%), linear-gradient(150deg, color-mix(in srgb, var(--foreground) 10%, var(--surface)), var(--surface))`

const DEFAULT_ITEMS: ProjectIndexItem[] = [
  { title: "Atlas Analytics", tag: "Market intelligence", year: "2025", grad: cover("20% 10%", 42) },
  { title: "Nimbus Cloud", tag: "GPU compute platform", year: "2025", grad: cover("80% 15%", 34) },
  { title: "Meridian CRM", tag: "Sales operating system", year: "2024", grad: cover("30% 85%", 27) },
  { title: "Northwind Pay", tag: "Payments infrastructure", year: "2024", grad: cover("70% 80%", 21) },
]

const COVER_W = 220
const MAX_W = 560

/**
 * Project index: bare rows of title, tag and year. The cover only exists while a row is
 * pointed at, floating beside the cursor, and the other rows step back.
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
  /* the rows rise in once, 40ms apart and capped at eight; after that the dim is quick */
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLanded(true), reduced ? 0 : Math.min(items.length, 8) * 40 + 320)
    return () => clearTimeout(t)
  }, [reduced, items.length])

  const onMove = (e: React.PointerEvent) => {
    const r = wrap.current?.getBoundingClientRect()
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top })
  }

  return (
    <div
      ref={wrap}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      className={cn("relative w-full max-w-[560px] tabular-nums", className)}
      role="group"
      aria-label={`Projects, ${items.length}`}
    >
      {items.map((r, i) => (
        <motion.a
          key={r.title}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: hover !== null && hover !== i ? 0.35 : 1, y: 0 }}
          transition={
            reduced
              ? { duration: 0.2 }
              : landed
                ? { duration: 0.2, ease: EASE }
                : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.04 }
          }
          whileTap={reduced ? undefined : { scale: 0.99 }}
          href={r.href ?? "#"}
          aria-label={`${r.title}, ${r.tag}, ${r.year}`}
          onClick={r.href ? undefined : (e) => e.preventDefault()}
          onPointerEnter={() => setHover(i)}
          onFocus={(e) => {
            const el = e.currentTarget
            setHover(i)
            setPos({ x: MAX_W, y: el.offsetTop + el.offsetHeight / 2 })
          }}
          onBlur={() => setHover(null)}
          className={cn(
            "group flex items-baseline gap-4 border-t border-foreground/[0.05] py-4 outline-none last:border-b",
          )}
        >
          <span className="text-[19px] font-semibold text-foreground/90">{r.title}</span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/45">{r.tag}</span>
          <span className="text-[11px] text-foreground/35">{r.year}</span>
          <svg
            aria-hidden
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="shrink-0 self-center text-foreground/35 transition-[transform,translate,scale,rotate,color] duration-200 group-hover:translate-x-1 group-hover:text-foreground/90 group-focus-visible:translate-x-1 group-focus-visible:text-foreground/90 motion-reduce:transition-none"
            style={{ transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}
          >
            <path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.a>
      ))}

      {/* floating cover, only alive while a row is pointed at */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-10 aspect-[4/3] overflow-hidden rounded-[8px]"
        style={{ width: COVER_W, background: "var(--surface)" }}
        initial={false}
        animate={{
          x: Math.min(pos.x + 24, MAX_W - COVER_W - 4),
          y: pos.y - 70,
          opacity: hover !== null ? 1 : 0,
          scale: hover !== null ? 1 : 0.96,
        }}
        transition={reduced ? { duration: 0 } : { ...LAYOUT_SPRING, opacity: { duration: 0.2, ease: EASE } }}
      >
        {items.map((r, i) => (
          /* moving between rows cross-fades the covers, 150ms */
          <div
            key={r.title}
            className="absolute inset-0 transition-opacity duration-150"
            style={{ opacity: hover === i ? 1 : 0, background: r.grad }}
          >
            {r.image ? (
              <img src={r.image} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            ) : (
              <>
                {/* skeleton chrome so the gradient reads as a product cover */}
                <span className="absolute left-[8%] top-[10%] h-[6%] w-[34%] rounded-full bg-foreground/[0.16]" />
                <span className="absolute left-[8%] top-[24%] h-[5%] w-[52%] rounded-full bg-foreground/[0.08]" />
                <span className="absolute inset-x-[8%] bottom-[10%] top-[42%] rounded-[4px] bg-background/25" />
              </>
            )}
          </div>
        ))}
      </motion.div>
    </div>
  )
}
