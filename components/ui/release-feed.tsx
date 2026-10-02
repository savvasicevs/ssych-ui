"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/* Release Feed, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: a changelog, newest first, where every line says whether it was added,
   changed or fixed.
   Read first: the version numbers down the rail, then the notes under each.
   The pointer: point at a release and the others dim. Point at one of the three kinds
   in the top corner and only notes of that kind keep their ink; press it to hold that
   filter. Press a version to copy it; the word "copied" answers in its place.
   Lab sketch: src/components/lab/ReleaseFeed.tsx. Kept: the rail with a node per release,
   version and date on one line, a kind in front of every note, copy on press. Changed: the
   kinds were green, blue and amber chips; they are words in their own hue, --chart-1,
   --chart-5 and --chart-3 (2026-09-30), since three kinds down one list must be told apart
   and a kind has no direction to give it green or red. The counts per kind and the filter are new. Node rings, the copy
   and check icons are gone.
   Formulas:
   · added, changed, fixed = count of notes of that kind over every release (2, 2, 1)
   · notes                 = Σ notes per release (2 + 2 + 1 = 5) */

const EASE = [0.16, 1, 0.3, 1] as const

export type ReleaseKind = "added" | "changed" | "fixed"

export interface ReleaseNote {
  kind: ReleaseKind
  text: string
}

export interface Release {
  version: string
  date: string
  notes: ReleaseNote[]
}

export interface ReleaseFeedProps {
  releases?: Release[]
  /** names the feed for screen readers; the versions say what it is on screen */
  title?: string
  onCopy?: (version: string) => void
  className?: string
}

const DEFAULT_RELEASES: Release[] = [
  {
    version: "0.4.0",
    date: "Jul 11",
    notes: [
      { kind: "added", text: "Metrics, atoms and console groups: 30 new components." },
      { kind: "changed", text: "Every outline is one step fainter." },
    ],
  },
  {
    version: "0.3.2",
    date: "Jul 8",
    notes: [
      { kind: "fixed", text: "Copying the source of a locked component while signed in." },
      { kind: "changed", text: "Bundles now inline their registry dependencies." },
    ],
  },
  {
    version: "0.3.0",
    date: "Jul 2",
    notes: [{ kind: "added", text: "Resizable preview stage with pointer capture." }],
  },
]

const KINDS: ReleaseKind[] = ["added", "changed", "fixed"]
/** one hue per kind, in the house order; the same hue marks its count in the top corner */
const HUE: Record<ReleaseKind, string> = {
  added: "var(--chart-1)",
  changed: "var(--chart-5)",
  fixed: "var(--chart-3)",
}
/** A hue as text: its lightness is capped in the light theme so small words stay readable. */
const ink = (c: string) => `oklch(from ${c} min(l, var(--ink-l, 1)) c h)`

/**
 * A changelog in the Linear register: versions on a hairline rail, each note led by its
 * kind. Pointing at a release or at a kind dims everything else; pressing a version
 * copies it.
 */
export function ReleaseFeed({ releases = DEFAULT_RELEASES, title = "Changelog", onCopy, className }: ReleaseFeedProps) {
  const reduced = useReducedMotion()
  const [hot, setHot] = useState<string | null>(null)
  const [peek, setPeek] = useState<ReleaseKind | null>(null)
  const [held, setHeld] = useState<ReleaseKind | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const kind = peek ?? held
  const notes = releases.flatMap((r) => r.notes)
  const count = (k: ReleaseKind) => notes.filter((n) => n.kind === k).length

  const copy = (version: string) => {
    void navigator.clipboard?.writeText(`v${version}`).catch(() => {})
    onCopy?.(version)
    setCopied(version)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(null), 1300)
  }

  return (
    <div className={cn("w-full max-w-[420px] tabular-nums [--ink-l:0.5] dark:[--ink-l:1]", className)} role="group" aria-label={`${title}, ${releases.length} releases, ${notes.length} notes`}>
      <div className="flex justify-end pb-4">
        <span className="flex items-center gap-0.5" onPointerLeave={() => setPeek(null)}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={held === k}
              aria-label={`${count(k)} ${k}, show only these`}
              onPointerEnter={() => setPeek(k)}
              onFocus={() => setPeek(k)}
              onBlur={() => setPeek(null)}
              onClick={() => setHeld((h) => (h === k ? null : k))}
              className={cn(
                "rounded-full px-2 py-1 text-[10.5px] outline-none transition-[color,background-color,transform,translate,scale,rotate] duration-150 hover:text-foreground/90 focus-visible:bg-foreground/[0.06] active:scale-[0.97] motion-reduce:active:scale-100",
                held === k ? "bg-foreground/[0.08] text-foreground/90" : "text-foreground/45",
              )}
            >
              {count(k)} <span style={{ color: ink(HUE[k]) }}>{k}</span>
            </button>
          ))}
        </span>
      </div>

      <div className="relative" onPointerLeave={() => setHot(null)}>
        <span aria-hidden className="absolute bottom-2 left-[3px] top-2 w-px bg-foreground/[0.06]" />
        <div className="flex flex-col gap-6">
          {releases.map((r, i) => (
            /* the outer wrapper owns the dim so it never fights the entrance inside */
            <div
              key={r.version}
              onPointerEnter={() => setHot(r.version)}
              className="transition-opacity duration-200 motion-reduce:transition-none"
              style={{ opacity: hot !== null && hot !== r.version ? 0.45 : 1 }}
            >
              <motion.div
                className="relative pl-6"
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: i * 0.035 }}
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-[7px] h-[7px] w-[7px] rounded-full"
                  style={{ background: `color-mix(in srgb, var(--foreground) ${i === 0 ? 90 : 30}%, var(--background))` }}
                />
                <button
                  type="button"
                  onClick={() => copy(r.version)}
                  onFocus={() => setHot(r.version)}
                  onBlur={() => setHot(null)}
                  aria-label={`Copy v${r.version}, released ${r.date}`}
                  className="-mx-1.5 flex items-baseline gap-2.5 rounded-[4px] px-1.5 py-0.5 text-left outline-none transition-[background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  <span className="text-[13px] font-medium text-foreground/90">v{r.version}</span>
                  <span role="status" className="text-[10px] text-foreground/35">
                    {/* "copied" swaps in for the date and back: 4px, 2px blur, 150ms */}
                    <motion.span
                      key={copied === r.version ? "copied" : "date"}
                      className="inline-block"
                      initial={reduced ? false : { opacity: 0, y: 4, filter: "blur(2px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.15, ease: EASE }}
                    >
                      {copied === r.version ? "copied" : r.date}
                    </motion.span>
                  </span>
                </button>
                <div className="mt-2 flex flex-col gap-1.5">
                  {r.notes.map((n) => (
                    <div
                      key={n.text}
                      className="flex items-baseline gap-2.5 transition-opacity duration-200 motion-reduce:transition-none"
                      style={{ opacity: kind !== null && kind !== n.kind ? 0.35 : 1 }}
                    >
                      <span className="w-[48px] shrink-0 text-[10.5px] font-medium" style={{ color: ink(HUE[n.kind]) }}>{n.kind}</span>
                      <span className="text-[12px] leading-snug text-foreground/70">{n.text}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
