import { useId, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

export interface SegmentedControlProps {
  options: string[]
  /** Controlled value; omit to let the control manage its own state. */
  value?: string
  onChange?: (v: string) => void
  className?: string
}

/**
 * The range switcher as a primitive: a hairline pill whose thumb glides
 * between options with a shared-layout spring. Tabular labels, no chrome.
 */
export function SegmentedControl({ options, value, onChange, className }: SegmentedControlProps) {
  const reduced = useReducedMotion()
  const uid = useId()
  const [inner, setInner] = useState(value ?? options[0])
  const current = value ?? inner

  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-full border border-foreground/[0.04] p-0.5", className)}>
      {options.map((o) => {
        const on = o === current
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => {
              setInner(o)
              onChange?.(o)
            }}
            className={cn(
              "relative rounded-full px-3 py-1.5 text-[11px] tracking-[0.05em] transition-colors duration-200",
              on ? "text-foreground" : "text-foreground/40 hover:text-foreground/70",
            )}
          >
            {on && (
              /* transitions.dev sliding-tabs feel: a clean 250ms smooth-out tween */
              <motion.span
                layoutId={`${uid}-thumb`}
                className="absolute inset-0 rounded-full bg-foreground/[0.08]"
                style={{ boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 6%, transparent)" }}
                transition={reduced ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <span className="relative">{o}</span>
          </button>
        )
      })}
    </div>
  )
}
