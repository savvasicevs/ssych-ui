"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Model Comparison, written new through ssych-component (2026-09-29).
   What it is for: choosing between two to four models on the same four measures.
   Read first: the full-strength value in each row. It is the best one on that measure;
   the others step back to label ink.
   The pointer: pointing at a value keeps its row and its column and dims the rest, brings
   its bar to full strength, and the line under the grid reads how far it is from the best.
   Colour: each model takes its own hue (--chart-1, --chart-5, --chart-3, --chart-amber), in
   the dot by its name and in its bars, so the columns are told apart (colour pass,
   2026-09-30); the best bar of a row is that hue at full strength, the rest at 40%.
   Pointing at a cost also reads how the blended cost was reached.
   Reference: browsable "model comparison" (descriptions only, no source read). Idea taken:
   the winner of a row is shown by strength and the others are dimmed, with no badge.
   Formulas:
   · blended cost per million = (3 × input price + output price) / 4, a 3 to 1 mix of input
     to output tokens                                        (3 × $3.00 + $15.00) / 4 = $6.00
   · best of a row = the highest value where more is better (quality, context), the lowest
     where less is better (latency, cost); equal values share it
   · bar length = value / best where more is better, best / value where less is better
   · gap = value − best, shown without its sign and named "behind"
   · "best on" under a name = count of rows where that model holds the best value
   The values are sample values, not published figures. */

const EASE = [0.16, 1, 0.3, 1] as const
const MODEL_HUES = ["var(--chart-1)", "var(--chart-5)", "var(--chart-3)", "var(--chart-amber)"]
/** input tokens per output token in the blended cost */
const MIX = 3

export interface ComparedModel {
  name: string
  /** eval score, 0 to 100 */
  quality: number
  /** seconds to the first token */
  latency: number
  /** dollars per million input tokens */
  inputPrice: number
  /** dollars per million output tokens */
  outputPrice: number
  /** context size in tokens */
  context: number
}

export interface ModelComparisonProps {
  /** two to four models; more than four are cut to the first four */
  models?: ComparedModel[]
  /** the grid's screen-reader name; the model names head the columns, so nothing is drawn */
  title?: string
  className?: string
}

const DEFAULT_MODELS: ComparedModel[] = [
  { name: "Claude Opus 5.5", quality: 92.4, latency: 1.9, inputPrice: 5, outputPrice: 25, context: 1000000 },
  { name: "Claude Sonnet 5", quality: 88.1, latency: 1.1, inputPrice: 3, outputPrice: 15, context: 1000000 },
  { name: "Claude Haiku 4.5", quality: 79.6, latency: 0.5, inputPrice: 1, outputPrice: 5, context: 200000 },
]

const blended = (m: ComparedModel) => (MIX * m.inputPrice + m.outputPrice) / (MIX + 1)
const dollars = (v: number) => `$${v.toFixed(2)}`
const tokens = (v: number) => (v >= 1e6 ? `${Number((v / 1e6).toFixed(1))}M` : `${Math.round(v / 1e3)}K`)

interface Measure {
  id: string
  label: string
  unit: string
  more: boolean
  get: (m: ComparedModel) => number
  show: (v: number) => string
  gap: (v: number) => string
}

const MEASURES: Measure[] = [
  { id: "quality", label: "Quality", unit: "score of 100", more: true, get: (m) => m.quality, show: (v) => v.toFixed(1), gap: (v) => `${v.toFixed(1)} points` },
  { id: "latency", label: "Latency", unit: "to first token", more: false, get: (m) => m.latency, show: (v) => `${v.toFixed(1)} s`, gap: (v) => `${v.toFixed(1)} s` },
  { id: "cost", label: "Cost", unit: "per million tokens", more: false, get: blended, show: dollars, gap: dollars },
  { id: "context", label: "Context", unit: "tokens", more: true, get: (m) => m.context, show: tokens, gap: (v) => `${tokens(v)} tokens` },
]

type Hot = { row: number; col: number }

/**
 * Models side by side in the Linear register: one column per model, one row per measure,
 * a value over a thin bar in every cell. The best value of a row carries full ink and
 * the rest sit at label ink, so the winner of each measure is read without a legend.
 */
export function ModelComparison({ models = DEFAULT_MODELS, title = "Models", className }: ModelComparisonProps) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<Hot | null>(null)
  const cols = models.slice(0, 4)

  const rows = MEASURES.map((ms) => {
    const values = cols.map(ms.get)
    const best = ms.more ? Math.max(...values) : Math.min(...values)
    return { ...ms, values, best, leader: cols[values.indexOf(best)]?.name ?? "" }
  })
  const wins = cols.map((_, c) => rows.filter((r) => r.values[c] === r.best).length)

  const template = { gridTemplateColumns: `92px repeat(${cols.length}, minmax(0, 1fr))` }

  let readout = `Cost blended ${MIX} to 1, input to output`
  if (hot) {
    const r = rows[hot.row]
    const m = cols[hot.col]
    const v = r.values[hot.col]
    const gap = Math.abs(v - r.best)
    readout = `${m.name} · ${r.label.toLowerCase()} ${r.show(v)} · ${v === r.best ? "best" : `${r.gap(gap)} behind ${r.leader}`}`
    if (r.id === "cost") readout += ` · (${MIX} × ${dollars(m.inputPrice)} + ${dollars(m.outputPrice)}) ÷ ${MIX + 1}`
  }

  return (
    <div
      className={cn("w-full max-w-[500px] tabular-nums", className)}
      role="group"
      aria-label={`${title}: ${cols.map((m) => m.name).join(", ")} compared on ${rows.map((r) => r.label.toLowerCase()).join(", ")}`}
    >
      <div className="grid items-end gap-x-4 pb-2.5" style={template}>
        {/* the corner over the measure names stays empty: the column heads already say these are models */}
        <span aria-hidden />
        {cols.map((m, c) => (
          <span
            key={m.name}
            className="min-w-0 transition-opacity duration-200 motion-reduce:transition-none"
            style={{ opacity: hot && hot.col !== c ? 0.45 : 1 }}
          >
            <span className="block truncate text-[12px] font-medium text-foreground/90">
              <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: MODEL_HUES[c] }} />
              {m.name}
            </span>
            <span className="block text-[10px] text-foreground/45">
              best on {wins[c]} of {rows.length}
            </span>
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-0.5" onPointerLeave={() => setHot(null)}>
        {rows.map((r, ri) => (
          <div key={r.id} className="grid items-center gap-x-4" style={template}>
            <span
              className="transition-opacity duration-200 motion-reduce:transition-none"
              style={{ opacity: hot && hot.row !== ri ? 0.45 : 1 }}
            >
              <span className="block text-[11.5px] text-foreground/70">{r.label}</span>
              <span className="block text-[9.5px] text-foreground/35">{r.unit}</span>
            </span>

            {r.values.map((v, c) => {
              const best = v === r.best
              const on = hot?.row === ri && hot.col === c
              const dim = hot !== null && hot.row !== ri && hot.col !== c
              const len = r.more ? v / (r.best || 1) : r.best / (v || 1)
              return (
                <button
                  key={cols[c].name}
                  type="button"
                  aria-label={`${cols[c].name}, ${r.label.toLowerCase()} ${r.show(v)} ${r.unit}${best ? ", best" : ""}`}
                  aria-pressed={on}
                  onPointerEnter={() => setHot({ row: ri, col: c })}
                  onFocus={() => setHot({ row: ri, col: c })}
                  onBlur={() => setHot(null)}
                  onClick={() => setHot({ row: ri, col: c })}
                  className="-mx-2 rounded-[4px] px-2 py-2 text-left outline-none transition-[opacity,background-color,transform,translate,scale,rotate] duration-200 hover:bg-foreground/[0.03] active:scale-[0.97] focus-visible:bg-foreground/[0.06] motion-reduce:transition-none"
                  style={{ opacity: dim ? 0.35 : 1 }}
                >
                  <span className={cn("block text-[12.5px]", best ? "font-semibold text-foreground/90" : "text-foreground/45")}>
                    {r.show(v)}
                  </span>
                  <span aria-hidden className="mt-1.5 block h-[2px] w-full rounded-full bg-foreground/[0.06]">
                    <motion.span
                      className="block h-full origin-left rounded-full"
                      style={{
                        width: `${Math.max(0.03, Math.min(1, len)) * 100}%`,
                        background: `color-mix(in srgb, ${MODEL_HUES[c]} ${on || best ? 100 : 40}%, transparent)`,
                        transition: reduced ? "none" : "background 160ms",
                      }}
                      initial={reduced ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: ri * 0.035 + c * 0.02 }}
                    />
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div role="status" className="mt-2.5 text-[10.5px] text-foreground/45">
        {/* the line swaps in place as the pointer moves (text swap: 4px, 2px blur, 150ms) from a
            dimmed copy, so it never blinks out; reduced motion keeps the fade */}
        <motion.span
          key={readout}
          className="inline-block"
          initial={reduced ? { opacity: 0.4 } : { opacity: 0.4, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          {readout}
        </motion.span>
      </div>
    </div>
  )
}
