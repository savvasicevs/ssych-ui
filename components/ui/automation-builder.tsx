"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, Reorder, useDragControls, useReducedMotion } from "motion/react"
import { GripVertical, Redo2, Undo2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { BUTTON, BUTTON_PRIMARY, ICON_BUTTON, RAISED, SURFACE } from "@/components/ui/control-classes"

/* Automation Builder, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: a trading rule written as sentences. Muted words join filled values;
   the values are the only things that change.
   Read first: the values, the filled pills. The words between them step back.
   The pointer: press a value and its choices open in its place, in the row, with the
   chosen one filled; press one to take it. Point at a row and the others dim and its
   handle shows; drag the handle, or focus it and use the up and down arrows, to move the
   row. "Add action" opens the kinds of step in place. "Run simulation" walks the rows
   from the top and the line above the buttons reads what would have happened. Undo and
   redo walk every change. Escape closes whatever is open.
   Lab sketch: src/components/lab/AutomationBuilder.tsx. Kept: the program model (words,
   values, line breaks, one level of indent), reorder by handle, add action, the sweep,
   the derived result, the history stack. Changed: no sheet, outline, drop shadows, green
   bloom or pulse ring; the floating menus are gone, choices open in the row; type is 10.5
   to 11.5px, it was up to 19px; the icon in a well per row is the row's number, because the
   order is what a program is; the step's `icon` field is named `kind`. The sample's
   description contradicted its rule ("buy if it's no good sentiment") and the limit
   price sat far from the ticker's price; both are fixed.
   Smaller (2026-10-01): 400px wide, was 460; values are 20px pills, were 24; rows sit
   6px apart, were 10; the number disc is 16px, was 18; the buttons are 24px, were 28.
   Formulas:
   · steps executed = count of rows
   · orders placed  = 1 when there is an order row and every condition row holds, else 0
   · a condition holds when ("is" chosen) equals ("Good" chosen)
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit: Clear is gone (he found the foot too complicated, and Undo covers it),
   so the foot holds Add action, Undo, Redo and Run. Undo and Redo are 28px icon buttons
   with a tip, Add action is the library's 28px secondary button, Run is the library primary
   at 28px with a fixed width so Run simulation, Running and Run again swap in place without
   resizing it. Values and their choices are 24px pills (they were 20 and 18, under the 24px
   touch target). The rule now sits in one surface card (24px corners, 12px inset); the open
   choices and a dragged row sit on the raised step, with corners nested to their contents
   (choices 14 = 12 + 2, the drag ground 12 = 24 − 12). The status line's hairline is the 4%
   one. */

const EASE = [0.16, 1, 0.3, 1] as const
/** how long the sweep rests on a row, in ms */
const BEAT = 350
/** the gap between two rows, in px; the thread bridges it */
const GAP = 6
const INDENT = 18

export type ChipRole = "ticker" | "price" | "sentiment" | "comparator"

export type StepToken = { kind: "word" | "chip"; text: string; options?: string[]; role?: ChipRole } | { kind: "break" }

export type StepKind = "schedule" | "fetch" | "summarize" | "classify" | "branch" | "order" | "notify"

export interface Step {
  kind: StepKind
  tokens: StepToken[]
  /** 1 sits the row inside the condition above it */
  indent?: number
}

export interface AutomationBuilderProps {
  /** the rule's name, read out to screen readers; the rows say what it does */
  title?: string
  steps?: Step[]
  onRun?: () => void
  className?: string
}

const TICKERS = ["TSLA", "AAPL", "NVDA", "AMZN"]

const FETCH: Step = {
  kind: "fetch",
  tokens: [
    { kind: "word", text: "Get" },
    { kind: "chip", text: "News", options: ["News", "Price", "Filings"] },
    { kind: "word", text: "from" },
    { kind: "chip", text: "TSLA", options: TICKERS, role: "ticker" },
  ],
}
const SUMMARIZE: Step = {
  kind: "summarize",
  tokens: [
    { kind: "word", text: "Summarize" },
    { kind: "chip", text: "TSLA news", options: ["TSLA news", "Full articles"] },
  ],
}
const CLASSIFY: Step = {
  kind: "classify",
  tokens: [
    { kind: "word", text: "Score the sentiment of" },
    { kind: "chip", text: "Summary", options: ["Summary", "Headlines"] },
  ],
}
const BRANCH: Step = {
  kind: "branch",
  tokens: [
    { kind: "word", text: "If" },
    { kind: "chip", text: "Sentiment", options: ["Sentiment", "Price"] },
    { kind: "chip", text: "is", options: ["is", "is not"], role: "comparator" },
    { kind: "chip", text: "Good", options: ["Good", "Bad", "Neutral"], role: "sentiment" },
  ],
}
const ORDER: Step = {
  kind: "order",
  tokens: [
    { kind: "chip", text: "Confirm", options: ["Confirm", "Auto"] },
    { kind: "word", text: "buy" },
    { kind: "chip", text: "TSLA", options: TICKERS, role: "ticker" },
    { kind: "break" },
    { kind: "word", text: "at" },
    { kind: "chip", text: "Market avg", options: ["Market avg", "Limit $240", "Open price"], role: "price" },
  ],
}
const NOTIFY: Step = {
  kind: "notify",
  tokens: [
    { kind: "word", text: "Notify" },
    { kind: "chip", text: "Me", options: ["Me", "Team"] },
    { kind: "word", text: "by" },
    { kind: "chip", text: "Email", options: ["Email", "Push", "SMS"] },
  ],
}

const DEFAULT_STEPS: Step[] = [
  {
    kind: "schedule",
    tokens: [
      { kind: "word", text: "Run" },
      { kind: "chip", text: "Every month", options: ["Every month", "Every week", "Every day"] },
      { kind: "chip", text: "on the 1st", options: ["on the 1st", "on the 15th", "on the last day"] },
    ],
  },
  FETCH,
  SUMMARIZE,
  CLASSIFY,
  BRANCH,
  { ...ORDER, indent: 1 },
  { kind: "branch", tokens: [{ kind: "word", text: "End if" }] },
]

/** the kinds of step "Add action" offers */
const TEMPLATES: { label: string; step: Step }[] = [
  { label: "Get data", step: FETCH },
  { label: "Summarize", step: SUMMARIZE },
  { label: "Sentiment", step: CLASSIFY },
  { label: "If condition", step: BRANCH },
  { label: "Buy order", step: ORDER },
  { label: "Notify", step: NOTIFY },
]

/* the program as it runs */

type ChipTok = { kind: "chip"; id: string; value: string; options: string[]; role?: ChipRole }
type Token = { kind: "word"; text: string } | { kind: "break" } | ChipTok
type Row = { id: string; kind: StepKind; indent: number; tokens: Token[] }

let made = 0
const uid = () => `ab${++made}`

const roleOf = (options: string[]): ChipRole | undefined =>
  options.includes("TSLA") ? "ticker" : options.includes("Market avg") ? "price" : options.includes("Good") ? "sentiment" : options.includes("is") ? "comparator" : undefined

const toRow = (step: Step): Row => ({
  id: uid(),
  kind: step.kind,
  indent: step.indent ?? 0,
  tokens: step.tokens.map((t): Token => {
    if (t.kind === "break") return { kind: "break" }
    if (t.kind === "word") return { kind: "word", text: t.text }
    const options = t.options?.includes(t.text) ? t.options : [t.text, ...(t.options ?? [])]
    return { kind: "chip", id: uid(), value: t.text, options, role: t.role ?? roleOf(options) }
  }),
})

const chipsOf = (r: Row) => r.tokens.filter((t): t is ChipTok => t.kind === "chip")

/** what the run would have done, read straight off the rows */
function outcome(rows: Row[]): string {
  const steps = `${rows.length} step${rows.length === 1 ? "" : "s"} executed`
  const order = rows.find((r) => r.kind === "order")
  if (!order) return `${steps} · 0 orders placed`
  let met = true
  for (const r of rows) {
    if (r.kind !== "branch") continue
    const sentiment = chipsOf(r).find((c) => c.role === "sentiment")
    const comparator = chipsOf(r).find((c) => c.role === "comparator")
    if (sentiment && comparator) met = (comparator.value === "is") === (sentiment.value === "Good")
  }
  if (!met) return `${steps} · 0 orders placed, the condition did not hold`
  const ticker = chipsOf(order).find((c) => c.role === "ticker")?.value ?? "TSLA"
  const price = chipsOf(order).find((c) => c.role === "price")?.value ?? "Market avg"
  return `${steps} · 1 order placed, ${ticker} at ${price.toLowerCase()}`
}

/** closes what is open on a press outside it, or on Escape */
function useDismiss(ref: React.RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("pointerdown", down)
    window.addEventListener("keydown", key)
    return () => {
      document.removeEventListener("pointerdown", down)
      window.removeEventListener("keydown", key)
    }
  }, [ref, active, onClose])
}

const PILL = "h-6 rounded-full px-2.5 text-[11px] font-medium whitespace-nowrap outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 motion-reduce:transition-none"
const OPTION = "h-6 rounded-full px-2.5 text-[11px] whitespace-nowrap outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 active:scale-[0.97] motion-reduce:transition-none"
/** a tip over an icon button: up on hover or keyboard focus, after a short wait */
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] text-foreground/90 opacity-0 transition-opacity duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100 group-hover/tip:delay-300",
          RAISED,
        )}
      >
        {label}
      </span>
    </span>
  )
}
/** the buy side of an order reads green, and a placed order says so in green */
const GREEN = "var(--chart-up)"
/** choices open in place from the value they replace: 0.97 and opacity, from its left edge */
const OPEN_FROM = { opacity: 0, scale: 0.97 }
const OPEN_TO = { opacity: 1, scale: 1 }

/** a value; pressed, its choices take its place in the row */
function Chip({ chip, open, locked, onToggle, onClose, onSelect }: { chip: ChipTok; open: boolean; locked: boolean; onToggle: () => void; onClose: () => void; onSelect: (value: string) => void }) {
  const wrap = useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion()
  useDismiss(wrap, open, onClose)
  return (
    <span ref={wrap} className="inline-flex">
      {open ? (
        <motion.span
          role="radiogroup"
          aria-label={`Choices for ${chip.value}`}
          /* raised on the card: 12 (the 24px option pill) + 2 padding = 14 */
          className={cn("inline-flex flex-wrap items-center gap-0.5 rounded-[14px] p-0.5", RAISED)}
          style={{ transformOrigin: "left center" }}
          initial={reduced ? { opacity: 0 } : OPEN_FROM}
          animate={OPEN_TO}
          transition={{ duration: 0.25, ease: EASE }}
        >
          {chip.options.map((o) => {
            const on = o === chip.value
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={on}
                autoFocus={on}
                onClick={() => onSelect(o)}
                className={cn(OPTION, on ? "bg-foreground/[0.12] font-medium text-foreground/90" : "text-foreground/45 hover:text-foreground/90 focus-visible:text-foreground/90")}
              >
                {o}
              </button>
            )
          })}
        </motion.span>
      ) : (
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={false}
          disabled={locked}
          onClick={onToggle}
          className={cn(PILL, "bg-foreground/[0.08] text-foreground/90 hover:bg-foreground/[0.13] focus-visible:bg-foreground/[0.13] active:scale-[0.97]")}
        >
          {chip.value}
        </button>
      )}
    </span>
  )
}

function ProgramRow({
  row,
  index,
  count,
  enter,
  dim,
  locked,
  still,
  hideThread,
  openKey,
  setOpenKey,
  onSelect,
  onHot,
  onMove,
  onLift,
  onDrop,
}: {
  row: Row
  index: number
  count: number
  /** the entrance delay: rows stagger in 35ms apart on mount, and at once after */
  enter: number
  dim: boolean
  locked: boolean
  still: boolean
  /** true while a row is in flight: the thread states an order, so it leaves until the order settles */
  hideThread: boolean
  openKey: string | null
  setOpenKey: (key: string | null) => void
  onSelect: (rowId: string, chipId: string, value: string) => void
  onHot: (id: string | null) => void
  onMove: (id: string, by: number) => void
  onLift: () => void
  onDrop: () => void
}) {
  const controls = useDragControls()
  const [dragging, setDragging] = useState(false)
  const first = index === 0
  const last = index === count - 1
  const inset = row.indent > 0 ? INDENT : 0

  const lines: Token[][] = [[]]
  for (const t of row.tokens) {
    if (t.kind === "break") lines.push([])
    else lines[lines.length - 1].push(t)
  }
  const sentence = row.tokens.map((t) => (t.kind === "word" ? t.text : t.kind === "chip" ? t.value : "")).join(" ")

  return (
    <Reorder.Item
      as="div"
      role="listitem"
      aria-label={`Step ${index + 1}: ${sentence}`}
      value={row}
      dragListener={false}
      dragControls={controls}
      initial={still ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: dim ? 0.45 : 1, y: 0 }}
      transition={still ? { duration: 0 } : { duration: 0.2, ease: EASE, delay: enter }}
      onDragStart={() => {
        setDragging(true)
        onLift()
      }}
      onDragEnd={() => {
        setDragging(false)
        onDrop()
      }}
      onPointerEnter={() => onHot(row.id)}
      /* the drag ground, raised on the card: 24 (the card) − 12 (its inset) = 12 */
      className={cn("group relative flex items-start gap-2 rounded-[12px]", dragging && cn("z-10", RAISED))}
    >
      {/* the thread: one hairline from number to number; a row set inside a condition hangs off it */}
      {count > 1 && (
        <span
          aria-hidden
          className="absolute left-[7.5px] w-px bg-foreground/[0.08] transition-opacity duration-150 motion-reduce:transition-none"
          style={{ top: first ? 12 : 0, bottom: last ? undefined : -GAP, height: last ? 12 : undefined, opacity: hideThread ? 0 : 1 }}
        />
      )}
      {inset > 0 && (
        <span
          aria-hidden
          className="absolute left-[7.5px] top-[11.5px] h-px bg-foreground/[0.08] transition-opacity duration-150 motion-reduce:transition-none"
          style={{ width: inset, opacity: hideThread ? 0 : 1 }}
        />
      )}

      <span
        aria-hidden
        className="relative mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-medium text-foreground/70"
        style={{ marginLeft: inset, background: "color-mix(in srgb, var(--foreground) 10%, var(--background))" }}
      >
        {index + 1}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {lines.map((line, li) => (
          <span key={li} className="flex min-h-6 flex-wrap items-center gap-x-1 gap-y-1">
            {line.map((t, ti) => {
              if (t.kind === "word")
                return (
                  <span key={ti} className="text-[11.5px] text-foreground/45" style={row.kind === "order" && t.text === "buy" ? { color: GREEN } : undefined}>
                    {t.text}
                  </span>
                )
              if (t.kind !== "chip") return null
              const key = `${row.id}:${t.id}`
              return (
                <Chip
                  key={t.id}
                  chip={t}
                  open={openKey === key}
                  locked={locked}
                  onToggle={() => setOpenKey(key)}
                  onClose={() => setOpenKey(null)}
                  onSelect={(value) => onSelect(row.id, t.id, value)}
                />
              )
            })}
          </span>
        ))}
      </span>

      <button
        type="button"
        aria-label={`Move step ${index + 1}, drag or use the up and down arrows`}
        disabled={locked}
        onFocus={() => onHot(row.id)}
        onBlur={() => onHot(null)}
        onPointerDown={(e) => {
          e.preventDefault()
          controls.start(e)
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
          e.preventDefault()
          onMove(row.id, e.key === "ArrowUp" ? -1 : 1)
        }}
        className={cn(
          "mt-1 grid h-4 w-4 shrink-0 touch-none place-items-center rounded-[4px] text-foreground/45 outline-none transition-opacity duration-150 focus-visible:bg-foreground/[0.06] focus-visible:opacity-100 disabled:pointer-events-none motion-reduce:transition-none",
          dragging ? "cursor-grabbing opacity-100" : "cursor-grab opacity-0 group-hover:opacity-100",
        )}
      >
        <GripVertical className="h-3 w-3" strokeWidth={1.8} aria-hidden />
      </button>
    </Reorder.Item>
  )
}

function AddAction({ open, locked, onToggle, onClose, onPick }: { open: boolean; locked: boolean; onToggle: () => void; onClose: () => void; onPick: (label: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  useDismiss(wrap, open, onClose)
  return (
    <div ref={wrap} className="mt-2 flex min-h-7 items-center">
      {open ? (
        <motion.div
          role="group"
          aria-label="Kinds of step"
          /* raised on the card: 12 (the 24px option pill) + 2 padding = 14 */
          className={cn("flex flex-wrap items-center gap-0.5 rounded-[14px] p-0.5", RAISED)}
          style={{ transformOrigin: "left center" }}
          initial={reduced ? { opacity: 0 } : OPEN_FROM}
          animate={OPEN_TO}
          transition={{ duration: 0.25, ease: EASE }}
        >
          {TEMPLATES.map((t, i) => (
            <button
              key={t.label}
              type="button"
              autoFocus={i === 0}
              onClick={() => onPick(t.label)}
              className={cn(OPTION, "text-foreground/70 hover:bg-foreground/[0.1] hover:text-foreground/90 focus-visible:bg-foreground/[0.1]")}
            >
              {t.label}
            </button>
          ))}
        </motion.div>
      ) : (
        <button type="button" aria-haspopup="true" aria-expanded={false} disabled={locked} onClick={onToggle} className={cn(BUTTON, "h-7 px-3 text-[11.5px]")}>
          Add action
        </button>
      )}
    </div>
  )
}

/**
 * A no-code trading rule as a short program of sentences. Values open their choices in
 * place, rows move by their handle, and a simulated run sweeps the rows and says what it
 * would have done.
 */
export function AutomationBuilder({
  title = "Buy TSLA on good sentiment",
  steps = DEFAULT_STEPS,
  onRun,
  className,
}: AutomationBuilderProps) {
  const reduced = useReducedMotion()
  const still = !!reduced

  const [rows, setRows] = useState<Row[]>(() => steps.map(toRow))
  const [past, setPast] = useState<Row[][]>([])
  const [future, setFuture] = useState<Row[][]>([])
  const live = useRef(rows)
  live.current = rows

  const [openKey, setOpenKey] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle")
  const [sweep, setSweep] = useState(-1)
  const [result, setResult] = useState<string | null>(null)
  const [hot, setHot] = useState<string | null>(null)
  /** true from lift to drop */
  const [moving, setMoving] = useState(false)
  const lifted = useRef<Row[] | null>(null)

  const running = status === "running"
  /* the rows stagger in once; after the entrance has played, a row that arrives or dims
     answers at once */
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 500)
    return () => clearTimeout(t)
  }, [])

  const reset = () => {
    setResult(null)
    setStatus("idle")
    setOpenKey(null)
  }

  /** an edit: the present goes on the undo stack, redo empties */
  const commit = useCallback((next: Row[]) => {
    setPast((p) => [...p, live.current])
    setRows(next)
    setFuture([])
    setResult(null)
    setStatus("idle")
  }, [])

  const undo = () => {
    if (!past.length || running) return
    setFuture((f) => [live.current, ...f])
    setRows(past[past.length - 1])
    setPast((p) => p.slice(0, -1))
    reset()
  }

  const redo = () => {
    if (!future.length || running) return
    setPast((p) => [...p, live.current])
    setRows(future[0])
    setFuture((f) => f.slice(1))
    reset()
  }

  const select = (rowId: string, chipId: string, value: string) => {
    setOpenKey(null)
    const row = live.current.find((r) => r.id === rowId)
    const chip = row?.tokens.find((t): t is ChipTok => t.kind === "chip" && t.id === chipId)
    if (!chip || chip.value === value) return
    commit(live.current.map((r) => (r.id !== rowId ? r : { ...r, tokens: r.tokens.map((t) => (t.kind === "chip" && t.id === chipId ? { ...t, value } : t)) })))
  }

  const add = (label: string) => {
    setOpenKey(null)
    const template = TEMPLATES.find((t) => t.label === label)
    if (template) commit([...live.current, toRow(template.step)])
  }

  const move = (id: string, by: number) => {
    if (running) return
    const from = live.current.findIndex((r) => r.id === id)
    const to = from + by
    if (from < 0 || to < 0 || to >= live.current.length) return
    const next = [...live.current]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    commit(next)
  }

  /* a drag is one entry in the history, whatever it passed on the way */
  const lift = () => {
    lifted.current = live.current
    setMoving(true)
    setOpenKey(null)
  }
  const drop = () => {
    const before = lifted.current
    lifted.current = null
    setMoving(false)
    if (!before) return
    if (before.map((r) => r.id).join() !== live.current.map((r) => r.id).join()) {
      setPast((p) => [...p, before])
      setFuture([])
      setResult(null)
      setStatus("idle")
    }
  }

  const run = () => {
    if (running || !live.current.length) return
    onRun?.()
    setOpenKey(null)
    setResult(null)
    setStatus("running")
    setSweep(still ? live.current.length : 0)
  }

  useEffect(() => {
    if (status !== "running") return
    if (sweep >= live.current.length) {
      setResult(outcome(live.current))
      setStatus("done")
      setSweep(-1)
      return
    }
    const t = setTimeout(() => setSweep((s) => s + 1), BEAT)
    return () => clearTimeout(t)
  }, [status, sweep])


  return (
    /* the rule sits in one surface card: 24 = 12 (the rows' grounds) + 12 (the p-3 inset) */
    <div className={cn("w-[400px] max-w-full rounded-[24px] p-3 tabular-nums", SURFACE, className)} role="group" aria-label={`${title}, ${rows.length} steps`}>
      {/* no visible title or description (2026-10-01): the rows read as the rule; the name is in the aria-label */}
      <Reorder.Group
        as="div"
        role="list"
        aria-label="Steps"
        axis="y"
        values={rows}
        onReorder={(next) => {
          if (!running) setRows(next)
        }}
        onPointerLeave={() => setHot(null)}
        className="flex flex-col"
        style={{ gap: GAP }}
      >
        {rows.map((row, i) => (
          <ProgramRow
            key={row.id}
            row={row}
            index={i}
            count={rows.length}
            enter={entered ? 0 : Math.min(i, 7) * 0.035}
            dim={running ? sweep !== i : !moving && hot !== null && hot !== row.id}
            locked={running}
            still={still}
            hideThread={moving}
            openKey={openKey}
            setOpenKey={setOpenKey}
            onSelect={select}
            onHot={setHot}
            onMove={move}
            onLift={lift}
            onDrop={drop}
          />
        ))}
      </Reorder.Group>

      <AddAction open={openKey === "add"} locked={running} onToggle={() => setOpenKey("add")} onClose={() => setOpenKey(null)} onPick={add} />

      <div role="status" className="mt-3 border-t border-foreground/[0.04] pt-2.5 text-[10.5px] text-foreground/45">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={result ?? status}
            className={cn("block", result && "text-foreground/90")}
            style={result?.includes("1 order placed") ? { color: GREEN } : undefined}
            initial={still ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            {result ?? (running ? `Running step ${Math.min(sweep + 1, rows.length)} of ${rows.length}` : "\u00a0" /* no summary at rest (user call, 2026-10-02) */)}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="mt-2.5 flex items-center gap-1">
        <Tip label="Undo">
          <button type="button" aria-label="Undo" disabled={!past.length || running} onClick={undo} className={cn(ICON_BUTTON, "h-7 w-7 disabled:pointer-events-none disabled:opacity-35")}>
            <Undo2 size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </Tip>
        <Tip label="Redo">
          <button type="button" aria-label="Redo" disabled={!future.length || running} onClick={redo} className={cn(ICON_BUTTON, "h-7 w-7 disabled:pointer-events-none disabled:opacity-35")}>
            <Redo2 size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </Tip>
        {/* a fixed width: the label swaps in place and the button never resizes */}
        <button type="button" disabled={running || rows.length === 0} onClick={run} className={cn(BUTTON_PRIMARY, "ml-auto h-7 w-[116px] px-3 text-[11.5px]")}>
          <motion.span
            key={running ? "running" : status === "done" ? "again" : "run"}
            className="inline-block"
            initial={still ? false : { opacity: 0, y: 4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.15, ease: EASE }}
          >
            {running ? "Running" : status === "done" ? "Run again" : "Run simulation"}
          </motion.span>
        </button>
      </div>
    </div>
  )
}
