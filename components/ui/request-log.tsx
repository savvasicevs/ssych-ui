"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Check, Copy } from "lucide-react"

import { cn } from "@/lib/utils"
import { ICON_BUTTON, RAISED, SURFACE } from "@/components/ui/control-classes"

/* Request Log, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card, outline or inner shadow, and no pill around the status code: rows sit on the
     page and part by one hairline above each
   · the status code is green when the call went through and red when it failed; amber and
     the blue response body are gone, the body is ink
   · the body stays in mono: it is literal code, the one place refs/component-spec.md keeps mono for
   · the title is plain 13px text, no letter-spacing
   · every figure is tabular, latency and time stay right-aligned
   · pointing at a row dims the others; the caption says which call is open
   2026-10-02: surfaces at 7% (raised blocks white in light, 12% in dark) so cards read on white and on black.
   2026-10-02 audit: no visible title or caption (both live in the aria-label, the caption no
   longer repeats the open row); column heads at 10.5px /45 name the table instead. The open
   row and its body are one surface block on 12px corners, the body on the raised step
   inside it (12 = 8 + 4), with a copy button and a Copy tip that turns to Copied. Time at
   10.5px /45, hairlines at 4% with the heads' hairline above the first row, width 440 like
   the other AI and operations lists.
   2026-10-02 round 2: the sample calls are a trading and LLM API in place of an email API.
   An order is placed, the positions are read, a chat completion is rate limited, and the
   same order 84133 is cancelled a minute later (newest first, so the cancel leads). The
   ids in the bodies match the paths, and each 2xx or 4xx code fits its call. */

const EASE = [0.16, 1, 0.3, 1] as const
const GREEN = "var(--chart-up)"
const RED = "var(--chart-down)"

export interface LogRow {
  id: string
  code: number
  method: string
  path: string
  ms: number
  time: string
  body: string
}

const DEFAULT_LOGS: LogRow[] = [
  { id: "req_01", code: 204, method: "DELETE", path: "/v1/orders/84133", ms: 24, time: "09:41:02", body: "// 204 No Content: order 84133 cancelled" },
  { id: "req_02", code: 200, method: "GET", path: "/v1/positions", ms: 19, time: "09:40:56", body: '{ "data": [{ "symbol": "ETH-PERP", "side": "long", "size": 4.2, "entry": 2418.6 }] }' },
  { id: "req_03", code: 429, method: "POST", path: "/v1/chat/completions", ms: 9, time: "09:40:31", body: '{ "error": "rate_limited", "model": "claude-sonnet-5-5", "retry_after_ms": 1200 }' },
  { id: "req_04", code: 201, method: "POST", path: "/v1/orders", ms: 38, time: "09:39:47", body: '{ "order_id": "84133", "symbol": "BTC-PERP", "side": "buy", "qty": 0.25, "status": "open" }' },
  { id: "req_05", code: 200, method: "POST", path: "/v1/chat/completions", ms: 842, time: "09:35:08", body: '{ "id": "chatcmpl_7Hq2", "model": "gpt-5", "usage": { "total_tokens": 1284 } }' },
]

/** a call that went through is green, one that failed is red */
const codeColor = (c: number) => (c < 400 ? GREEN : RED)

const COLS = "grid-cols-[36px_52px_minmax(0,1fr)_48px_58px]"
const HEADS = ["Status", "Method", "Path", "Latency", "Time"]

/** copies the body; the tip says Copy, then Copied for 1.4 s */
function CopyBody({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = () => {
    void navigator.clipboard?.writeText(text).catch(() => {})
    setDone(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDone(false), 1400)
  }
  return (
    <button type="button" onClick={copy} aria-label={done ? "Copied" : "Copy response body"} className={cn(ICON_BUTTON, "group/copy relative h-6 w-6")}>
      {done ? <Check size={12} strokeWidth={2} aria-hidden style={{ color: GREEN }} /> : <Copy size={12} strokeWidth={1.75} aria-hidden />}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-full right-0 mb-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] text-foreground/90 opacity-0 transition-opacity duration-150 group-hover/copy:opacity-100 group-focus-visible/copy:opacity-100",
          RAISED,
          done && "opacity-100",
        )}
      >
        {done ? "Copied" : "Copy"}
      </span>
    </button>
  )
}

/**
 * API log in the Stripe/Supabase register: status code, method, path, latency and time
 * per row. Pointing at a row dims the rest; pressing it unfolds the response body in
 * place. One row open at a time.
 */
export function RequestLog({
  logs = DEFAULT_LOGS,
  title = "Request log",
  caption = "last hour",
  className,
}: {
  logs?: LogRow[]
  title?: string
  caption?: string
  className?: string
}) {
  const reduced = useReducedMotion()
  const [open, setOpen] = useState<string | null>(null)
  const [hot, setHot] = useState<string | null>(null)
  const failed = logs.filter((r) => r.code >= 400).length

  return (
    <div className={cn("w-[440px] max-w-full tabular-nums", className)} role="group" aria-label={`${title}, ${logs.length} calls, ${failed} failed, ${caption}`}>
      {/* the heads name the table (spec 14.2); title and caption are read out in the aria-label */}
      <div aria-hidden className={cn("grid gap-3 border-b border-foreground/[0.04] px-3 pb-2 text-[10.5px] text-foreground/45", COLS)}>
        {HEADS.map((h, i) => (
          <span key={h} className={i >= 3 ? "text-right" : undefined}>
            {h}
          </span>
        ))}
      </div>

      <div onPointerLeave={() => setHot(null)}>
        {logs.map((r, i) => {
          const on = open === r.id
          const dim = hot !== null && hot !== r.id
          return (
            /* rows rise in once, 35ms apart, the stagger capped at the first eight */
            <motion.div
              key={r.id}
              className={cn(i > 0 && "border-t border-foreground/[0.04]")}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
            >
            <div
              className={cn("rounded-[12px] transition-[opacity,background-color] duration-200", on && SURFACE)}
              style={{ opacity: dim ? 0.45 : 1 }}
              onPointerEnter={() => setHot(r.id)}
            >
              <button
                type="button"
                onClick={() => setOpen(on ? null : r.id)}
                onFocus={() => setHot(r.id)}
                onBlur={() => setHot(null)}
                aria-expanded={on}
                aria-label={`${r.code} ${r.method} ${r.path}, ${r.ms} ms, ${r.time}`}
                className={cn(
                  "grid w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left outline-none transition-[background-color,transform,translate,scale,rotate] duration-150 active:scale-[0.98] motion-reduce:active:scale-100",
                  COLS,
                  on ? "focus-visible:bg-foreground/[0.04]" : "hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06]",
                )}
              >
                <span className="text-[11px] font-semibold" style={{ color: codeColor(r.code) }}>
                  {r.code}
                </span>
                <span className="text-[11px] text-foreground/60">{r.method}</span>
                <span className="truncate text-[12px] text-foreground/90" title={r.path}>
                  {r.path}
                </span>
                <span className="text-right text-[11px] text-foreground/60">{r.ms}ms</span>
                <span className="text-right text-[10.5px] text-foreground/45">{r.time}</span>
              </button>
              {/* the body unfolds on grid rows 0fr → 1fr (transitions.dev accordion), 250ms both
                  ways; reduced motion opens it at once and keeps the fade */}
              <div
                aria-hidden={!on}
                inert={!on}
                className="grid"
                style={{
                  gridTemplateRows: on ? "1fr" : "0fr",
                  opacity: on ? 1 : 0,
                  transition: reduced
                    ? "opacity 150ms ease-out"
                    : "grid-template-rows 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <div className="min-h-0 overflow-hidden">
                  {/* the body on the raised step inside the open row's surface: 12 = 8 + 4 */}
                  <div className="px-1 pb-1">
                    <div className={cn("rounded-[8px] px-2.5 pb-2.5 pt-1.5", RAISED)}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] text-foreground/45">Response body</span>
                        <CopyBody text={r.body} />
                      </div>
                      <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/70">{r.body}</pre>
                    </div>
                  </div>
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
