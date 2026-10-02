"use client"

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Agent Run Timeline, new through ssych-component (2026-09-29).
   What it is for: the steps of one agent run, in the order they ran.
   Read first: the step that is running. Its mark beats once a second and its state is
   the only one at full ink; under reduced motion the mark holds still.
   What the pointer does: pointing at a step dims the others; pressing it opens its
   input and output, which are literal code and so the only text set in mono.
   Sketch: src/components/lab/AgentRunTicker.tsx. Kept: one row per unit with the state
   as a mark and a word at the right end, the run id, the four-state vocabulary. Changed:
   it shows the steps of one run and not a rotating queue of runs, so the ticker, the
   live and calm chip and the hover expansion are gone; no outline, no capitals, no blue
   (done is green, waiting amber, a failure red, running full ink); the fixed progress hints per
   status are gone because nothing derived them.
   Reference: browsable "agent run". Ideas only, from the catalogue description of motiq
   "Agent Run Timeline", no code opened: an ordered rail of steps, each with its tool
   call and its output.
   Formulas:
   · done = steps whose state is done
   · so far = Σ durationMs of done, failed and running steps (1210 + 840 + 2310 + 4600
     = 8960 ms = 8.96 s); a running step carries the time elapsed when it was sampled */

const EASE = [0.16, 1, 0.3, 1] as const
const RED = "var(--chart-down)"
const GREEN = "var(--chart-up)"
const AMBER = "var(--chart-amber)"
const COLS = "grid-cols-[14px_minmax(0,1fr)_auto_60px_52px]"

export type StepState = "done" | "running" | "waiting" | "failed"

export interface AgentStep {
  id: string
  /** what the step does */
  step: string
  /** the tool it calls */
  tool: string
  /** time taken; for a running step the time elapsed so far; none while waiting */
  durationMs?: number
  state: StepState
  /** literal input, as sent */
  input?: string
  /** literal output, as returned */
  output?: string
}

export interface AgentRunTimelineProps {
  runId?: string
  task?: string
  steps?: AgentStep[]
  /** id of the step that starts open; null starts closed */
  defaultOpen?: string | null
  className?: string
}

const DEFAULT_STEPS: AgentStep[] = [
  {
    id: "s1",
    step: "Plan",
    tool: "planner.plan",
    durationMs: 1210,
    state: "done",
    input: '{ "goal": "reconcile fills with the ledger", "date": "2026-09-28" }',
    output: '{ "steps": 5 }',
  },
  {
    id: "s2",
    step: "Fetch fills",
    tool: "broker.get_fills",
    durationMs: 840,
    state: "done",
    input: '{ "account": "DESK-7", "date": "2026-09-28" }',
    output: '{ "fills": 1284 }',
  },
  {
    id: "s3",
    step: "Match against ledger",
    tool: "sql.query",
    durationMs: 2310,
    state: "done",
    input: "select f.id from fills f\nleft join ledger l on l.fill_id = f.id\nwhere l.id is null",
    output: '{ "rows": 17, "scanned": 1284 }',
  },
  {
    id: "s4",
    step: "Draft exceptions report",
    tool: "llm.generate",
    durationMs: 4600,
    state: "running",
    input: '{ "model": "claude-sonnet-4-5", "rows": 17, "max_tokens": 1200 }',
  },
  {
    id: "s5",
    step: "Send to review queue",
    tool: "queue.push",
    state: "waiting",
    input: '{ "queue": "ops-review", "items": 17 }',
  },
]

const took = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`)
const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`

/* state is a direction (2026-09-30): done is green, failed red, waiting amber; the running
   step stays full ink and carries the beat */
const MARK: Record<StepState, string> = { done: GREEN, running: ink(100), waiting: AMBER, failed: RED }
const WORD: Record<StepState, string> = { done: "Done", running: "Running", waiting: "Waiting", failed: "Failed" }

function Code({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <div className="text-[10.5px] text-foreground/45">{label}</div>
      <pre className="mt-1 overflow-hidden whitespace-pre-wrap break-words rounded-[4px] bg-foreground/[0.04] px-2.5 py-2 font-mono text-[11px] leading-[1.5] text-foreground/80">
        {children}
      </pre>
    </div>
  )
}

/**
 * One run as a rail of steps: the step, its tool, how long it took and where it stands.
 * The running step beats once a second; any step opens to what went in and what came out.
 */
export function AgentRunTimeline({
  runId = "run-4821",
  task = "Reconcile fills with the ledger",
  steps = DEFAULT_STEPS,
  defaultOpen = "s3",
  className,
}: AgentRunTimelineProps) {
  const reduced = useReducedMotion()
  const [open, setOpen] = useState<string | null>(defaultOpen)
  const [hot, setHot] = useState<string | null>(null)
  /* steps rise in once, 40ms apart; after that the hover dim is quick */
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLanded(true), reduced ? 0 : Math.min(steps.length, 8) * 40 + 320)
    return () => clearTimeout(t)
  }, [reduced, steps.length])

  const done = steps.filter((s) => s.state === "done").length
  const soFar = steps.reduce((sum, s) => (s.state === "waiting" ? sum : sum + (s.durationMs ?? 0)), 0)
  const running = steps.find((s) => s.state === "running")

  return (
    <div
      className={cn("w-full max-w-[480px] tabular-nums", className)}
      role="group"
      aria-label={`${runId}, ${task}. ${done} of ${steps.length} steps done, ${took(soFar)} so far${running ? `, running: ${running.step}` : ""}`}
    >
      <div className="flex items-baseline justify-between gap-3 px-3 pb-2">
        {/* the run id is the one name (2026-10-01); the task is read out in the group's aria-label */}
        <span className="min-w-0 truncate text-[13px] font-medium text-foreground/90">{runId}</span>
        <span role="status" className="shrink-0 text-[10.5px] text-foreground/45">
          <span className="font-medium text-foreground/90">
            {done} of {steps.length} done
          </span>{" "}
          · {took(soFar)} so far
        </span>
      </div>

      <div role="list" onPointerLeave={() => setHot(null)}>
        {steps.map((s, i) => {
          const on = open === s.id
          const live = s.state === "running"
          return (
            <motion.div
              key={s.id}
              role="listitem"
              className="relative"
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: hot !== null && hot !== s.id ? 0.5 : 1, y: 0 }}
              transition={
                reduced
                  ? { duration: 0.2 }
                  : landed
                    ? { duration: 0.2, ease: EASE }
                    : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.04 }
              }
            >
              {/* the rail runs between the marks and never under them, so it needs no ground to hide behind */}
              {i > 0 && <span aria-hidden className="absolute left-[18.5px] top-0 h-[11px] w-px bg-foreground/[0.08]" />}
              {i < steps.length - 1 && <span aria-hidden className="absolute bottom-0 left-[18.5px] top-[25px] w-px bg-foreground/[0.08]" />}

              <button
                type="button"
                aria-expanded={on}
                aria-label={`Step ${i + 1}, ${s.step}, ${s.tool}, ${s.durationMs === undefined ? "" : `${took(s.durationMs)}, `}${WORD[s.state].toLowerCase()}`}
                onClick={() => setOpen(on ? null : s.id)}
                onPointerEnter={() => setHot(s.id)}
                onFocus={() => setHot(s.id)}
                onBlur={() => setHot(null)}
                className={cn(
                  "grid h-9 w-full items-center gap-x-2.5 rounded-lg px-3 text-left outline-none transition-[background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] active:scale-[0.99] motion-reduce:active:scale-100",
                  COLS,
                )}
              >
                <span aria-hidden className="grid h-3.5 w-3.5 place-items-center">
                  <motion.span
                    className="block h-1.5 w-1.5 rounded-full"
                    style={{ background: MARK[s.state] }}
                    animate={live && !reduced ? { opacity: [1, 0.25, 1] } : { opacity: 1 }}
                    transition={live && !reduced ? { duration: 1, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
                  />
                </span>
                <span className={cn("truncate text-[12.5px]", s.state === "waiting" ? "text-foreground/45" : "font-medium text-foreground/90")}>{s.step}</span>
                <span className="text-[11px] text-foreground/45">{s.tool}</span>
                <span className="text-right text-[11px] text-foreground/70">{s.durationMs === undefined ? "" : took(s.durationMs)}</span>
                <span
                  className={cn("text-right text-[11px]", live ? "font-medium text-foreground/90" : "text-foreground/45")}
                  style={live ? undefined : { color: MARK[s.state] }}
                >
                  {WORD[s.state]}
                </span>
              </button>

              {/* the detail opens on grid rows, 0fr to 1fr in 250ms, and fades with it */}
              <div
                inert={!on}
                className="grid transition-[grid-template-rows,opacity] duration-[250ms] motion-reduce:transition-none"
                style={{ gridTemplateRows: on ? "1fr" : "0fr", opacity: on ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
              >
                <div className="min-h-0 overflow-hidden">
                    <div className="flex flex-col gap-2 pb-3 pl-9 pr-3 pt-1">
                      {s.input !== undefined && <Code label="Input">{s.input}</Code>}
                      {s.output !== undefined ? (
                        <Code label="Output">{s.output}</Code>
                      ) : (
                        <div className="text-[10.5px] text-foreground/45">{live ? "Output still arriving" : s.state === "waiting" ? "Not started" : "No output"}</div>
                      )}
                    </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
