"use client"

import { useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const W = 280
const H = 84
const N = 60

/** the signed-percent pill: direction picks the arrow and the hue, zero is flat with no arrow */
function ChangeTag({ value, dp = 1 }: { value: number; dp?: number }) {
  const up = value >= 0
  const hue = up ? GREEN : RED
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[12px] font-semibold tabular-nums"
      style={{ color: hue, background: `color-mix(in srgb, ${hue} 13%, transparent)` }}
    >
      {value !== 0 && (up ? <ChevronUp className="h-3 w-3" strokeWidth={2.5} /> : <ChevronDown className="h-3 w-3" strokeWidth={2.5} />)}
      <span>
        {value > 0 ? "+" : value < 0 ? "−" : ""}
        {Math.abs(value).toFixed(dp)}%
      </span>
    </span>
  )
}

/**
 * The compact asset-price card: one line, one number. The headline price
 * scrubs as you move across the line and settles back to live on leave, and
 * the foot reads how far back the pointer is. The walk is de-trended onto the
 * two numbers the card prints, so (close − open) ÷ open is the percent in the
 * tag. One hue, the sign of the session.
 */
export function SimpleChart({
  name = "Ethereum",
  symbol = "ETH",
  last = 3050,
  change = 1.4,
  className,
}: {
  name?: string
  symbol?: string
  /** the live price; the line ends here */
  last?: number
  /** the session move in percent; the line opens at last ÷ (1 + change) */
  change?: number
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const pts = useMemo(() => {
    const rand = mulberry32(41)
    const open = last / (1 + change / 100)
    const steps: number[] = []
    let v = 0
    for (let i = 0; i < N; i++) {
      steps.push(v)
      v += (rand() - 0.5) * last * 0.006
    }
    const drift = steps[N - 1]
    const vals = steps.map((s, i) => open + (s - (drift * i) / (N - 1)) + ((last - open) * i) / (N - 1))
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    return vals.map((val, i) => ({ x: (i / (N - 1)) * W, y: H - 8 - ((val - lo) / (hi - lo || 1)) * (H - 16), val }))
  }, [last, change])

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
  const shown = hover != null ? pts[hover].val : last
  const hue = change >= 0 ? GREEN : RED

  return (
    <div
      className={cn("w-[300px] rounded-xl border border-foreground/[0.04] p-4", className)}
      style={{ background: "var(--card)", boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)" }}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-[12px] text-foreground/45">
            {name} · {symbol}
          </span>
          <span className="text-[22px] font-semibold tabular-nums leading-tight tracking-[-0.02em] text-foreground/90">
            ${shown.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <ChangeTag value={change} />
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 h-[84px] w-full cursor-crosshair touch-none"
        role="img"
        aria-label={`${symbol} 24 hour price, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)} percent`}
        onPointerMove={(e) => {
          const el = svgRef.current
          if (!el) return
          const r = el.getBoundingClientRect()
          setHover(Math.max(0, Math.min(N - 1, Math.round(((e.clientX - r.left) / r.width) * (N - 1)))))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <path d={path} fill="none" stroke={hue} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
        {hover != null && (
          <>
            <line x1={pts[hover].x} y1={0} x2={pts[hover].x} y2={H} stroke="var(--foreground)" strokeOpacity={0.22} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={pts[hover].x} cy={pts[hover].y} r={3} fill={hue} stroke="var(--card)" strokeWidth={1.5} />
          </>
        )}
      </svg>
      {/* the foot answers when: 60 samples span 24h */}
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-foreground/35">
        <span>24h ago</span>
        <span>{hover != null ? `−${(((N - 1 - hover) / (N - 1)) * 24).toFixed(1)}h` : "now"}</span>
      </div>
    </div>
  )
}
