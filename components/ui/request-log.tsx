"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Request Log, rebuilt through the ssych-component skill (2026-09-29).
   What changed against the version before it (in git history), and why:
   · no card, outline or inner shadow, and no pill around the status code: rows sit on the
     page and part by one hairline above each
   · the status code is green when the call went through and red when it failed; amber and
     the blue response body are gone, the body is ink
   · the body stays in mono: it is literal code, the one place refs/component-spec.md keeps mono for
   · the title is plain 13px text, no letter-spacing
   · every figure is tabular, latency and time stay right-aligned
   · pointing at a row dims the others; the caption says which call is open */

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
  { id: "req_01", code: 200, method: "POST", path: "/v1/emails", ms: 42, time: "09:41:02", body: '{ "id": "re_8Xk2mPq4", "status": "queued" }' },
  { id: "req_02", code: 200, method: "GET", path: "/v1/domains", ms: 18, time: "09:40:56", body: '{ "data": [{ "name": "ssych.com", "status": "verified" }] }' },
  { id: "req_03", code: 422, method: "POST", path: "/v1/broadcasts", ms: 31, time: "09:39:11", body: '{ "error": "audience_id is required" }' },
  { id: "req_04", code: 200, method: "DELETE", path: "/v1/api-keys/k_9vTz", ms: 26, time: "09:35:47", body: '{ "deleted": true }' },
  { id: "req_05", code: 404, method: "GET", path: "/v1/emails/em_missing", ms: 12, time: "09:31:08", body: '{ "error": "not_found" }' },
]

/** a call that went through is green, one that failed is red */
const codeColor = (c: number) => (c < 400 ? GREEN : RED)

const COLS = "grid-cols-[36px_52px_1fr_48px_58px]"

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
  const shown = logs.find((r) => r.id === open)

  return (
    <div className={cn("w-full max-w-[520px] tabular-nums", className)} role="group" aria-label={`${title}, ${logs.length} calls, ${failed} failed, ${caption}`}>
      <div className="flex items-baseline justify-between px-3 pb-2">
        <span className="text-[13px] font-medium text-foreground/90">{title}</span>
        <span role="status" className="text-[10px] text-foreground/35">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={shown ? shown.id : "caption"}
              className="inline-block"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
              transition={{ duration: 0.15, ease: EASE }}
            >
              {shown ? `${shown.method} ${shown.path} · ${shown.code}` : caption}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div onPointerLeave={() => setHot(null)}>
        {logs.map((r, i) => {
          const on = open === r.id
          const dim = hot !== null && hot !== r.id
          return (
            /* rows rise in once, 35ms apart, the stagger capped at the first eight */
            <motion.div
              key={r.id}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE, delay: Math.min(i, 7) * 0.035 }}
            >
            <div
              className="border-t border-foreground/[0.05] transition-opacity duration-200"
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
                  "grid w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition-[background-color,transform,translate,scale,rotate] duration-150 focus-visible:bg-foreground/[0.06] active:scale-[0.98]",
                  COLS,
                  on ? "bg-foreground/[0.03]" : "hover:bg-foreground/[0.03]",
                )}
              >
                <span className="text-[11px] font-semibold" style={{ color: codeColor(r.code) }}>
                  {r.code}
                </span>
                <span className="text-[11px] text-foreground/45">{r.method}</span>
                <span className="truncate text-[12px] text-foreground/90">{r.path}</span>
                <span className="text-right text-[11px] text-foreground/45">{r.ms}ms</span>
                <span className="text-right text-[10px] text-foreground/35">{r.time}</span>
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
                  <div className="bg-foreground/[0.03] px-3 pb-3 pl-[60px] pt-0.5">
                    <div className="mb-1 text-[9.5px] text-foreground/35">Response body</div>
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/70">
                      {r.body}
                    </pre>
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
