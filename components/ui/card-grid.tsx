"use client"

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ProjectCard } from "@/components/ui/project-card";
import { useProjectDetails, type CardData } from "@/components/ui/project-card-utils";

/** Responsive grid of project cards. Click to open the shared details modal. */
export function CardGrid({ cards, className }: { cards: CardData[]; className?: string }) {
  const { open, modal } = useProjectDetails(cards);

  if (!cards.length) return null;

  return (
    <div className={cn("mx-auto w-full max-w-5xl", className)}>
      <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 28, delay: i * 0.04 }}
            onClick={() => open(card.id)}
            className="group relative aspect-[3/2] w-full cursor-pointer overflow-hidden rounded-[28px] shadow-[0_24px_70px_-28px_rgba(0,0,0,0.85)]"
          >
            <ProjectCard card={card} variant="overlay" emphasis="sm" />
          </motion.div>
        ))}
      </div>

      {modal}
    </div>
  );
}
