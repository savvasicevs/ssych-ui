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
   Props are the same.
   2026-10-02 audit: the tag went from /45 to /60 and the year from /35 to /45, so the text that
   is read clears the readable step. The cover keeps its 8px corner with the 4px block 8% in:
   it is art with no frame, so there is no outer corner for it to nest in.
   2026-10-02 round 2: his note was to fit the trading idea, maybe a company portfolio. The
   sample is now a portfolio of holdings: the company, its ticker, its sector, the year the
   position was opened and its return since, signed and in its hue (green up, red down). The
   floating cover draws the position's own price line, edge to edge along its bottom with a
   faint area under it, the ticker and the return over it. New optional fields on an item:
   `ticker`, `change` (percent) and `series` (prices, oldest first); new prop `label` (the
   list's name for a screen reader, "Holdings"). Old items with only title, tag and year draw
   as before.
   Formulas:
   · return since opened = (last − first of the series) ÷ first × 100, unless `change` is given
   · cover line          the series scaled to the cover: its low 12% above the bottom edge,
                         its high 40% down from the top
   2026-10-02 round 2: a light look, the dark one unchanged. In light the floating cover is white
   with a quiet 1px outline at 8% ink and a soft drop shadow (it had no edge on a white page),
   and the sample covers' corner light is drawn in a softer ink (--pi-ink, 30% ink into the
   background) so it reads as a faint grey tint instead of a dark smudge. */

const EASE = [0.16, 1, 0.3, 1] as const
const LAYOUT_SPRING = { type: "spring", stiffness: 400, damping: 32 } as const

export interface ProjectIndexItem {
  title: string
  tag: string
  year: string
  /** the ticker, read beside the title */
  ticker?: string
  /** the return in percent; derived from `series` when absent */
  change?: number
  /** prices since it was opened, oldest first: the row's return is worked from them */
  series?: number[]
  /** today's prices, oldest first: the cover draws them as its 1D line (his call, 2026-10-02:
   *  "make them say one day chart"); the cover falls back to `series` without them */
  day?: number[]
  href?: string
  /** Cover image URL; falls back to `grad` (a CSS background) when absent. */
  image?: string
  grad?: string
}

/** a seeded path from one price to another; the wobble is pinned to nothing at both ends */
function bridge(start: number, end: number, seed: number, n = 40, wobble = 0.12) {
  let s = seed
  let drift = 0
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647
    const t = i / (n - 1)
    drift = drift * 0.8 + (s / 2147483647 - 0.5) * wobble * Math.max(start, end)
    out.push(start + (end - start) * t + drift * Math.sin(Math.PI * t))
  }
  return out
}

/** a position from 100 at the open to 100 × (1 + return) now */
const held = (ret: number, seed: number) => bridge(100, 100 * (1 + ret / 100), seed)
/** one trading day from 100 to 100 × (1 + the day's move), a finer wobble */
const today = (move: number, seed: number) => bridge(100, 100 * (1 + move / 100), seed, 48, 0.012)

const DEFAULT_ITEMS: ProjectIndexItem[] = [
  { title: "NVIDIA", ticker: "NVDA", tag: "Semiconductors", year: "2021", series: held(412.6, 7), day: today(2.1, 41) },
  { title: "Coinbase", ticker: "COIN", tag: "Crypto exchange", year: "2023", series: held(238.4, 11), day: today(-1.4, 43) },
  { title: "JPMorgan Chase", ticker: "JPM", tag: "Banking", year: "2019", series: held(118.2, 19), day: today(0.6, 47) },
  { title: "Intuitive Surgical", ticker: "ISRG", tag: "Medical robotics", year: "2020", series: held(71.3, 23), day: today(0.9, 53) },
  { title: "Adyen", ticker: "ADYEN", tag: "Payments", year: "2024", series: held(-8.6, 31), day: today(-0.8, 59) },
]

const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"
/** a hue as text: its lightness is capped in the light theme so small figures stay readable */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`
/** the return: the given one, else the series' first to last */
const returnOf = (r: ProjectIndexItem) =>
  r.change ?? (r.series && r.series.length > 1 && r.series[0] ? ((r.series[r.series.length - 1] - r.series[0]) / r.series[0]) * 100 : undefined)
const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`

/** the cover's chart: the series edge to edge, its low at 88% of the height, its high at 40% */
function coverLine(series: number[], w: number, h: number) {
  const lo = Math.min(...series)
  const hi = Math.max(...series)
  const span = Math.max(1e-9, hi - lo)
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, h * 0.88 - ((v - lo) / span) * h * 0.48] as const)
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")
  return { line, area: `${line} L ${w} ${h} L 0 ${h} Z` }
}

const COVER_W = 220
const MAX_W = 560

/**
 * Project index: bare rows of title, tag and year. The cover only exists while a row is
 * pointed at, floating beside the cursor, and the other rows step back.
 */
export function ProjectIndex({
  items = DEFAULT_ITEMS,
  label = "Holdings",
  className,
}: {
  items?: ProjectIndexItem[]
  /** the list's name for a screen reader */
  label?: string
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
    const el = wrap.current
    const r = el?.getBoundingClientRect()
    if (!el || !r) return
    /* the pointer is in screen pixels, the cover is placed in the list's own: a scaled preview
       would otherwise leave the cover short of the cursor (2026-10-02) */
    const k = r.width / (el.offsetWidth || r.width) || 1
    setPos({ x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k })
  }

  return (
    <div
      ref={wrap}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      className={cn("relative w-full max-w-[560px] tabular-nums [--ink-l:0.5] [--pi-ink:color-mix(in_srgb,var(--foreground)_30%,var(--background))] dark:[--ink-l:1] dark:[--pi-ink:var(--foreground)]", className)}
      role="group"
      aria-label={`${label}, ${items.length}`}
    >
      {items.map((r, i) => {
        const ret = returnOf(r)
        return (
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
          aria-label={[r.title, r.ticker, r.tag, r.year, ret !== undefined ? `${signedPct(ret)} since` : null].filter(Boolean).join(", ")}
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
          <span className="shrink-0 text-[19px] font-semibold text-foreground/90">{r.title}</span>
          {r.ticker && <span className="shrink-0 text-[11px] font-medium text-foreground/45">{r.ticker}</span>}
          <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/60">{r.tag}</span>
          <span className="text-[11px] tabular-nums text-foreground/45">{r.year}</span>
          {ret !== undefined && (
            <span className="w-[60px] shrink-0 text-right text-[12px] font-medium tabular-nums" style={{ color: ink(ret >= 0 ? GREEN : RED) }}>
              {signedPct(ret)}
            </span>
          )}
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
        )
      })}

      {/* floating cover, only alive while a row is pointed at */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-10 aspect-[4/3] overflow-hidden rounded-[16px] bg-background shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent),0_12px_28px_-12px_rgba(0,0,0,0.18)] dark:bg-[color-mix(in_srgb,var(--foreground)_9%,var(--background))] dark:shadow-none"
        style={{ width: COVER_W }}
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
            /* no gradient behind a chart cover (his call, 2026-10-02): the cover's own lighter ground */
            style={{ opacity: hover === i ? 1 : 0, background: r.series || r.day ? undefined : r.grad }}
          >
            {r.image ? (
              <img src={r.image} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            ) : ((r.day ?? r.series)?.length ?? 0) > 1 ? (
              <CoverChart item={r} />
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

const COVER_H = (COVER_W * 3) / 4

/** the cover: the position's 1D line edge to edge along the bottom, plain, no fill under it
 *  (his call, 2026-10-02), the ticker with "1D" and the day's move over it.
 *  · day's move = (last − first) ÷ first × 100 of `day` (of `series` when there is no day) */
function CoverChart({ item }: { item: ProjectIndexItem }) {
  const daily = !!item.day
  const series = item.day ?? item.series ?? []
  const move = series.length > 1 && series[0] ? ((series[series.length - 1] - series[0]) / series[0]) * 100 : (returnOf(item) ?? 0)
  const { line } = coverLine(series, COVER_W, COVER_H)
  const hue = move >= 0 ? GREEN : RED
  return (
    <>
      <span className="absolute left-3 top-2.5 flex items-baseline gap-1.5 text-[11px] font-medium text-foreground/60">
        {item.ticker ?? item.title}
        {daily && <span className="font-normal text-foreground/45">1D</span>}
      </span>
      <span className="absolute right-3 top-2.5 text-[11px] font-medium" style={{ color: ink(hue) }}>
        {signedPct(move)}
      </span>
      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox={`0 0 ${COVER_W} ${COVER_H}`} preserveAspectRatio="none">
        <path d={line} fill="none" stroke={hue} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </>
  )
}
