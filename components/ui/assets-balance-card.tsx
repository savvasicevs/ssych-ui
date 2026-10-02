"use client"

import { useId, useMemo, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Assets Balance Card, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card: the 26px corner, the embossed outline, the wash and the drop shadow are gone,
     the balance and its line sit on the page
   · no glow: the bloom behind the line, the line's own drop shadow and the dot's halo are gone
   · the label is sentence case at full letter fit (it was capitals, letter-spaced)
   · pointing at the line puts that moment's value and its time where the balance is, as
     plain text; the floating chip with its border and shadow is gone
   · the line is 1.8px, the crosshair is one 1px rule the height of the plot
   · the change is written with a true minus sign, the amount too
   · the digits still roll in once, in 0.4s (it was 0.9s)
   · the chart names itself to a screen reader
   Props are the same. `className="border-0"` no longer does anything: there is no outline.
   Motion (2026-10-01): nothing runs until the block first comes into view. Then the line and
   its fill are wiped in from the left by one clip, 850ms, while the balance digits roll in
   (the odometer was already here, 400ms, 35ms apart). A new `series` of the same length
   morphs the line and the fill point for point in 380ms. Reduced motion draws it all at once. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

/** deterministic seeded generator (mulberry32), so every render agrees */
const seeded = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** piecewise-linear keyframes of a down day: rally, sharp fall, choppy recovery */
const KEYS: Array<[number, number]> = [
  [0, 0.56], [0.1, 0.63], [0.2, 0.9], [0.28, 0.74], [0.36, 0.82], [0.46, 0.42],
  [0.56, 0.12], [0.64, 0.42], [0.71, 0.2], [0.79, 0.48], [0.88, 0.28], [1, 0.52],
]
const shape = (t: number) => {
  let i = 1
  while (i < KEYS.length - 1 && KEYS[i][0] < t) i++
  const [x0, y0] = KEYS[i - 1]
  const [x1, y1] = KEYS[i]
  return y0 + ((t - x0) / (x1 - x0 || 1)) * (y1 - y0)
}

const DEFAULT_SERIES = (() => {
  const rnd = seeded(7)
  return Array.from({ length: 48 }, (_, i) => {
    const t = i / 47
    return Math.min(1, Math.max(0, shape(t) + (rnd() - 0.5) * 0.16))
  })
})()

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** series value 0..1 → y in the chart's 0..100 viewBox */
const seriesY = (v: number) => 6 + (1 - clamp01(v)) * 88

/** below this width the balance stacks above the chart, which becomes a full-width band */
const STACK_AT = 430
/** the same flip on the other axis: pulled this far, the chart wants the full width */
const STACK_PULL_AT = 132
/** chart band height in the stacked arrangement */
const BAND_H = 132

/** resting height, and how far the bottom handle can pull it down */
const MIN_H = 196
const MAX_PULL = 320
/** one keyboard step on the handle */
const PULL_STEP = 24

/** digit cell height in em, shared by the rolling stack and the still glyphs */
const DIGIT_EM = 1.2
const cell = { display: "block", height: `${DIGIT_EM}em`, lineHeight: `${DIGIT_EM}em` } as const

/** the stacked layout, written once and used twice: by the container query, and by the
 *  .abr-stacked class when the drag has made the block tall enough to want it */
const stackedRules = (p: string) => `
${p}.abr-chart{top:auto;bottom:24px;height:var(--abr-band);width:100%;-webkit-mask-image:none;mask-image:none}
${p}.abr-block{padding-top:4px;padding-bottom:calc(var(--abr-band) + 38px)}`

/** one rolling digit column: a 0 to 9 stack sliding into place once `go` turns on */
function OdometerDigit({ ch, order, animate, go }: { ch: string; order: number; animate: boolean; go: boolean }) {
  const d = ch.charCodeAt(0) - 48
  if (!animate) return <span style={cell}>{ch}</span>
  return (
    <span style={{ ...cell, overflow: "hidden" }}>
      <motion.span
        style={{ display: "block" }}
        initial={{ y: "0em" }}
        animate={{ y: go ? `${(-d * DIGIT_EM).toFixed(2)}em` : "0em" }}
        transition={{ duration: 0.4, ease: EASE, delay: order * 0.035 }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} style={cell}>{n}</span>
        ))}
      </motion.span>
    </span>
  )
}

/** x position 0..1 → intraday clock label (09:30 to 16:00) */
const intradayLabel = (t: number) => {
  const mins = Math.round(570 + t * 390)
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
}

/** a leading hyphen becomes the true minus sign */
const trueMinus = (s: string) => s.replace(/^-/, "−")

export type AssetsBalanceCardProps = {
  label?: string
  balance?: string
  changePct?: string
  changeAbs?: string
  period?: string
  /** flips the whole signal (line and change) from red to green */
  up?: boolean
  /** ambient line values, 0..1 (0 = bottom of the band) */
  series?: number[]
  className?: string
}

type Scrub = { t: number; v: number }

/**
 * A balance and the day that made it: one large figure, its signed change, and the line
 * running out to the right. Pointing at the line reads that moment in place of the balance,
 * with its time. The handle under it pulls the chart taller, and past a point the chart
 * takes the full width under the figure.
 */
export function AssetsBalanceCard({
  label = "Assets",
  balance = "$54,847.30",
  changePct = "3.24%",
  changeAbs = "-$1,023.95",
  period = "Today",
  up = false,
  series = DEFAULT_SERIES,
  className = "",
}: AssetsBalanceCardProps) {
  const reduced = useReducedMotion()
  const frozen = !!reduced
  const gradientId = useId().replace(/:/g, "")
  const signal = up ? GREEN : RED
  const rootRef = useRef<HTMLDivElement>(null)
  /* the wipe and the roll wait until the block is on screen */
  const seen = useInView(rootRef, { once: true, amount: 0.3 })
  const shown = seen || frozen

  const [scrub, setScrub] = useState<Scrub | null>(null)
  /** set on the first scrub, so the odometer rolls on mount only */
  const [scrubbed, setScrubbed] = useState(false)

  // bottom handle drag: pulls the whole block (and with it the chart) taller
  const [pull, setPull] = useState(0)
  const [pulling, setPulling] = useState(false)
  const drag = useRef<{ y: number; from: number } | null>(null)

  /** numeric base for the scrub readout, derived from the displayed balance */
  const baseValue = useMemo(() => Number(balance.replace(/[^0-9.]/g, "")) || 0, [balance])

  // ambient line geometry: a 100x100 box stretched to fit, the stroke stays crisp
  const { linePath, areaPath } = useMemo(() => {
    const pts = series.map((v, i) => {
      const px = (i / (series.length - 1 || 1)) * 100
      return `${px.toFixed(2)} ${seriesY(v).toFixed(2)}`
    })
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p}`).join(" ")
    return { linePath: line, areaPath: `${line} L100 100 L0 100 Z` }
  }, [series])

  const onScrubMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const t = clamp01((e.clientX - rect.left) / rect.width)
    const f = t * (series.length - 1)
    const i0 = Math.floor(f)
    const i1 = Math.min(series.length - 1, i0 + 1)
    const v = series[i0] + (series[i1] - series[i0]) * (f - i0)
    setScrub({ t, v })
    if (!scrubbed) setScrubbed(true)
  }

  const clampPull = (v: number) => Math.min(MAX_PULL, Math.max(0, v))

  const onHandleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = { y: e.clientY, from: pull }
    setPulling(true)
    // capture keeps the pull alive once the pointer leaves the grip; a browser that
    // refuses it still drags inside the grip
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no capture, still draggable */ }
  }
  const onHandleMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return
    setPull(clampPull(drag.current.from + (e.clientY - drag.current.y)))
  }
  const onHandleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    drag.current = null
    setPulling(false)
  }
  const onHandleKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") setPull((p) => clampPull(p + PULL_STEP))
    else if (e.key === "ArrowUp") setPull((p) => clampPull(p - PULL_STEP))
    else if (e.key === "Home") setPull(0)
    else if (e.key === "End") setPull(MAX_PULL)
    else return
    e.preventDefault()
  }

  /** the value under the pointer: the balance scaled by the line, 0.96 at the floor of
   *  the band to 1.04 at its top */
  const scrubValue = scrub ? baseValue * (0.96 + clamp01(scrub.v) * 0.08) : 0
  // percentage positions, so any scaling of the stage leaves them right
  const scrubX = scrub ? `${(scrub.t * 100).toFixed(2)}%` : "0%"
  const scrubY = scrub ? `${seriesY(scrub.v).toFixed(2)}%` : "0%"
  const stacked = pull >= STACK_PULL_AT

  const pct = `${up ? "+" : "−"}${changePct.replace(/^[+−-]/, "")}`
  const balanceChars = balance.split("")
  let digitOrder = -1

  return (
    <div
      ref={rootRef}
      className={cn("abr-root relative tabular-nums", stacked && "abr-stacked", className)}
      style={{ minHeight: MIN_H + pull, ["--abr-band" as string]: `${BAND_H + pull}px` }}
      role="group"
      aria-label={`${label} ${balance}`}
    >
      {/* two ways into the stacked arrangement, and either one is enough: the block is
          narrower than 430px, or it has been pulled taller than its rest height + 132 */}
      <style>{`
.abr-root{container-type:inline-size}
${stackedRules(".abr-root.abr-stacked ")}
@container (max-width: ${STACK_AT}px){${stackedRules("")}
}
      `}</style>

      {/* the day's line, running out to the right of the figure */}
      {/* the line draws in left to right through a clip on the whole plot: a dash draw
          breaks on a stretched box with a non-scaling stroke, a clip does not */}
      <motion.svg
        className="abr-chart pointer-events-none absolute right-0 top-[8%] h-[74%] w-[58%] overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} over ${period.toLowerCase()}: ${balance}, ${pct}`}
        style={{
          maskImage: "linear-gradient(90deg, transparent 0%, black 26%)",
          WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 26%)",
        }}
        initial={reduced ? false : { clipPath: "inset(-10% 100% -10% 0%)" }}
        animate={{ clipPath: shown ? "inset(-10% 0% -10% 0%)" : "inset(-10% 100% -10% 0%)" }}
        transition={reduced ? { duration: 0 } : { duration: 0.85, ease: EASE }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={signal} stopOpacity="0.16" />
            <stop offset="100%" stopColor={signal} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* keyed by length: a same-length series morphs point for point, another length is drawn at once */}
        <motion.path
          key={`a${series.length}`}
          initial={false}
          animate={{ d: areaPath }}
          transition={reduced ? { duration: 0 } : { duration: 0.38, ease: EASE }}
          fill={`url(#${gradientId})`}
        />
        <motion.path
          key={`l${series.length}`}
          initial={false}
          animate={{ d: linePath }}
          transition={reduced ? { duration: 0 } : { duration: 0.38, ease: EASE }}
          fill="none"
          stroke={signal}
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ transition: "stroke 200ms ease-out" }}
        />
      </motion.svg>

      {/* the figure; while the line is being pointed at it reads that moment instead */}
      <div className="abr-block relative pb-10 pt-[72px]">
        <p className="text-[11px] font-medium text-foreground/45">{label}</p>
        <div role="status">
          <p
            className="mt-1.5 text-[34px] font-semibold tracking-[-0.03em] text-foreground/90"
            style={{ lineHeight: DIGIT_EM }}
          >
            {scrub ? (
              // the swap from the balance to the pointed moment crosses over (4px, 2px blur,
              // 150ms); the figure then follows the pointer in place
              <motion.span
                key="scrub"
                style={cell}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.15, ease: EASE }}
              >
                {scrubValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </motion.span>
            ) : (
              <>
                <span className="sr-only">{balance}</span>
                {/* the digits roll in once, on mount; coming back from a scrub the balance
                    crosses over like the scrub value did instead of rolling again */}
                <motion.span
                  key="balance"
                  aria-hidden
                  className="flex"
                  initial={scrubbed ? (reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }) : false}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.15, ease: EASE }}
                >
                  {balanceChars.map((ch, i) =>
                    /\d/.test(ch) ? (
                      <OdometerDigit key={i} ch={ch} order={++digitOrder} animate={!frozen && !scrubbed} go={shown} />
                    ) : (
                      <span key={i} style={cell}>{ch}</span>
                    ),
                  )}
                </motion.span>
              </>
            )}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[13px] font-medium">
            {scrub ? (
              <motion.span
                key="scrub-time"
                className="text-foreground/45"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.15, ease: EASE }}
              >
                {intradayLabel(scrub.t)}
              </motion.span>
            ) : (
              <>
                <span style={{ color: signal }}>{pct}</span>
                <span className="text-foreground/45">{trueMinus(changeAbs)}</span>
                <span className="text-foreground/35">{period}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* scrub layer: one rule and a dot riding the line */}
      <div
        className="abr-chart absolute right-0 top-[8%] h-[74%] w-[58%] cursor-crosshair touch-none"
        onPointerMove={onScrubMove}
        onPointerLeave={() => setScrub(null)}
        onPointerCancel={() => setScrub(null)}
      >
        {scrub && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 w-px bg-foreground/[0.22]" style={{ left: scrubX }} />
            <div
              className="absolute size-[7px] rounded-full"
              style={{ left: scrubX, top: scrubY, transform: "translate(-50%, -50%)", background: signal }}
            />
          </div>
        )}
      </div>

      {/* the handle: pull it down and the chart grows with the block */}
      <button
        type="button"
        role="slider"
        aria-label="Pull down to make the chart taller"
        aria-valuemin={0}
        aria-valuemax={MAX_PULL}
        aria-valuenow={pull}
        className="group absolute bottom-0 left-1/2 flex h-6 w-20 -translate-x-1/2 cursor-ns-resize touch-none items-center justify-center outline-none"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        onKeyDown={onHandleKey}
        onDoubleClick={() => setPull(0)}
      >
        <span
          className={cn(
            // the grip widens by scale, not by width: transform stays off layout
            "h-1 w-14 rounded-full transition-[transform,background-color] duration-200",
            pulling ? "scale-x-100 bg-foreground/[0.35]" : "scale-x-[0.714] bg-foreground/[0.14] group-hover:bg-foreground/[0.35] group-focus-visible:bg-foreground/[0.35]",
            reduced && "transition-none",
          )}
        />
      </button>
    </div>
  )
}
