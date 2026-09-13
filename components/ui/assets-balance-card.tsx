"use client"

import { useId, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

/* motion + ink tokens, standalone: the library file carries its own constants */
const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = 'var(--chart-2)'
const RED = 'var(--chart-down)'
const HAIRLINE = 'color-mix(in srgb, var(--foreground) 9%, transparent)'

/** deterministic seeded PRNG (mulberry32) — no Math.random at render */
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

const TABULAR = { fontVariantNumeric: 'tabular-nums' } as const

/** the face sits BELOW the page ground now, not lit above it: a deep mix of
 *  background into card. Darker and quieter than the old top-lit wash. */
const FACE_WASH = 'linear-gradient(color-mix(in srgb, var(--background) 45%, var(--card)), color-mix(in srgb, var(--background) 45%, var(--card)))'

/** the plot box sits at top 10% / height 74% of the card, so the scrub crosshair
 *  has to bleed past its own box to reach the card edges: 10/74 above, 16/74
 *  below. overflow-hidden on the card trims it flush. */
const CROSS_TOP = `${((-10 / 74) * 100).toFixed(2)}%`
const CROSS_BOTTOM = `${((-16 / 74) * 100).toFixed(2)}%`

/** the guide still runs to the card's top edge, but it dissolves on the way up
 *  instead of stopping on a flat line: nothing at the edge, full ink by the time
 *  it has entered the plot area. The fade is on the paint, not on a shorter bar,
 *  so the crosshair reads as reaching higher than a hard-ended one would. */
const CROSS_INK = 'color-mix(in srgb, var(--foreground) 22%, transparent)'
const CROSS_PAINT = `linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--foreground) 5%, transparent) 7%, color-mix(in srgb, var(--foreground) 14%, transparent) 13%, ${CROSS_INK} 20%, ${CROSS_INK} 100%)`
/** the chip rides above the dot rather than beside its centre, so the value sits
 *  in clear space and the eye travels up the guide to read it */
const TIP_LIFT = 18

/** below this the card stacks: balance above, chart as a full-width band under it */
const STACK_AT = 430
/** ...and the same flip on the other axis: the balance block is about 200px of
 *  fixed content, so once the drag has pulled the card past that plus a full
 *  chart band the side-by-side split is mostly empty column on the left. 132 is
 *  the pull that gets there (MIN_H 228 + 132 = 360 ≈ 200 + BAND_H + padding). */
const STACK_PULL_AT = 132
/** chart band height in stacked mode, and the drag handle grows it like the wide layout */
const BAND_H = 132

/** resting card height, and how far the bottom handle can pull the box down —
 *  the chart layers are percentage-boxed, so height IS the chart's height */
const MIN_H = 228
const MAX_PULL = 320
/** one keyboard step on the handle */
const PULL_STEP = 24

/** digit cell height in em — shared by the odometer stack and static glyphs */
const DIGIT_EM = 1.2

/** the stacked layout, written once and used twice: the container query applies
 *  it bare (the card is the container), the .abc-stacked class applies it when
 *  the drag has made the card tall enough to want the same arrangement. */
const stackedRules = (p: string) => `
${p}.abc-chart{top:auto;bottom:0;height:var(--abc-band);width:100%;-webkit-mask-image:none;mask-image:none}
${p}.abc-glow{left:22%;top:auto;bottom:calc(var(--abc-band) - 44px);width:56%;height:112px}
${p}.abc-block{padding-top:26px;padding-bottom:calc(var(--abc-band) + 14px)}
${p}.abc-cross{top:0;bottom:0}`
const cell = { display: 'block', height: `${DIGIT_EM}em`, lineHeight: `${DIGIT_EM}em` } as const

/** one rolling digit column — a 0-9 stack translating into place */
function OdometerDigit({ ch, order, animate }: { ch: string; order: number; animate: boolean }) {
  const d = ch.charCodeAt(0) - 48
  if (!animate) return <span style={cell}>{ch}</span>
  return (
    <span style={{ ...cell, overflow: 'hidden' }}>
      <motion.span
        style={{ display: 'block' }}
        initial={{ y: '0em' }}
        animate={{ y: `${(-d * DIGIT_EM).toFixed(2)}em` }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.1 + order * 0.05 }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} style={cell}>{n}</span>
        ))}
      </motion.span>
    </span>
  )
}

/** x position 0..1 → intraday clock label (09:30 → 16:00) */
const intradayLabel = (t: number) => {
  const mins = Math.round(570 + t * 390)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export type AssetsBalanceCardProps = {
  label?: string
  balance?: string
  changePct?: string
  changeAbs?: string
  period?: string
  /** flips the whole signal (line, badge, numbers) from the system red to green */
  up?: boolean
  /** ambient line values, 0..1 (0 = bottom of the band) */
  series?: number[]
  className?: string
}

type Scrub = { t: number; v: number }

export function AssetsBalanceCard({
  label = 'Assets',
  balance = '$54,847.30',
  changePct = '3.24%',
  changeAbs = '-$1,023.95',
  period = 'Today',
  up = false,
  series = DEFAULT_SERIES,
  className = '',
}: AssetsBalanceCardProps) {
  const reduced = useReducedMotion()
  const frozen = !!reduced
  const gradientId = useId()
  const signal = up ? GREEN : RED

  const [scrub, setScrub] = useState<Scrub | null>(null)
  const [scrubbing, setScrubbing] = useState(false)

  // bottom handle drag — pulls the whole box (and with it the chart) taller
  const [pull, setPull] = useState(0)
  const [pulling, setPulling] = useState(false)
  const drag = useRef<{ y: number; from: number } | null>(null)

  /** numeric base for the scrub chip — derived from the displayed balance */
  const baseValue = useMemo(() => Number(balance.replace(/[^0-9.]/g, '')) || 0, [balance])

  // ambient line geometry — 100x100 box stretched to fit, stroke stays crisp
  const { linePath, areaPath } = useMemo(() => {
    const pts = series.map((v, i) => {
      const px = (i / (series.length - 1 || 1)) * 100
      return `${px.toFixed(2)} ${seriesY(v).toFixed(2)}`
    })
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p}`).join(' ')
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
    setScrubbing(true)
  }

  const clampPull = (v: number) => Math.min(MAX_PULL, Math.max(0, v))

  const onHandleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = { y: e.clientY, from: pull }
    setPulling(true)
    // capture is the enhancement, not the mechanism — it keeps the pull alive once
    // the cursor leaves the grip; a UA that refuses it still drags inside the box
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
    if (e.key === 'ArrowDown') setPull((p) => clampPull(p + PULL_STEP))
    else if (e.key === 'ArrowUp') setPull((p) => clampPull(p - PULL_STEP))
    else if (e.key === 'Home') setPull(0)
    else if (e.key === 'End') setPull(MAX_PULL)
    else return
    e.preventDefault()
  }

  const scrubValue = scrub ? baseValue * (0.96 + clamp01(scrub.v) * 0.08) : 0
  // percentage-space positions — immune to any stage/preview transform scaling
  const scrubX = scrub ? `${(scrub.t * 100).toFixed(2)}%` : '0%'
  const scrubY = scrub ? `${seriesY(scrub.v).toFixed(2)}%` : '0%'
  const chipFlips = scrub ? scrub.t > 0.68 : false
  /** the chip lifts off the dot, but never past the card's top edge: the floor is
   *  the card top (CROSS_TOP in plot-box units) plus half the chip */
  const scrubTipTop = `max(calc(${CROSS_TOP} + 14px), calc(${scrubY} - ${TIP_LIFT}px))`
  // height flip: the drag has made the box tall enough that the chart wants the
  // full width, the same arrangement the narrow container query asks for
  const stacked = pull >= STACK_PULL_AT

  // both digits and the change row come from props; the odometer only handles 0-9
  const balanceChars = balance.split('')
  let digitOrder = -1

  return (
    <div
      className={cn('abc-card relative overflow-hidden rounded-[26px]', stacked && 'abc-stacked', className)}
      style={{ minHeight: MIN_H + pull, ['--abc-band' as string]: `${BAND_H + pull}px` }}
    >
      {/* Stocked emboss — gradient hairline that lightens toward the top (same
          recipe as WatchlistStack, abc- scoped), over a bluish top-light wash on
          the card face. Both stay faint: hover lifts the shadow and the ring, not
          the top light. The outline is the small painted ring off the box.
          A `border-0` in className kills both for embedding.
          Two ways into the stacked arrangement, and either one is enough: the
          container query (card narrower than 430px) and the .abc-stacked class
          (dragged taller than MIN_H + STACK_PULL_AT). Both move the chart out of
          the right column into a full-width band under the balance. */}
      <style>{`
.abc-card{container-type:inline-size;border:1px solid transparent;background:${FACE_WASH} padding-box,linear-gradient(180deg,color-mix(in srgb,var(--foreground) 7%,transparent),color-mix(in srgb,var(--foreground) 2.5%,transparent) 32%,color-mix(in srgb,var(--foreground) 2%,transparent)) border-box;box-shadow:0 14px 32px var(--card-shadow, rgba(0,0,0,0.28));transition:box-shadow .3s}
.abc-card:hover{box-shadow:0 16px 38px var(--card-shadow, rgba(0,0,0,0.34))}
.abc-card.border-0{background:${FACE_WASH} padding-box}
.abc-cross{top:${CROSS_TOP};bottom:${CROSS_BOTTOM}}
${stackedRules('.abc-card.abc-stacked ')}
@container (max-width: ${STACK_AT}px){${stackedRules('')}
}
      `}</style>
      {/* soft glow bloom behind the line's peak region */}
      <div
        aria-hidden
        className="abc-glow pointer-events-none absolute"
        style={{
          left: '44%',
          top: '4%',
          width: '36%',
          height: '42%',
          background: `radial-gradient(ellipse at center, color-mix(in srgb, ${signal} 12%, transparent) 0%, transparent 70%)`,
          filter: 'blur(40px)',
        }}
      />

      {/* ambient price line — dips and recovers across the right of the card */}
      <svg
        aria-hidden
        className="abc-chart pointer-events-none absolute right-0 top-[10%] h-[74%] w-[58%]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          maskImage: 'linear-gradient(90deg, transparent 0%, black 26%)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, black 26%)',
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={signal} stopOpacity="0.22" />
            <stop offset="55%" stopColor={signal} stopOpacity="0.07" />
            <stop offset="100%" stopColor={signal} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={areaPath}
          fill={`url(#${gradientId})`}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.25 }}
        />
        <motion.path
          d={linePath}
          fill="none"
          stroke={signal}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: `drop-shadow(0 0 7px color-mix(in srgb, ${signal} 55%, transparent))` }}
          // NOTE: the draw-on dash animation is skipped on purpose; it breaks
          // under preserveAspectRatio="none" with this stroke setup (partial stroke)
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
        />
      </svg>

      {/* balance block */}
      <div className="abc-block relative px-7 pb-12 pt-[88px]">
        <p
          className="text-[10px] font-medium uppercase tracking-[0.14em]"
          style={{ color: 'color-mix(in srgb, var(--foreground) 38%, transparent)' }}
        >
          {label}
        </p>
        <p
          className="mt-1.5 text-[34px] font-semibold tracking-[-0.03em]"
          style={{ color: 'color-mix(in srgb, var(--foreground) 90%, transparent)', lineHeight: DIGIT_EM, ...TABULAR }}
        >
          <span className="sr-only">{balance}</span>
          <span aria-hidden className="flex">
            {balanceChars.map((ch, i) =>
              /\d/.test(ch) ? (
                <OdometerDigit key={i} ch={ch} order={++digitOrder} animate={!frozen} />
              ) : (
                <span key={i} style={cell}>{ch}</span>
              ),
            )}
          </span>
        </p>
        {/* One statement of the move, not three. This was an arrow chip AND a
            colour AND a signed figure — the same fix the watchlist rows took, so
            the hero and the list under it now say direction the same way. */}
        <div className="mt-2.5 flex items-center gap-2 text-[13px] font-medium" style={TABULAR}>
          <span style={{ color: signal }}>{up ? '+' : '−'}{changePct.replace(/^[+−-]/, '')}</span>
          <span style={{ color: 'color-mix(in srgb, var(--foreground) 26%, transparent)' }} aria-hidden>·</span>
          <span style={{ color: 'color-mix(in srgb, var(--foreground) 45%, transparent)' }}>{changeAbs}</span>
          <span style={{ color: 'color-mix(in srgb, var(--foreground) 32%, transparent)' }}>{period}</span>
        </div>
      </div>

      {/* hover scrub — hairline + dot riding the line + value chip */}
      <div
        className="abc-chart absolute right-0 top-[10%] h-[74%] w-[58%] cursor-crosshair"
        onPointerMove={onScrubMove}
        onPointerLeave={() => setScrubbing(false)}
      >
        <motion.div
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={{ opacity: scrubbing && scrub ? 1 : 0 }}
          transition={{ duration: 0.15 }}
        >
          {scrub && (
            <>
              {/* the guide runs the full height of the card, not just the plot
                  box, and fades out into the top light on the way up */}
              <div className="abc-cross absolute w-px" style={{ left: scrubX, background: CROSS_PAINT }} />
              <div
                className="absolute size-2 rounded-full"
                style={{
                  left: scrubX,
                  top: scrubY,
                  transform: 'translate(-50%, -50%)',
                  background: signal,
                  boxShadow: `0 0 0 2px var(--card), 0 0 8px color-mix(in srgb, ${signal} 70%, transparent)`,
                }}
              />
              <div
                className="absolute flex items-center gap-1.5 whitespace-nowrap rounded-[8px] border px-2 py-1 text-[11px] font-medium"
                style={{
                  left: scrubX,
                  top: scrubTipTop,
                  transform: chipFlips ? 'translate(calc(-100% - 12px), -50%)' : 'translate(12px, -50%)',
                  // raised gradient over the opaque card — the fan chip's ground
                  background: `linear-gradient(180deg, color-mix(in srgb, var(--foreground) 5%, var(--card)), var(--card))`,
                  borderColor: HAIRLINE,
                  // the chip lifts on a dark shadow, not a foreground-tinted one:
                  // a foreground mix reads as a light glow behind the tooltip in dark
                  boxShadow: '0 8px 24px var(--card-shadow, rgba(0,0,0,0.45))',
                  ...TABULAR,
                }}
              >
                <span className="font-semibold" style={{ color: 'color-mix(in srgb, var(--foreground) 92%, transparent)' }}>
                  {scrubValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </span>
                <span style={{ color: 'color-mix(in srgb, var(--foreground) 42%, transparent)' }}>
                  {intradayLabel(scrub.t)}
                </span>
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* drag handlebar — pull it down and the box grows; the chart is boxed in
          percentages, so it stretches with the card into a vertical read */}
      <button
        type="button"
        role="slider"
        aria-label="Pull down to make the chart taller"
        aria-valuemin={0}
        aria-valuemax={MAX_PULL}
        aria-valuenow={pull}
        className="absolute bottom-0 left-1/2 flex h-6 w-20 -translate-x-1/2 cursor-ns-resize touch-none items-end justify-center pb-2.5"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        onKeyDown={onHandleKey}
        onDoubleClick={() => setPull(0)}
      >
        <span
          className="h-1 rounded-full transition-[width,background-color] duration-200"
          style={{
            width: pulling ? 56 : 40,
            background: `color-mix(in srgb, var(--foreground) ${pulling ? 34 : 14}%, transparent)`,
          }}
        />
      </button>
    </div>
  )
}
