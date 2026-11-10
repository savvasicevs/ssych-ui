// provenance: original
"use client"

import { useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { ChartCard } from "@/components/ui/chart-overlay"
import { GLIDE as HEAD_GLIDE, THUMB } from "@/components/ui/control-classes"

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
   2026-10-02 round 2: column heads gained a mark slot, `renderIcon(name, size, model)`, with
   an optional `maker` field on each model for it to read.
   2026-11-07: the defaults are three invented models (Atlas 3, Kestrel 2 Pro, Fable Mini) with
   no marks and a quiet "Sample data" line under the table; `renderIcon` is opt-in. The blend on the defaults: Atlas 3 (3 × $5.00 + $25.00) ÷ 4 = $10.00,
   Kestrel 2 Pro (3 × $1.25 + $10.00) ÷ 4 = $3.44, Fable Mini (3 × $2.00 + $12.00) ÷ 4 = $4.50.
   2026-11-10, `referable` (off unless asked for): a column head is a button. Pressing it
   makes that model the reference: every other model's cell then carries its gap to it beside
   the value, and the card and the cell's spoken name say ahead of it or behind it. Pressing
   the head again, or Escape, goes back to comparing with the best of each row.
   · gap to the reference = value − the reference's value on that measure, drawn with its sign
     (Kestrel 2 Pro against Atlas 3 on quality: 90.6 − 92.4 = −1.8)
   · ahead = the gap is above 0 where more is better, below 0 where less is better; behind is
     the other way; "same" when the gap prints as zero
   · ink of a gap: /90 ahead, /45 behind, /30 the same
   The bars and the full-ink best of a row stay measured against the best, so only the
   figures and the words change and nothing else moves. Motion: the head's pill glides
   between heads on the shared control spring (440/34) and fades in and out (150ms, 100ms);
   each gap swaps in place (4px, 2px blur, 150ms) and leaves in 100ms. Reduced motion: no
   glide and no travel, the pill and the figures fade. A cell narrower than 100px keeps its
   gap for the card. */

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
  /** whose model it is, handed to your renderIcon */
  maker?: string
}

export interface ModelComparisonProps {
  /** two to four models; more than four are cut to the first four */
  models?: ComparedModel[]
  /** the table's screen-reader name; the model names head the columns, so nothing is drawn */
  title?: string
  /** draws a model's mark beside its column head; none by default */
  renderIcon?: ((name: string, size: number, model: ComparedModel) => ReactNode) | null
  /** the quiet line under the table; "" hides it (pass your own for real benchmarks) */
  note?: string
  /** a column head can be pressed to make its model the reference the others are read against;
   *  pressing it again, or Escape, goes back to the best of each row. Off left out */
  referable?: boolean
  className?: string
}

const DEFAULT_MODELS: ComparedModel[] = [
  { name: "Atlas 3", quality: 92.4, latency: 1.9, inputPrice: 5, outputPrice: 25, context: 1000000 },
  { name: "Kestrel 2 Pro", quality: 90.6, latency: 2.4, inputPrice: 1.25, outputPrice: 10, context: 400000 },
  { name: "Fable Mini", quality: 91.3, latency: 1.4, inputPrice: 2, outputPrice: 12, context: 1000000 },
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
export function ModelComparison({
  models = DEFAULT_MODELS,
  title = "Models",
  renderIcon = null,
  note = "Sample data: models and scores are invented.",
  referable = false,
  className,
}: ModelComparisonProps) {
  const reduced = useReducedMotion()
  const boxRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [pin, setPin] = useState<Cell | null>(null)
  const [boxes, setBoxes] = useState<Record<string, Box>>({})
  /** the pressed column head; null compares with the best of each row */
  const [against, setAgainst] = useState<number | null>(null)
  const hot = hover ?? pin
  const cols = models.slice(0, 4)
  /* the reference's column, while there is one */
  const base = referable && against !== null && against < cols.length ? against : null
  /** a cell's gap to the reference: value − the reference's value on that measure; `flat`
   *  when it prints as zero, `ahead` when it is on the better side of the measure */
  const gapTo = (row: { more: boolean; values: number[]; show: (v: number) => string; gap: (v: number) => string }, col: number) => {
    if (base === null || col === base) return null
    const d = row.values[col] - row.values[base]
    const flat = row.show(Math.abs(d)) === row.show(0)
    return { flat, ahead: !flat && (row.more ? d > 0 : d < 0), size: row.gap(Math.abs(d)), signed: flat ? "same" : `${d > 0 ? "+" : "−"}${row.show(Math.abs(d))}` }
  }

  const rows = MEASURES.map((ms) => {
    const values = cols.map(ms.get)
    const best = ms.more ? Math.max(...values) : Math.min(...values)
    return { ...ms, values, best, leader: cols[values.indexOf(best)]?.name ?? "" }
  })

  const template = { gridTemplateColumns: `96px repeat(${cols.length}, minmax(0, 1fr))` }
  const key = (c: Cell) => `${c.row}-${c.col}`
  /* each cell reports where it sits once it is pointed at, so the glide fill and the card
     can find it without measuring the whole table */
  const place = (c: Cell, el: HTMLElement) => {
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
  /* the pointed cell against the reference, for the card */
  const versus = hot && r ? gapTo(r, hot.col) : null

  return (
    <div
      ref={boxRef}
      className={cn("relative w-[440px] max-w-full tabular-nums", className)}
      role="table"
      aria-label={`${title}: ${cols.map((x) => x.name).join(", ")} compared on ${rows.map((x) => x.id).join(", ")}`}
      onPointerLeave={() => setHover(null)}
      onKeyDown={
        referable
          ? (e) => {
              if (e.key === "Escape" && base !== null) setAgainst(null)
            }
          : undefined
      }
    >
      {/* one glide fill for the pointed row and one for its column: they light together, fade
          up where the pointer comes in and fade out when it leaves the table */}
      <AnimatePresence>
        {box && (
          <motion.span
            key="row"
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 bg-foreground/[0.04]"
            /* the glide is a layout animation (transform), the corner a style so it stays round */
            layout={!reduced}
            style={{ top: box.top, height: box.height, borderRadius: 9 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.15, ease: EASE } }}
            transition={reduced ? { duration: 0 } : { layout: GLIDE, opacity: { duration: 0.15, ease: EASE } }}
          />
        )}
        {box && (
          <motion.span
            key="col"
            aria-hidden
            className="pointer-events-none absolute top-0 bg-foreground/[0.04]"
            layout={!reduced}
            style={{ left: box.left, width: box.width, height: totalH, borderRadius: 9 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.15, ease: EASE } }}
            transition={reduced ? { duration: 0 } : { layout: GLIDE, opacity: { duration: 0.15, ease: EASE } }}
          />
        )}
      </AnimatePresence>

      <div role="row" className="relative grid h-8 items-center gap-x-2 border-b border-foreground/[0.04]" style={template}>
        {/* the corner over the measure names stays empty: the column heads already say these are models */}
        <span role="columnheader" aria-label="Measure" />
        {/* the reference's pill: one fill that sits in the pressed head's column and glides to the
            next one pressed. 24px high, so its corner is 9 (37.5% of the height), set as a style
            so it stays round while it glides */}
        <AnimatePresence initial={false}>
          {base !== null && (
            <motion.span
              key="against"
              aria-hidden
              data-reference
              className={cn("pointer-events-none h-6", THUMB)}
              layout={!reduced}
              style={{ gridColumn: base + 2, gridRow: 1, borderRadius: 9 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={reduced ? { duration: 0.15 } : { layout: HEAD_GLIDE, opacity: { duration: 0.15, ease: EASE } }}
            />
          )}
        </AnimatePresence>
        {cols.map((x, c) =>
          referable ? (
            <span key={x.name} role="columnheader" className="flex min-w-0" style={{ gridColumn: c + 2, gridRow: 1 }} title={x.name}>
              <button
                type="button"
                aria-pressed={base === c}
                aria-label={base === c ? `${x.name}, the reference. Press to compare with the best again` : `${x.name}. Press to compare the other models with it`}
                onClick={() => setAgainst((a) => (a === c ? null : c))}
                className={cn(
                  "relative flex h-6 w-full min-w-0 items-center gap-1.5 rounded-[9px] px-2 text-left text-[10.5px] outline-none transition-[color,background-color,scale] duration-150 hover:text-foreground/90 focus-visible:text-foreground/90 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
                  base === c ? "text-foreground/90" : cn("hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04]", hot?.col === c ? "text-foreground/90" : "text-foreground/45"),
                )}
              >
                {renderIcon?.(x.name, 12, x)}
                <span className="min-w-0 truncate">{x.name}</span>
              </button>
            </span>
          ) : (
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
          ),
        )}
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
            const gap = gapTo(row, c)
            const ref = base === null ? "" : cols[base].name
            return (
              <span key={cols[c].name} role="cell" className={cn("min-w-0", referable && "@container")}>
              <button
                type="button"
                aria-label={
                  gap
                    ? `${cols[c].name}, ${row.id} ${row.show(val)} ${row.unit}${best ? ", best" : ""}, ${gap.flat ? `the same as ${ref}` : `${gap.size} ${gap.ahead ? "ahead of" : "behind"} ${ref}`}`
                    : `${cols[c].name}, ${row.id} ${row.show(val)} ${row.unit}${best ? ", best" : `, ${row.gap(Math.abs(val - row.best))} behind ${row.leader}`}`
                }
                aria-pressed={pinned}
                onPointerEnter={(e) => {
                  place({ row: ri, col: c }, e.currentTarget)
                  setHover({ row: ri, col: c })
                }}
                onFocus={(e) => {
                  place({ row: ri, col: c }, e.currentTarget)
                  setHover({ row: ri, col: c })
                }}
                onBlur={() => setHover(null)}
                onClick={() => setPin((p) => (p && p.row === ri && p.col === c ? null : { row: ri, col: c }))}
                className="block w-full rounded-[17.5px] px-2 py-2.5 text-left outline-none transition-[scale] duration-150 focus-visible:bg-foreground/[0.04] active:scale-[0.97] motion-reduce:active:scale-100"
              >
                <span className="flex items-baseline justify-between gap-1.5">
                  <span className={cn("block text-[12.5px]", best ? "font-medium text-foreground/90" : "text-foreground/60")}>{row.show(val)}</span>
                  {/* the gap to the reference, beside the value: it swaps in place when the reference
                      changes and leaves, quicker, when there is none. Kept out of a cell with no room */}
                  <AnimatePresence initial={false}>
                    {gap && (
                      <motion.span
                        key="gap"
                        aria-hidden
                        data-gap
                        className="hidden whitespace-nowrap text-[10.5px] @[100px]:block"
                        initial={false}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.1 } }}
                      >
                        <motion.span
                          key={base}
                          className={cn("block", gap.flat ? "text-foreground/30" : gap.ahead ? "text-foreground/90" : "text-foreground/45")}
                          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
                          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                          transition={{ duration: 0.15, ease: EASE }}
                        >
                          {gap.signed}
                        </motion.span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span aria-hidden className="mt-1.5 block h-[2px] w-full rounded-[1px] bg-foreground/[0.06]">
                  <motion.span
                    className="block h-full origin-left rounded-[1px]"
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
        /* 28px wider when a reference can be picked, so "Ahead of reference" and its figure keep one line */
        width={referable ? 184 : 156}
        heading={m?.name ?? ""}
        rows={
          r && m
            ? [
                { label: r.id === "cost" ? "Cost per 1M" : r.label.split(",")[0], value: r.show(v) },
                versus
                  ? { label: versus.flat ? "Against reference" : versus.ahead ? "Ahead of reference" : "Behind reference", value: versus.flat ? "Same" : versus.size }
                  : { label: "Behind best", value: isBest ? "Best" : r.gap(Math.abs(v - r.best)) },
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
      {note && <p className="pt-3 text-[10px] text-foreground/45">{note}</p>}
    </div>
  )
}
