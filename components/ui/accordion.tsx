"use client"

import { useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// transitions.dev signature smooth-out easing (cubic-bezier(0.22, 1, 0.36, 1)).
const EASE = [0.22, 1, 0.36, 1] as const;

export type AccordionItem = {
  title: string;
  body: string;
  icon?: ComponentType<{ className?: string }>;
  deliverables?: string[];
};

/**
 * Accordion (WAI-ARIA) — a vertical list of titles; the active row expands to
 * reveal its body + deliverables alongside a visual supplied by `stage(i)`.
 * Pulled from the /pro-services "Variant 02 · accordion".
 */
export function Accordion({
  items = [],
  stage,
  defaultOpen = 0,
}: {
  items?: AccordionItem[];
  stage?: (i: number) => ReactNode;
  defaultOpen?: number;
}) {
  const [active, setActive] = useState(defaultOpen);

  return (
    <div className="w-full">
      {items.map((it, i) => {
        const on = active === i;
        const Icon = it.icon;
        return (
          <div key={i} className="border-t border-foreground/[0.08] first:border-t-0">
            <h3>
              <button
                type="button"
                id={`acc-tab-${i}`}
                aria-expanded={on}
                aria-controls={`acc-panel-${i}`}
                onClick={() => setActive(on ? -1 : i)}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-4 pt-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
                  on ? "pb-2" : "pb-4"
                )}
              >
                <span className="flex items-center gap-3">
                  {Icon && (
                    <Icon
                      className={cn(
                        "h-5 w-5 shrink-0 text-foreground transition-opacity duration-300",
                        on ? "opacity-100" : "opacity-35"
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "text-[22px] font-bold leading-[1.1] transition-colors duration-300",
                      on ? "text-foreground" : "text-foreground/40 hover:text-foreground/60"
                    )}
                  >
                    {it.title}
                  </span>
                </span>
                {/* chevron flips vertically (scaleY) — a "v" through a flat line to a "^" */}
                <motion.span
                  aria-hidden
                  className="inline-flex shrink-0"
                  animate={{ scaleY: on ? -1 : 1 }}
                  transition={{ duration: 0.25, ease: EASE }}
                >
                  <ChevronDown className={cn("h-5 w-5", on ? "text-foreground" : "text-foreground/40")} />
                </motion.span>
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {on && (
                <motion.section
                  key="panel"
                  id={`acc-panel-${i}`}
                  role="region"
                  aria-labelledby={`acc-tab-${i}`}
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="overflow-hidden"
                >
                  {/* body rises out of a soft blur as the panel grows */}
                  <motion.div
                    initial={{ opacity: 0, filter: "blur(2px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, filter: "blur(2px)" }}
                    transition={{ duration: 0.28, ease: EASE }}
                    className="grid grid-cols-1 gap-6 pb-6 lg:grid-cols-2 lg:items-center lg:gap-10"
                  >
                    {/* left — body + deliverables */}
                    <div>
                      <p className="max-w-xl text-[14px] font-light leading-[1.55] text-foreground/50">{it.body}</p>
                      {it.deliverables && it.deliverables.length > 0 && (
                        <ul className="mt-5 flex flex-col gap-2.5">
                          {it.deliverables.map((d) => (
                            <li key={d} className="flex items-start gap-2.5 text-[13px] leading-snug text-foreground/55">
                              <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.03]">
                                <Check className="h-4 w-4 text-foreground opacity-70" />
                              </span>
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* right — visual */}
                    {stage && <div className="relative">{stage(i)}</div>}
                  </motion.div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
