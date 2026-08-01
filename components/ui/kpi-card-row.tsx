import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { animate, motion, useReducedMotion } from "motion/react"
import { Activity, Target, Timer } from "lucide-react"

import { cn } from "@/lib/utils"

/** KPI Card Row — a dashboard stat band as live components: tinted icon chip,
 *  count-up value, signed delta, and a full-bleed area chart that runs
 *  edge-to-edge (no end dot — the line is flush with the card) and reads out the
 *  real amount at any point on hover. The chart is memoized so the count-up
 *  re-renders never interrupt its line draw. Light and dark via theme tokens. */

const EASE = [0.16, 1, 0.3, 1] as const
const BLUE = "var(--chart-1)"
const GREEN = "var(--chart-2)"
const AMBER = "var(--chart-amber)"

export type KpiItem = {
  label: string
  /** the metric's real series, in its own unit — the last point is the headline */
  data: number[]
  /** formats the headline and the hover read-out */
  format?: (v: number) => string
  /** signed change chip next to the headline */
  delta?: string
  /** false tints the delta amber instead of green (a fall that isn't good news) */
  up?: boolean
  /** line + area + icon tint; any CSS color, defaults to the chart ramp */
  color?: string
  /** leading glyph — any node, sized ~14px */
  icon?: ReactNode
}

export interface KpiCardRowProps {
  /** one card per metric */
  items?: KpiItem[]
  /** x labels for the sample points, read out under the hovered value */
  labels?: string[]
  className?: string
}

const DEFAULT_ITEMS: KpiItem[] = [
  {
    label: "Requests",
    icon: <Activity size={14} strokeWidth={2.5} />,
    color: BLUE,
    format: (v) => `${v.toFixed(1)}M`,
    delta: "+18.2%",
    up: true,
    data: [1.6, 1.7, 1.75, 1.9, 2.0, 2.1, 2.15, 2.25, 2.35, 2.4],
  },
  {
    label: "Accuracy",
    icon: <Target size={14} strokeWidth={2.5} />,
    color: GREEN,
    format: (v) => `${v.toFixed(1)}%`,
    delta: "+0.8%",
    up: true,
    data: [96.4, 96.8, 96.6, 97.2, 97.5, 97.8, 98.0, 98.1, 98.3, 98.4],
  },
  {
    label: "Latency",
    icon: <Timer size={14} strokeWidth={2.5} />,
    color: AMBER,
    format: (v) => `${Math.round(v)}ms`,
    delta: "−12ms",
    up: false,
    data: [210, 195, 188, 176, 168, 160, 155, 150, 146, 142],
  },
]

/** the date each of the 10 sample points lands on — deterministic, shown in the
 *  hover readout so you can see when a value was recorded. */
const DEFAULT_LABELS = ["Feb 24", "Mar 3", "Mar 10", "Mar 17", "Mar 24", "Mar 31", "Apr 7", "Apr 14", "Apr 21", "Apr 28"]

const W = 186
const H = 82
const TOP = 10
const BOT = 6

const fallbackFormat = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1))

/** full-bleed area chart — the line runs the full card width flush to both edges
 *  (no end dot); hover a point to read its amount. */
function KpiSpark({
  data,
  color,
  format,
  labels,
}: {
  data: number[]
  color: string
  format: (v: number) => string
  labels: string[]
}) {
  const reduced = useReducedMotion()
  const uid = useId().replace(/:/g, "")
  const boxRef = useRef<HTMLDivElement>(null)
  const [hi, setHi] = useState<number | null>(null)

  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = Math.max(1e-6, max - min)
  const x = (i: number) => (i / Math.max(1, data.length - 1)) * W
  const y = (v: number) => TOP + (1 - (v - min) / span) * (H - TOP - BOT)
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ")
  const area = `${line} L ${W} ${H} L 0 ${H} Z`

  const onMove = (e: React.PointerEvent) => {
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHi(Math.max(0, Math.min(data.length - 1, Math.round((px / W) * (data.length - 1)))))
  }

  const lp = hi === null ? 0 : Math.max(15, Math.min(85, (x(hi) / W) * 100))

  return (
    <div ref={boxRef} className="relative" onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" fill="none" aria-hidden>
        <defs>
          <linearGradient id={`kpi-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={area}
          fill={`url(#kpi-${uid})`}
          initial={{ opacity: reduced ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: 0.55 }}
        />
        <motion.path
          d={line}
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: reduced ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={reduced ? { duration: 0 } : { duration: 0.9, ease: EASE }}
        />
        {hi !== null && (
          <g>
            <line x1={x(hi)} y1={2} x2={x(hi)} y2={H} stroke="color-mix(in srgb, var(--foreground) 16%, transparent)" strokeWidth="1" />
            <circle cx={x(hi)} cy={y(data[hi])} r="2.75" fill={color} stroke="var(--surface, var(--card))" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {hi !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md px-1.5 py-1 text-center"
          style={{
            left: `${lp}%`,
            background: "color-mix(in srgb, var(--card-raised, var(--card)) 92%, transparent)",
            boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--foreground) 8%, transparent)",
          }}
        >
          <div className="text-[9.5px] font-semibold tabular-nums text-foreground">{format(data[hi])}</div>
          {labels[hi] && <div className="mt-px text-[8px] tabular-nums text-muted-foreground">{labels[hi]}</div>}
        </div>
      )}
    </div>
  )
}

function KpiCard({ item, labels, delay }: { item: KpiItem; labels: string[]; delay: number }) {
  const reduced = useReducedMotion()
  const data = item.data.length ? item.data : [0]
  const format = item.format ?? fallbackFormat
  const color = item.color ?? BLUE
  const target = data[data.length - 1]
  const [v, setV] = useState(reduced ? target : 0)
  const shown = useRef(reduced ? target : 0)

  useEffect(() => {
    if (reduced) return
    const controls = animate(shown.current, target, {
      duration: 1.1,
      delay,
      ease: EASE,
      onUpdate: (n) => {
        shown.current = n
        setV(n)
      },
    })
    return () => controls.stop()
  }, [target, delay, reduced])

  // memoized: the count-up re-renders this card ~60fps — without this the chart's
  // pathLength draw restarts every frame and never reaches the end. (Its own hover
  // state still re-renders it normally.)
  const spark = useMemo(
    () => <KpiSpark data={data} color={color} format={format} labels={labels} />,
    [data, color, format, labels],
  )

  return (
    <div
      className="relative w-[186px] overflow-hidden rounded-lg border border-foreground/[0.04]"
      style={{
        background: "var(--surface, var(--card))",
        boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)",
      }}
    >
      <div className="px-3.5 pt-4">
        <div className="flex items-center gap-1.5">
          {item.icon && (
            <span aria-hidden className="flex" style={{ color }}>
              {item.icon}
            </span>
          )}
          <span className="text-[11.5px] font-medium text-foreground/55">{item.label}</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="tabular-nums text-[22px] font-semibold text-foreground/90" style={{ lineHeight: 1, letterSpacing: "-0.02em" }}>
            {format(v)}
          </span>
          {item.delta && (
            <span className="tabular-nums text-[10px] font-medium" style={{ color: item.up === false ? AMBER : GREEN }}>
              {item.delta}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2.5">{spark}</div>
    </div>
  )
}

/**
 * A row of KPI cards — each one counts its headline up on mount, carries a
 * signed delta, and sits on a full-bleed area chart you can hover to read any
 * sample point with its date.
 */
export function KpiCardRow({ items = DEFAULT_ITEMS, labels = DEFAULT_LABELS, className }: KpiCardRowProps) {
  return (
    <div className={cn("flex flex-wrap items-stretch justify-center gap-3", className)}>
      {items.map((item, i) => (
        <KpiCard key={item.label} item={item} labels={labels} delay={i * 0.12} />
      ))}
    </div>
  )
}

export default KpiCardRow
