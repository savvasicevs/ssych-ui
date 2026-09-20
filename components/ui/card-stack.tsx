"use client"

import { useState, type CSSProperties } from "react"
import { motion, AnimatePresence, LayoutGroup, useReducedMotion, type PanInfo } from "motion/react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProjectCard } from "@/components/ui/project-card"
import { useProjectDetails, type CardData } from "@/components/ui/project-card-utils"

const SWIPE_THRESHOLD = 50

const CIRCLE_STYLE: CSSProperties = {
  background: "linear-gradient(180deg, var(--panel) 0%, var(--surface-soft) 100%)",
  border: "1px solid color-mix(in srgb, var(--foreground) 5%, transparent)",
  borderTop: "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
}

/**
 * Draggable stacked-card carousel. The top card swipes/drags; the rest peek
 * behind it via transform + zIndex (DOM order stays stable). Click to open
 * the shared details modal.
 */
export function CardStack({ cards, className }: { cards: CardData[]; className?: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const { open, modal } = useProjectDetails(cards)
  const reduced = useReducedMotion()

  if (!cards.length) return null

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset, velocity } = info
    const swipe = Math.abs(offset.x) * velocity.x
    if (offset.x < -SWIPE_THRESHOLD || swipe < -1000) {
      setActiveIndex((prev) => (prev + 1) % cards.length)
    } else if (offset.x > SWIPE_THRESHOLD || swipe > 1000) {
      setActiveIndex((prev) => (prev - 1 + cards.length) % cards.length)
    }
    setIsDragging(false)
  }

  const getStackStyles = (pos: number) => ({
    x: pos * 16,
    y: pos * 16,
    scale: 1 - pos * 0.045,
    rotate: (pos - 1) * 1.2,
    zIndex: cards.length - pos,
  })

  // Keep DOM order stable — stacking is driven purely by each card's transform.
  const displayCards = cards.map((c, i) => ({
    ...c,
    stackPosition: (i - activeIndex + cards.length) % cards.length,
  }))

  return (
    <div className={cn("mx-auto w-full max-w-5xl space-y-6", className)}>
      {cards.length > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveIndex((prev) => (prev - 1 + cards.length) % cards.length)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#6b6b6d] shadow-[0_4px_16px_-6px_rgba(0,0,0,0.7)] transition-colors duration-300 hover:text-foreground/85"
            style={CIRCLE_STYLE}
            aria-label="Previous project"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setActiveIndex((prev) => (prev + 1) % cards.length)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#6b6b6d] shadow-[0_4px_16px_-6px_rgba(0,0,0,0.7)] transition-colors duration-300 hover:text-foreground/85"
            style={CIRCLE_STYLE}
            aria-label="Next project"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <LayoutGroup>
        <motion.div layout className="relative mx-auto aspect-[3/2] w-full">
          <AnimatePresence mode="popLayout">
            {displayCards.map((card) => {
              const isTop = card.stackPosition === 0
              return (
                <motion.div
                  key={card.id}
                  layoutId={card.id}
                  initial={reduced ? false : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, ...getStackStyles(card.stackPosition) }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, x: -200 }}
                  transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 28 }}
                  drag={isTop ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.6}
                  onDragStart={() => setIsDragging(true)}
                  onDragEnd={handleDragEnd}
                  whileDrag={{ scale: 1.01, cursor: "grabbing" }}
                  onClick={() => {
                    if (isDragging) return
                    open(card.id)
                  }}
                  className={cn(
                    "group absolute inset-0 cursor-pointer overflow-hidden rounded-[28px] shadow-[0_24px_70px_-28px_rgba(0,0,0,0.85)]",
                    isTop && "cursor-grab active:cursor-grabbing"
                  )}
                >
                  <ProjectCard card={card} variant="overlay" emphasis="lg" />
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>

      {modal}
    </div>
  )
}
