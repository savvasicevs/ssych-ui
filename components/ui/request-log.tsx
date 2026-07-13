import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const AMBER = "#E8B45A"
const GREEN = "#34C28A"
const BLUE = "#4790E4"
const SURFACE = "#0A0E16"

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
  { id: "req_02", code: 200, method: "GET", path: "/v1/domains", ms: 18, time: "09:40:56", body: '{ "data": [{ "name": "ssicevs.com", "status": "verified" }] }' },
  { id: "req_03", code: 422, method: "POST", path: "/v1/broadcasts", ms: 31, time: "09:39:11", body: '{ "error": "audience_id is required" }' },
  { id: "req_04", code: 200, method: "DELETE", path: "/v1/api-keys/k_9vTz", ms: 26, time: "09:35:47", body: '{ "deleted": true }' },
  { id: "req_05", code: 404, method: "GET", path: "/v1/emails/em_missing", ms: 12, time: "09:31:08", body: '{ "error": "not_found" }' },
]

const codeColor = (c: number) => (c < 300 ? GREEN : c < 500 && c !== 404 ? AMBER : "rgba(255,255,255,0.45)")

/**
 * API log in the Stripe/Supabase register: status pill, method, mono path,
 * latency and time per row; clicking a row unfolds its response body inline.
 * One row open at a time.
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

  return (
    <div className={cn("w-full max-w-[520px]", className)}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">{title}</span>
        <span className="text-[10px] text-white/30">{caption}</span>
      </div>
      <div
        className="overflow-hidden rounded-xl border border-white/[0.04]"
        style={{ background: SURFACE, boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.04)" }}
      >
        {logs.map((r) => {
          const on = open === r.id
          return (
            <div key={r.id} className="border-b border-white/[0.04] last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen(on ? null : r.id)}
                aria-expanded={on}
                className={cn(
                  "grid w-full grid-cols-[44px_52px_1fr_48px_58px] items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150",
                  on ? "bg-white/[0.03]" : "hover:bg-white/[0.02]",
                )}
              >
                <span
                  className="rounded-md border border-white/[0.03] px-1.5 py-0.5 text-center text-[10px]"
                  style={{ color: codeColor(r.code), background: "rgba(255,255,255,0.02)" }}
                >
                  {r.code}
                </span>
                <span className="text-[11px] text-white/55">{r.method}</span>
                <span className="truncate text-[11px] text-white/80">{r.path}</span>
                <span className="text-right tabular-nums text-[11px] text-white/40">{r.ms}ms</span>
                <span className="text-right tabular-nums text-[10px] text-white/30">{r.time}</span>
              </button>
              <AnimatePresence initial={false}>
                {on && (
                  <motion.div
                    initial={{ height: reduced ? "auto" : 0, opacity: reduced ? 1 : 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.35, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-white/[0.04] bg-black/30 px-4 py-3">
                      <div className="mb-1.5 text-[9px] uppercase tracking-[0.1em] text-white/30">Response body</div>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed" style={{ color: BLUE }}>
                        {r.body}
                      </pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
