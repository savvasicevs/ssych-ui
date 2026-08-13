"use client"

import { type ReactNode } from "react"

import { cn } from "@/lib/utils"

const SURFACE = "var(--card)"
const SURFACE_DEEP = "var(--card)"

const EnvelopeGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M3 8l9 5 9-5M4.8 5h14.4c1 0 1.8.8 1.8 1.8v10.4c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8V6.8C3 5.8 3.8 5 4.8 5z"
      stroke="var(--muted-foreground)"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * "Nothing yet" register in the Resend style: a dotted field, a hairline icon
 * chip, one line of ink and one quiet action. The emptiness is the design;
 * nothing decorates it.
 */
export function EmptyState({
  icon = EnvelopeGlyph,
  title = "No emails sent yet",
  hint = "your first send appears here in real time",
  action = "Send a test email",
  onAction,
  className,
}: {
  icon?: ReactNode
  title?: string
  hint?: string
  /** Button label; pass null to render no action. */
  action?: string | null
  onAction?: () => void
  className?: string
}) {
  return (
    <div
      className={cn("flex w-full max-w-[420px] flex-col items-center rounded-xl border border-foreground/[0.03] px-8 py-12", className)}
      style={{
        background: "radial-gradient(color-mix(in srgb, var(--foreground) 5%, transparent) 1px, transparent 1px) 0 0 / 14px 14px, " + SURFACE_DEEP,
      }}
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-[10px] border border-foreground/[0.04]"
        style={{ background: SURFACE, boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 6%, transparent)" }}
      >
        {icon}
      </span>
      <p className="mt-4 text-[13px] text-foreground/75">{title}</p>
      <p className="mt-1 text-[11px] text-foreground/35">{hint}</p>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 rounded-full border border-foreground/[0.04] bg-foreground/[0.03] px-4 py-1.5 text-[11px] text-foreground/75 transition-all duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.98]"
        >
          {action}
        </button>
      )}
    </div>
  )
}
