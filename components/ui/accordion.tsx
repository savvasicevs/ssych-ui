import { useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

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
  items,
  stage,
  defaultOpen = 0,
}: {
  items: AccordionItem[];
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
          <div key={i} className="border-t border-white/[0.08] first:border-t-0">
            <h3>
              <button
                type="button"
                id={`acc-tab-${i}`}
                aria-expanded={on}
                aria-controls={`acc-panel-${i}`}
                onClick={() => setActive(on ? -1 : i)}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-4 pt-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                  on ? "pb-2" : "pb-4"
                )}
              >
                <span className="flex items-center gap-3">
                  {Icon && (
                    <Icon
                      className={cn(
                        "h-5 w-5 shrink-0 text-white transition-opacity duration-300",
                        on ? "opacity-100" : "opacity-35"
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "text-[22px] font-bold leading-[1.1] transition-colors duration-300",
                      on ? "text-white" : "text-white/40 hover:text-white/60"
                    )}
                  >
                    {it.title}
                  </span>
                </span>
                <CaretDown
                  className={cn(
                    "h-5 w-5 shrink-0 transition-transform duration-300",
                    on ? "rotate-180 text-white" : "text-white/40"
                  )}
                />
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {on && (
                <motion.section
                  key="panel"
                  id={`acc-panel-${i}`}
                  role="region"
                  aria-labelledby={`acc-tab-${i}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 gap-6 pb-6 lg:grid-cols-2 lg:items-center lg:gap-10">
                    {/* left — body + deliverables */}
                    <div>
                      <p className="max-w-xl text-[14px] font-light leading-[1.55] text-white/45">{it.body}</p>
                      {it.deliverables && it.deliverables.length > 0 && (
                        <ul className="mt-5 flex flex-col gap-2.5">
                          {it.deliverables.map((d) => (
                            <li key={d} className="flex items-start gap-2.5 text-[13px] leading-snug text-white/55">
                              <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.03]">
                                <Check className="h-4 w-4 text-white opacity-70" />
                              </span>
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* right — visual */}
                    {stage && <div className="relative">{stage(i)}</div>}
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
