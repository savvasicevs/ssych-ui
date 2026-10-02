"use client"

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Tool Call Card, new through ssych-component (2026-09-29).
   What it is for: one call an agent made to a tool, with what went in and what came back.
   Read first: the head line: the tool, its state as a word, and how long it took.
   What the pointer does: pressing the head folds or opens the card; "Run again" sends
   the call again, so the card shows running and then settles on its state. While it
   runs the mark beats once a second; under reduced motion it holds still.
   Arguments and result are literal code, the only text set in mono.
   It sits on one faint fill, with no outline and no shadow.
   Reference: browsable "tool call". Ideas only, from catalogue descriptions, no code
   opened: input and output behind one disclosure (tinkererslabs "Tool Call"), and one
   state mark that changes with the state in place of a badge per state (smoothui
   "Ai Tool Call").
   Formulas:
   · returned = characters of JSON.stringify(call.result), read as bytes (the sample is
     plain ASCII, one byte per character)
   · the duration is call.durationMs as given, in ms under one second and in s above
   Colour pass (2026-09-30): the state is a pass, a fail or pending, so the mark carries it:
   green and its word for done, red for failed, amber while it runs. */

const EASE = [0.16, 1, 0.3, 1] as const
const RED = "var(--chart-down)"
const GREEN = "var(--chart-up)"
const AMBER = "var(--chart-amber)"
/** the fold and its chevron share one curve and one length, the same both ways */
const FOLD = "250ms cubic-bezier(0.22, 1, 0.36, 1)"

export type ToolCallState = "running" | "done" | "failed"

export interface ToolCall {
  id: string
  tool: string
  args: Record<string, unknown>
  /** what the tool returned; absent while running or when it failed */
  result?: unknown
  /** what went wrong, when it failed */
  error?: string
  durationMs: number
  state: ToolCallState
}

export interface ToolCallCardProps {
  call?: ToolCall
  defaultOpen?: boolean
  /** called when "Run again" is pressed */
  onRetry?: (id: string) => void
  className?: string
}

const DEFAULT_CALL: ToolCall = {
  id: "call_7Qm2",
  tool: "get_quote",
  args: { symbol: "NVDA", venue: "XNAS", fields: ["bid", "ask", "last"] },
  result: { symbol: "NVDA", bid: 179.78, ask: 179.82, last: 179.8, ts: "2026-09-29T14:32:07Z" },
  durationMs: 184,
  state: "done",
}

const took = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`)
const size = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`)
const pretty = (v: unknown) => JSON.stringify(v, null, 2) ?? ""
const ink = (pct: number) => `color-mix(in srgb, var(--foreground) ${pct}%, transparent)`

const WORD: Record<ToolCallState, string> = { running: "Running", done: "Done", failed: "Failed" }
const MARK: Record<ToolCallState, string> = { running: AMBER, done: GREEN, failed: RED }
const WORD_INK: Record<ToolCallState, string> = { running: ink(45), done: GREEN, failed: RED }
/** a text swap: 4px out of a 2px blur over 150ms */
const SWAP = { initial: { opacity: 0, y: 4, filter: "blur(2px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" } } as const

const CODE = "mt-1 overflow-hidden whitespace-pre-wrap break-words rounded-[4px] bg-foreground/[0.04] px-2.5 py-2 font-mono text-[11px] leading-[1.5]"

/**
 * One tool call as a record: tool, state and time on the head line, the literal arguments
 * and result under it. The head folds it away; running again replays the call.
 */
export function ToolCallCard({ call = DEFAULT_CALL, defaultOpen = true, onRetry, className }: ToolCallCardProps) {
  const reduced = useReducedMotion()
  const [open, setOpen] = useState(defaultOpen)
  const [state, setState] = useState<ToolCallState>(call.state)

  /* the app owns the call: a new one replaces whatever the replay was showing */
  useEffect(() => setState(call.state), [call])

  /* a replay holds on running for the time the call took, then settles where the call ended */
  useEffect(() => {
    if (state !== "running" || call.state === "running") return
    const t = window.setTimeout(() => setState(call.state), Math.min(2400, Math.max(600, call.durationMs)))
    return () => window.clearTimeout(t)
  }, [state, call])

  const live = state === "running"
  const bytes = call.result === undefined ? 0 : (JSON.stringify(call.result) ?? "").length

  return (
    <div
      className={cn("w-full max-w-[440px] rounded-lg bg-foreground/[0.03] tabular-nums", className)}
      role="group"
      aria-label={`Tool call ${call.tool}, ${WORD[state].toLowerCase()}${live ? "" : `, ${took(call.durationMs)}`}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left outline-none transition-colors duration-150 hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.06]"
      >
        <motion.span
          aria-hidden
          className="block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: MARK[state], transition: "background-color 160ms" }}
          animate={live && !reduced ? { opacity: [1, 0.25, 1] } : { opacity: 1 }}
          transition={live && !reduced ? { duration: 1, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
        />
        <span className="truncate text-[12.5px] font-medium text-foreground/90">{call.tool}</span>
        <span role="status" className="text-[11px]" style={{ color: WORD_INK[state] }}>
          <motion.span
            key={state}
            className="inline-block"
            initial={reduced ? { opacity: 0 } : SWAP.initial}
            animate={SWAP.animate}
            transition={{ duration: 0.15, ease: EASE }}
          >
            {WORD[state]}
          </motion.span>
        </span>
        <span className="ml-auto text-[11px] text-foreground/70">{live ? "" : took(call.durationMs)}</span>
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={cn("shrink-0", open && "rotate-180")}
          style={{ transition: reduced ? "none" : `transform ${FOLD}` }}
        >
          <path d="M2 3.75 5 6.75l3-3" stroke="var(--foreground)" strokeOpacity={0.45} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* the body unfolds on grid rows 0fr → 1fr; folded it is inert. Reduced motion keeps the fade */}
      <div
        inert={!open}
        className="grid"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transition: reduced ? "opacity 150ms" : `grid-template-rows ${FOLD}, opacity ${FOLD}`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
            <div className="flex flex-col gap-2.5 px-3 pb-3">
              <div>
                <div className="text-[10.5px] text-foreground/45">Arguments</div>
                <pre className={cn(CODE, "text-foreground/80")}>{pretty(call.args)}</pre>
              </div>

              <div>
                <div className="text-[10.5px] text-foreground/45">{state === "failed" ? "Error" : "Result"}</div>
                {/* waiting shimmers; what comes back is revealed out of a 2px blur over 300ms */}
                <motion.div
                  key={state}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                {live ? (
                  <div className={CODE}>
                    <motion.span
                      className="inline-block"
                      style={{
                        color: "transparent",
                        backgroundImage: `linear-gradient(90deg, ${ink(40)} 0%, ${ink(40)} 35%, ${ink(85)} 50%, ${ink(40)} 65%, ${ink(40)} 100%)`,
                        backgroundSize: "200% 100%",
                        backgroundClip: "text",
                        WebkitBackgroundClip: "text",
                      }}
                      initial={{ backgroundPosition: "100% 0%" }}
                      animate={reduced ? { backgroundPosition: "50% 0%" } : { backgroundPosition: ["100% 0%", "-100% 0%"] }}
                      transition={reduced ? { duration: 0 } : { duration: 1.6, repeat: Infinity, ease: "linear" }}
                    >
                      waiting for {call.tool}
                    </motion.span>
                  </div>
                ) : state === "failed" ? (
                  <pre className={CODE} style={{ color: RED }}>
                    {call.error ?? "no message"}
                  </pre>
                ) : (
                  <pre className={cn(CODE, "text-foreground/80")}>{pretty(call.result)}</pre>
                )}
                </motion.div>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-[10.5px] text-foreground/45">
                  {call.id}
                  {state === "done" && ` · ${size(bytes)} returned`}
                </span>
                <button
                  type="button"
                  disabled={live}
                  onClick={() => {
                    onRetry?.(call.id)
                    setState("running")
                  }}
                  className="-mr-2 rounded-full px-2 py-0.5 text-[10.5px] font-medium text-foreground/45 outline-none transition-[color,background-color,scale] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 hover:text-foreground/90 focus-visible:bg-foreground/[0.06] disabled:pointer-events-none disabled:opacity-35"
                >
                  Run again
                </button>
              </div>
            </div>
        </div>
      </div>
    </div>
  )
}
