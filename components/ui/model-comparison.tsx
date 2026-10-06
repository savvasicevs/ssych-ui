"use client"

import { useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { ChartCard } from "@/components/ui/chart-overlay"
import { ModelMark, modelMaker, type ModelMaker } from "@/components/ui/model-comparison-marks"

/* Model Comparison, written new through ssych-component (2026-09-29).
   What it is for: choosing between two to four models on the same four measures.
   Read first: the full-ink value in each row. It is the best one on that measure; the
   others step back to /60 with their bars at /25.
   The pointer: pointing at a value lights its row and its column with one glide fill and
   opens a card beside it (the model, the value, how far behind the best, and on the cost
   row the blend). A click pins the cell; a second click lets it go.
   Colour: none. The columns are already apart in space, so every bar is ink.
   Reference: browsable "model comparison" (descriptions only, no source read). Idea taken:
   the winner of a row is shown by strength and the others are dimmed, with no badge.
   Formulas:
   · blended cost per million = (3 × input price + output price) / 4, a 3 to 1 mix of input
     to output tokens                                        (3 × $3.00 + $15.00) / 4 = $6.00
   · best of a row = the highest value where more is better (quality, context), the lowest
     where less is better (latency, cost); equal values share it
   · bar length = value / best where more is better, best / value where less is better
   · gap = value − best, shown without its sign and named "behind"
   The values are sample values, not published figures.
   2026-10-02 audit: redesigned as a plain table on his note about the dots. The coloured dot
   by each name and the per-model hues are gone (the columns are apart in space, so the bars
   are ink: the best of a row full ink, the rest /25, the pointed one full); the "best on"
   line under each name is cut; model names are table heads at 10.5px /45 (the pointed one
   /90); the unit moved into the measure label at 11px /60; the explainer line under the grid
   is gone, the blend formula now sits in the Cost label's tooltip and in the cost card;
   pointing lights the row and the column together with one glide fill and opens a ChartCard
   by the cell; a click pins the cell. Width 440, the AI and operations list width.
   2026-10-02 round 2: his note asked for real icons for the actual models. The default models
   are one from each maker now, Claude Opus 5.5, GPT-5 and Gemini 3 Pro, with plausible
   figures (sample values still, not published ones), and each column head carries its
   maker's mark at 12px beside the name. The marks are the Claude, OpenAI and Google Gemini
   marks from Simple Icons (CC0), drawn inline in model-comparison-marks.tsx. They come in
   through a `renderIcon(name, size, model)` prop whose default draws these marks (the maker
   is read from the name, or from the new optional `maker` field); pass your own to draw
   other marks, or null for none. The blend on the defaults: Claude (3 × $5.00 + $25.00) ÷ 4
   = $10.00, GPT-5 (3 × $1.25 + $10.00) ÷ 4 = $3.44, Gemini (3 × $2.00 + $12.00) ÷ 4 = $4.50. */

const EASE = [0.16, 1, 0.3, 1] as const
const GLIDE = { type: "spring", stiffness: 520, damping: 40 } as const
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
  /** whose model it is, for its mark; read from the name when absent */
  maker?: ModelMaker
}

export interface ModelComparisonProps {
  /** two to four models; more than four are cut to the first four */
  models?: ComparedModel[]
  /** the table's screen-reader name; the model names head the columns, so nothing is drawn */
  title?: string
  /** draws a model's mark beside its column head; the Claude, OpenAI and Gemini marks by
   *  default, null for none */
  renderIcon?: ((name: string, size: number, model: ComparedModel) => ReactNode) | null
  className?: string
}

const defaultIcon = (name: string, size: number, model: ComparedModel) => <ModelMark maker={model.maker ?? modelMaker(name)} size={size} />

const DEFAULT_MODELS: ComparedModel[] = [
  { name: "Claude Opus 5.5", maker: "anthropic", quality: 92.4, latency: 1.9, inputPrice: 5, outputPrice: 25, context: 1000000 },
  { name: "GPT-5", maker: "openai", quality: 90.6, latency: 2.4, inputPrice: 1.25, outputPrice: 10, context: 400000 },
  { name: "Gemini 3 Pro", maker: "google", quality: 91.3, latency: 1.4, inputPrice: 2, outputPrice: 12, context: 1000000 },
]

const blended = (m: ComparedModel) => (MIX * m.inputPrice + m.outputPrice) / (MIX + 1)
const dollars = (v: number) => `$${v.toFixed(2)}`
const tokens = (v: number) => (v >= 1e6 ? `${Number((v / 1e6).toFixed(1))}M` : `${Math.round(v / 1e3)}K`)
const BLEND = `Blended ${MIX} to 1, input to output: (${MIX} × input + output) ÷ ${MIX + 1}`

interface Measure {
  id: string
  /** the label with its unit, as drawn */
  label: string
  /** the unit as read aloud */
  unit: string
  more: boolean
  get: (m: ComparedModel) => number
  show: (v: number) => string
  gap: (v: number) => string
}

const MEASURES: Measure[] = [
  { id: "quality", label: "Quality, of 100", unit: "score of 100", more: true, get: (m) => m.quality, show: (v) => v.toFixed(1), gap: (v) => `${v.toFixed(1)} pts` },
  { id: "latency", label: "Latency, s", unit: "seconds to first token", more: false, get: (m) => m.latency, show: (v) => `${v.toFixed(1)} s`, gap: (v) => `${v.toFixed(1)} s` },
  { id: "cost", label: "Cost per 1M", unit: "per million tokens", more: false, get: blended, show: dollars, gap: dollars },
  { id: "context", label: "Context", unit: "tokens", more: true, get: (m) => m.context, show: tokens, gap: tokens },
]

type Cell = { row: number; col: number }
type Box = { left: number; top: number; width: number; height: number }

/**
 * Models side by side as a plain table: one column per model, one row per measure, a value
 * over a 2px ink bar in every cell. The best value of a row is full ink, the rest step back,
 * so the winner of each measure reads without a legend or a colour.
 */
export function ModelComparison({ models = DEFAULT_MODELS, title = "Models", renderIcon = defaultIcon, className }: ModelComparisonProps) {
  const reduced = useReducedMotion()
  const boxRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [pin, setPin] = useState<Cell | null>(null)
  const [boxes, setBoxes] = useState<Record<string, Box>>({})
  const hot = hover ?? pin
  const cols = models.slice(0, 4)

  const rows = MEASURES.map((ms) => {
    const values = cols.map(ms.get)
    const best = ms.more ? Math.max(...values) : Math.min(...values)
    return { ...ms, values, best, leader: cols[values.indexOf(best)]?.name ?? "" }
  })

  const template = { gridTemplateColumns: `96px repeat(${cols.length}, minmax(0, 1fr))` }
  const key = (c: Cell) => `${c.row}-${c.col}`
  /* each cell reports where it sits once it is pointed at, so the glide fill and the card
     can find it without measuring the whole table */
  const note = (c: Cell, el: HTMLElement) => {
    const table = boxRef.current
    const root = table?.getBoundingClientRect()
    const own = el.getBoundingClientRect()
    if (!table || !root) return
    /* the drawn box is in screen pixels, which a scaled preview shrinks; the fills are laid out in
       the table's own pixels, so the offset is turned back by that scale (2026-10-02: in a scaled
       card the row and column fills landed off their cells) */
    const k = root.width / (table.offsetWidth || root.width) || 1
    const b = { left: (own.left - root.left) / k, top: (own.top - root.top) / k, width: el.offsetWidth, height: el.offsetHeight }
    setBoxes((all) => (all[key(c)]?.left === b.left && all[key(c)]?.top === b.top ? all : { ...all, [key(c)]: b }))
  }
  const box = hot ? boxes[key(hot)] : undefined
  const full = boxRef.current
  const totalW = full?.offsetWidth ?? 440
  const totalH = full?.offsetHeight ?? 0
  const flip = box ? box.left + box.width / 2 > totalW * 0.6 : false

  const r = hot ? rows[hot.row] : undefined
  const m = hot ? cols[hot.col] : undefined
  const v = hot && r ? r.values[hot.col] : 0
  const isBest = r ? v === r.best : false

  return (
    <div
      ref={boxRef}
      className={cn("relative w-[440px] max-w-full tabular-nums", className)}
      role="table"
      aria-label={`${title}: ${cols.map((x) => x.name).join(", ")} compared on ${rows.map((x) => x.id).join(", ")}`}
      onPointerLeave={() => setHover(null)}
    >
      {/* one glide fill for the pointed row and one for its column: they light together */}
      {box && (
        <>
          <motion.span
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 rounded-[12px] bg-foreground/[0.04]"
            initial={false}
            animate={{ top: box.top, height: box.height }}
            transition={reduced ? { duration: 0 } : GLIDE}
          />
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-0 rounded-[12px] bg-foreground/[0.04]"
            initial={false}
            animate={{ left: box.left, width: box.width, height: totalH }}
            transition={reduced ? { duration: 0 } : GLIDE}
          />
        </>
      )}

      <div role="row" className="relative grid h-8 items-center gap-x-2 border-b border-foreground/[0.04]" style={template}>
        {/* the corner over the measure names stays empty: the column heads already say these are models */}
        <span role="columnheader" aria-label="Measure" />
        {cols.map((x, c) => (
          <span
            key={x.name}
            role="columnheader"
            className={cn(
              "flex min-w-0 items-center gap-1.5 px-2 text-[10.5px] transition-colors duration-200 motion-reduce:transition-none",
              hot?.col === c ? "text-foreground/90" : "text-foreground/45",
            )}
            title={x.name}
          >
            {renderIcon?.(x.name, 12, x)}
            <span className="min-w-0 truncate">{x.name}</span>
          </span>
        ))}
      </div>

      {rows.map((row, ri) => (
        <div key={row.id} role="row" className="relative grid items-center gap-x-2" style={template}>
          <span
            role="rowheader"
            className={cn("pl-2 text-[11px] transition-colors duration-200 motion-reduce:transition-none", hot?.row === ri ? "text-foreground/90" : "text-foreground/60")}
            title={row.id === "cost" ? BLEND : undefined}
          >
            {row.label}
          </span>

          {row.values.map((val, c) => {
            const best = val === row.best
            const on = hot?.row === ri && hot.col === c
            const pinned = pin?.row === ri && pin.col === c
            const len = row.more ? val / (row.best || 1) : row.best / (val || 1)
            return (
              <span key={cols[c].name} role="cell" className="min-w-0">
              <button
                type="button"
                aria-label={`${cols[c].name}, ${row.id} ${row.show(val)} ${row.unit}${best ? ", best" : `, ${row.gap(Math.abs(val - row.best))} behind ${row.leader}`}`}
                aria-pressed={pinned}
                onPointerEnter={(e) => {
                  note({ row: ri, col: c }, e.currentTarget)
                  setHover({ row: ri, col: c })
                }}
                onFocus={(e) => {
                  note({ row: ri, col: c }, e.currentTarget)
                  setHover({ row: ri, col: c })
                }}
                onBlur={() => setHover(null)}
                onClick={() => setPin((p) => (p && p.row === ri && p.col === c ? null : { row: ri, col: c }))}
                className="block w-full rounded-[12px] px-2 py-2.5 text-left outline-none transition-[scale] duration-150 focus-visible:bg-foreground/[0.04] active:scale-[0.97] motion-reduce:active:scale-100"
              >
                <span className={cn("block text-[12.5px]", best ? "font-medium text-foreground/90" : "text-foreground/60")}>{row.show(val)}</span>
                <span aria-hidden className="mt-1.5 block h-[2px] w-full rounded-full bg-foreground/[0.06]">
                  <motion.span
                    className="block h-full origin-left rounded-full"
                    style={{
                      width: `${Math.max(0.03, Math.min(1, len)) * 100}%`,
                      background: `color-mix(in srgb, var(--foreground) ${on || best ? 90 : 25}%, transparent)`,
                      transition: reduced ? "none" : "background 160ms",
                    }}
                    initial={reduced ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE, delay: ri * 0.035 + c * 0.02 }}
                  />
                </span>
              </button>
              </span>
            )
          })}
        </div>
      ))}

      {/* the pointed cell reads out in the library popover beside it (spec 13.5, 14.6) */}
      <ChartCard
        open={!!(hot && box && r && m)}
        x={box ? (flip ? box.left : box.left + box.width - 12) : 0}
        y={box ? box.top : 0}
        flip={flip}
        width={156}
        heading={m?.name ?? ""}
        rows={
          r && m
            ? [
                { label: r.id === "cost" ? "Cost per 1M" : r.label.split(",")[0], value: r.show(v) },
                { label: "Behind best", value: isBest ? "Best" : r.gap(Math.abs(v - r.best)) },
                ...(r.id === "cost"
                  ? [
                      { label: "Input", value: dollars(m.inputPrice) },
                      { label: "Output", value: dollars(m.outputPrice) },
                    ]
                  : []),
              ]
            : []
        }
        footer={
          r?.id === "cost" && m ? (
            <span className="text-foreground/60">
              ({MIX} × {dollars(m.inputPrice)} + {dollars(m.outputPrice)}) ÷ {MIX + 1}
            </span>
          ) : undefined
        }
      />
    </div>
  )
}
