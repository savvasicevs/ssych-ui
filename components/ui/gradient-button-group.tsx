
import { type ReactNode } from "react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

export interface GradientButtonGroupItem {
  id: string
  icon: ReactNode
  label: string
}

/**
 * Simple segmented switcher: a single bordered pill with one gray "selected"
 * circle that slides between the round icon buttons.
 */
export function GradientButtonGroup({
  items = [],
  value,
  onValueChange = () => {},
  className,
}: {
  items?: GradientButtonGroupItem[]
  value?: string
  onValueChange?: (id: string) => void
  className?: string
}) {
  return (
    <nav
      className={cn("inline-flex items-center gap-0.5 rounded-full p-0.5", className)}
      style={{
        background: "linear-gradient(180deg, #0e121b 0%, #070a11 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {items.map((item) => {
        const isActive = value === item.id

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id !== value) onValueChange(item.id)
            }}
            className={cn(
              "relative flex h-[34px] w-[34px] items-center justify-center rounded-full transition-colors duration-300",
              isActive ? "text-white" : "text-[#6b6b6d] hover:text-zinc-300",
            )}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
          >
            {isActive && (
              <motion.span
                layoutId="switcher-active"
                className="absolute inset-0 rounded-full"
                style={{
                  background: "linear-gradient(180deg, #2a2f3a 0%, #1d212a 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">{item.icon}</span>
          </button>
        )
      })}
    </nav>
  )
}
