import { useState, type ComponentType } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CaretDown, SidebarSimple, GithubLogo, XLogo, LinkedinLogo } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type IconCmp = ComponentType<{ className?: string }>;

export type SidebarItem = { label: string };
export type SidebarSection = { label: string; icon: IconCmp; items: SidebarItem[] };

const SOCIALS: { Icon: IconCmp; href: string; label: string }[] = [
  { Icon: GithubLogo, href: "https://github.com/savvasicevs", label: "GitHub" },
  { Icon: XLogo, href: "https://x.com/savvasicevs", label: "X" },
  { Icon: LinkedinLogo, href: "https://www.linkedin.com/in/savvasicevsdesign/", label: "LinkedIn" },
];

/** Accordion section: icon'd header (toggles) + indented links with an active rail. */
function NavSection({
  section,
  active,
  onSelect,
}: {
  section: SidebarSection;
  active: string;
  onSelect: (label: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const Icon = section.icon;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group/sec flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-white/55 transition-colors group-hover/sec:text-white/80" />
        <span className="flex-1 text-[13px] font-medium tracking-tight text-white/85">{section.label}</span>
        <CaretDown
          className={cn("h-3.5 w-3.5 text-white/35 transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <ul className="ml-[15px] mt-0.5 border-l border-white/[0.07] pb-1">
              {section.items.map((it) => {
                const on = it.label === active;
                return (
                  <li key={it.label}>
                    <button
                      type="button"
                      onClick={() => onSelect(it.label)}
                      className={cn(
                        "relative block w-full py-1.5 pl-5 text-left text-[13px] transition-colors",
                        on
                          ? "text-white before:absolute before:left-[-1px] before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-white before:content-['']"
                          : "text-white/45 hover:text-white/80"
                      )}
                    >
                      {it.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Collapsible accordion sidebar — the chrome of the SSICEVS UI library itself:
 * wordmark + collapse toggle, icon'd accordion sections, indented links with an
 * active rail, and socials in the footer. Collapses to a slim icon rail.
 */
export function Sidebar({ sections, activeLabel }: { sections: SidebarSection[]; activeLabel?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(activeLabel ?? sections[0]?.items[0]?.label ?? "");

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 264 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="h-[560px] shrink-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#070a12]"
    >
      {collapsed ? (
        <div className="flex h-full w-[68px] flex-col items-center px-3 py-5">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-[#5aaaff] to-[#2e7cd4]" />
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="mt-5 flex h-8 w-8 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <SidebarSimple className="h-[18px] w-[18px]" />
          </button>
          <div className="mt-4 flex flex-col gap-1.5">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <span key={s.label} className="flex h-8 w-8 items-center justify-center text-white/45">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex h-full w-[264px] flex-col px-4 py-5">
          <div className="flex items-center justify-between gap-2">
            <img src="/assets/wordmark.svg" alt="SSICEVS" className="h-[18px] w-auto select-none" draggable={false} />
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/80"
            >
              <SidebarSimple className="h-[18px] w-[18px]" />
            </button>
          </div>

          <nav className="mt-6 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
            {sections.map((s) => (
              <NavSection key={s.label} section={s} active={active} onSelect={setActive} />
            ))}
          </nav>

          <div className="mt-4 flex items-center gap-1 border-t border-white/[0.05] pt-4">
            {SOCIALS.map(({ Icon, href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                <Icon className="h-[18px] w-[18px]" />
              </a>
            ))}
          </div>
        </div>
      )}
    </motion.aside>
  );
}
