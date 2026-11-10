// provenance: original
"use client"

import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"
import { ProjectCard } from "@/components/ui/project-card"
import { useProjectDetails, type CardData } from "@/components/ui/project-card-utils"

const EASE = [0.16, 1, 0.3, 1] as const

/** Vertical list of horizontal project cards. Click to open the details modal. */
export function CardList({ cards, className }: { cards: CardData[]; className?: string }) {
  const { open, modal } = useProjectDetails(cards)
  const reduced = useReducedMotion()

  if (!cards.length) return null

  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-4", className)}>
      {cards.map((card, i) => (
        <motion.div
          key={card.id}
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: Math.min(i, 7) * 0.04 }}
          onClick={() => open(card.id)}
          className="group relative w-full cursor-pointer overflow-hidden rounded-[21px] shadow-[0_24px_70px_-28px_rgba(0,0,0,calc(0.85*var(--shadow-k,1)))]"
        >
          <ProjectCard card={card} variant="list" />
        </motion.div>
      ))}

      {modal}
    </div>
  )
}
