"use client"

import { useEffect, useId, useRef, useState } from "react"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { SEGMENT_OFF, THUMB, TRACK } from "@/components/ui/control-classes"

/* Release Feed, promoted from a lab sketch through ssych-component (2026-09-29).
   What it is for: a changelog, newest first, where every line says whether it was added,
   changed or fixed.
   Read first: the version numbers down the rail, then the notes under each.
   The pointer: point at a release and the others dim. Point at one of the three kinds
   in the top corner and only notes of that kind keep their ink; press it to hold that
   filter. Press a version to copy it; the word "copied" answers in its place.
   Lab sketch: src/components/lab/ReleaseFeed.tsx. Kept: the rail with a node per release,
   version and date on one line, a kind in front of every note, copy on press. Changed: the
   kinds were green, blue and amber chips; each has its own hue, --chart-1, --chart-5 and
   --chart-3 (2026-09-30), shown as a dot since 2026-10-02, since three kinds down one list must be told apart
   and a kind has no direction to give it green or red. The counts per kind and the filter are new. Node rings, the copy
   and check icons are gone.
   2026-10-02: the filter at the top is the segmented control's material (his call: the
   pill like selectable pills looked weird). All, Added, Changed and Fixed sit in one
   hairline track, the one that is on carries the thumb, each kind has its hue only as a
   6px dot and its count after the name at 45%; pointing at a kind still dims the others,
   pressing one holds it and All lets go. The kind in front of each note is quiet the same
   way: a 6px dot in its hue and the word at 60%, 10.5px, no coloured text.
   Formulas:
   · added, changed, fixed = count of notes of that kind over every release (2, 2, 1)
   · notes                 = Σ notes per release (2 + 2 + 1 = 5)
   2026-10-02 audit: the filter reads its material from control-classes instead of a flat 8%
   copy, so its thumb turns white on a raised light surface, and its options are the 28px
   control height. Pointing at a version now says Copy beside its date before the press and
   Copied after it, so the press is no longer a surprise. The kind on each note is written
   as the filter writes it (Added, Changed, Fixed), the date sits at 10.5px /45, and the
   width is 440 like the other AI and operations lists.
   2026-10-02 round 2: the sample is an exchange API changelog in place of the library's
   own: SOL-PERP and TAO-PERP markets, the order rate limit raised to 20 a second, gaps in
   websocket book snapshots fixed, funding settlement times, a batch order endpoint. The
   counts hold at 2 added, 2 changed, 1 fixed over 5 notes. */

const EASE = [0.16, 1, 0.3, 1] as const
/** the segmented control's tween: 250ms, smooth-out */
const TAB_EASE = [0.22, 1, 0.36, 1] as const


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
    version: "2.14.0",
    date: "Sep 30",
    notes: [
      { kind: "added", text: "SOL-PERP and TAO-PERP markets, up to 20× leverage." },
      { kind: "changed", text: "Order rate limit raised to 20 requests a second per key." },
    ],
  },
  {
    version: "2.13.2",
    date: "Sep 24",
    notes: [
      { kind: "fixed", text: "Gaps in websocket book snapshots after a reconnect." },
      { kind: "changed", text: "Funding settles every 8 hours, at 00:00, 08:00 and 16:00 UTC." },
    ],
  },
  {
    version: "2.13.0",
    date: "Sep 17",
    notes: [{ kind: "added", text: "Batch order endpoint: up to 10 orders in one call." }],
  },
]

const KINDS: ReleaseKind[] = ["added", "changed", "fixed"]
const NAME: Record<ReleaseKind, string> = { added: "Added", changed: "Changed", fixed: "Fixed" }
/** one hue per kind, in the house order; it shows only as a 6px dot, in the filter and on each note */
const HUE: Record<ReleaseKind, string> = {
  added: "var(--chart-1)",
  changed: "var(--chart-5)",
  fixed: "var(--chart-3)",
}

function Dot({ kind, className }: { kind: ReleaseKind; className?: string }) {
  return <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", className)} style={{ background: HUE[kind] }} />
}

/**
 * A changelog in the Linear register: versions on a hairline rail, each note led by its
 * kind. Pointing at a release or at a kind dims everything else; pressing a version
 * copies it.
 */
export function ReleaseFeed({ releases = DEFAULT_RELEASES, title = "API changelog", onCopy, className }: ReleaseFeedProps) {
  const reduced = useReducedMotion()
  const uid = useId()
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
    <div className={cn("w-[440px] max-w-full tabular-nums", className)} role="group" aria-label={`${title}, ${releases.length} releases, ${notes.length} notes`}>
      <div className="flex justify-end pb-4">
        {/* the segmented control's material: one track, the thumb on the held kind (All when none) */}
        <div role="group" aria-label="Show notes of one kind" className={cn("inline-flex items-center gap-0.5", TRACK)} onPointerLeave={() => setPeek(null)}>
          {([null, ...KINDS] as (ReleaseKind | null)[]).map((k) => {
            const on = held === k
            return (
              <button
                key={k ?? "all"}
                type="button"
                aria-pressed={on}
                aria-label={k ? `${NAME[k]}, ${count(k)} notes, show only these` : `All, ${notes.length} notes`}
                onPointerEnter={() => setPeek(k)}
                onFocus={() => setPeek(k)}
                onBlur={() => setPeek(null)}
                onClick={() => setHeld(k)}
                className={cn(
                  "group relative h-7 rounded-full px-3 text-[11.5px] outline-none transition-colors duration-200 focus-visible:text-foreground/90",
                  on ? "text-foreground/90" : SEGMENT_OFF,
                )}
              >
                {on && (
                  <motion.span
                    aria-hidden
                    layoutId={`${uid}-kind`}
                    className={cn("absolute inset-0 rounded-full", THUMB)}
                    transition={reduced ? { duration: 0 } : { duration: 0.25, ease: TAB_EASE }}
                  />
                )}
                <span className="relative flex items-center gap-1.5 transition-transform duration-150 group-active:scale-[0.97] motion-reduce:transition-none motion-reduce:group-active:scale-100">
                  {k ? <Dot kind={k} /> : null}
                  {k ? NAME[k] : "All"}
                  {k ? <span className="text-foreground/45">{count(k)}</span> : null}
                </span>
              </button>
            )
          })}
        </div>
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
                  className="group/version -mx-1.5 flex items-baseline gap-2.5 rounded-[8px] px-1.5 py-0.5 text-left outline-none transition-[background-color,transform,translate,scale,rotate] duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] active:scale-[0.97] motion-reduce:active:scale-100"
                >
                  <span className="text-[13px] font-medium text-foreground/90">v{r.version}</span>
                  <span className="text-[10.5px] text-foreground/45">{r.date}</span>
                  {/* the hint: Copy while pointed or focused, then Copied after the press (4px, 2px blur, 150ms) */}
                  <span
                    role="status"
                    className={cn(
                      "text-[10.5px] transition-opacity duration-150 group-hover/version:opacity-100 group-focus-visible/version:opacity-100",
                      copied === r.version ? "text-foreground/90 opacity-100" : "text-foreground/45 opacity-0",
                    )}
                  >
                    <motion.span
                      key={copied === r.version ? "copied" : "copy"}
                      className="inline-block"
                      initial={reduced ? false : { opacity: 0, y: 4, filter: "blur(2px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 0.15, ease: EASE }}
                    >
                      {copied === r.version ? "Copied" : "Copy"}
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
                      <span className="w-[60px] shrink-0 text-[10.5px] text-foreground/60">
                        <Dot kind={n.kind} className="mr-1.5 inline-block align-[1px]" />
                        {NAME[n.kind]}
                      </span>
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
