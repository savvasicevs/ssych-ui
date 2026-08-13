"use client"

import { useEffect, useState, type ComponentType } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, PanelLeft, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

type IconCmp = ComponentType<{ className?: string }>;

export type SidebarItem = {
  label: string;
  /** when set, the item renders as a real link and "active" follows the page's
   *  activeLabel prop instead of internal state — dashboard navigation rather
   *  than demo state */
  href?: string;
};
export type SidebarSection = { label: string; icon: IconCmp; items: SidebarItem[] };

// Brand marks are inlined — lucide dropped brand logos, and a registry component
// should carry its own glyphs rather than pull a second icon package.
const GithubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 22 12c0-5.52-4.48-10-10-10Z" />
  </svg>
);
const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.01 4.13H5.04l12.04 15.64Z" />
  </svg>
);
const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13Zm1.78 13.02H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
  </svg>
);

const SOCIALS: { Icon: IconCmp; href: string; label: string }[] = [
  { Icon: GithubIcon, href: "https://github.com/savvasicevs", label: "GitHub" },
  { Icon: XIcon, href: "https://x.com/savvasicevs", label: "X" },
  { Icon: LinkedinIcon, href: "https://www.linkedin.com/in/savvasicevsdesign/", label: "LinkedIn" },
];

/** Reactive matchMedia — drives the mobile hamburger/drawer mode. */
function useIsMobile(query = "(max-width: 767px)") {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return mobile;
}

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
        className="group/sec flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <Icon className="h-[18px] w-[18px] shrink-0 text-foreground/55 transition-colors group-hover/sec:text-foreground/80" />
        <span className="flex-1 text-[13px] font-medium tracking-tight text-foreground/85">{section.label}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-foreground/35 transition-transform duration-200", open ? "rotate-0" : "-rotate-90")}
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
            <ul className="ml-[15px] mt-0.5 border-l border-foreground/[0.07] pb-1">
              {section.items.map((it) => {
                const on = it.label === active;
                return (
                  <li key={it.label}>
                    {it.href ? (
                      <a
                        href={it.href}
                        aria-current={on ? "page" : undefined}
                        onClick={() => onSelect(it.label)}
                        className={cn(
                          "relative block w-full py-1.5 pl-5 text-left text-[13px] transition-colors",
                          on
                            ? "text-foreground before:absolute before:left-[-1px] before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-foreground before:content-['']"
                            : "text-foreground/50 hover:text-foreground/80"
                        )}
                      >
                        {it.label}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelect(it.label)}
                        className={cn(
                          "relative block w-full py-1.5 pl-5 text-left text-[13px] transition-colors",
                          on
                            ? "text-foreground before:absolute before:left-[-1px] before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-foreground before:content-['']"
                            : "text-foreground/50 hover:text-foreground/80"
                        )}
                      >
                        {it.label}
                      </button>
                    )}
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
 * Collapsible accordion sidebar — the chrome of the ssych ui library itself:
 * wordmark + collapse toggle, icon'd accordion sections, indented links with an
 * active rail, and socials in the footer.
 *
 * Responsive: on desktop it collapses to a slim icon rail (264 ↔ 68); on mobile
 * (< md) it becomes a hamburger button that opens the nav as a slide-in drawer.
 */
export function Sidebar({ sections, activeLabel }: { sections: SidebarSection[]; activeLabel?: string }) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [active, setActive] = useState(activeLabel ?? sections[0]?.items[0]?.label ?? "");
  useEffect(() => {
    if (activeLabel) setActive(activeLabel);
  }, [activeLabel]);

  const select = (label: string, close: boolean) => {
    setActive(label);
    if (close) setDrawerOpen(false);
  };

  // The full expanded panel — shared by the desktop sidebar and the mobile drawer.
  const panel = (onClose?: () => void) => (
    <div className="flex h-full w-[264px] flex-col px-4 py-5">
      <div className="flex items-center justify-between gap-2">
        <img src="/assets/wordmark.svg" alt="ssych" className="h-[24px] w-auto select-none" draggable={false} />
        <button
          type="button"
          onClick={onClose ?? (() => setCollapsed(true))}
          aria-label={onClose ? "Close navigation" : "Collapse sidebar"}
          className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/40 transition-colors hover:bg-foreground/[0.05] hover:text-foreground/80"
        >
          {onClose ? <X className="h-[18px] w-[18px]" /> : <PanelLeft className="h-[18px] w-[18px]" />}
        </button>
      </div>

      <nav className="mt-6 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {sections.map((s) => (
          <NavSection key={s.label} section={s} active={active} onSelect={(l) => select(l, !!onClose)} />
        ))}
      </nav>

      <div className="mt-4 flex items-center gap-1 border-t border-foreground/[0.05] pt-4">
        {SOCIALS.map(({ Icon, href, label }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={label}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/40 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <Icon className="h-[18px] w-[18px]" />
          </a>
        ))}
      </div>
    </div>
  );

  // Mobile: a hamburger button that reveals the nav as a slide-in drawer.
  if (isMobile) {
    return (
      <div className="relative flex h-[560px] w-full flex-col overflow-hidden rounded-2xl border border-foreground/[0.06] bg-[var(--surface-soft)]">
        <div className="flex items-center gap-3 border-b border-foreground/[0.05] px-3 py-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-foreground/[0.08] text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img src="/assets/wordmark.svg" alt="ssych" className="h-[18px] w-auto select-none" draggable={false} />
        </div>

        <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-foreground/30">
          Tap the menu to open navigation
        </div>

        <AnimatePresence>
          {drawerOpen && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDrawerOpen(false)}
                className="absolute inset-0 z-40 bg-background/60 backdrop-blur-sm"
              />
              <motion.aside
                key="drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                className="absolute inset-y-0 left-0 z-50 border-r border-foreground/[0.06] bg-[var(--surface-soft)]"
              >
                {panel(() => setDrawerOpen(false))}
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Desktop: collapsible accordion sidebar (264 ↔ 68).
  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 264 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="h-[560px] shrink-0 overflow-hidden rounded-2xl border border-foreground/[0.06] bg-[var(--surface-soft)]"
    >
      {collapsed ? (
        <div className="flex h-full w-[68px] flex-col items-center px-3 py-5">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-[#5aaaff] to-[#2e7cd4]" />
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="mt-5 flex h-8 w-8 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <PanelLeft className="h-[18px] w-[18px]" />
          </button>
          <div className="mt-4 flex flex-col gap-1.5">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <span key={s.label} className="flex h-8 w-8 items-center justify-center text-foreground/50">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        panel()
      )}
    </motion.aside>
  );
}
