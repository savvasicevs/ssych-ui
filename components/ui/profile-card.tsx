"use client"

import { useId, useState } from "react"
import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import { Calendar, Link as LinkIcon, MapPin } from "lucide-react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const ACCENT: [number, number, number] = [72, 159, 250]
const accentRgba = (a: number) => `rgba(${ACCENT[0]},${ACCENT[1]},${ACCENT[2]},${a})`

export interface ProfilePost {
  /** relative age, already formatted — the card never guesses "now" */
  age: string
  body: string
  replies: number
  reposts: number
  likes: number
  pinned?: boolean
}

export interface ProfileTab {
  label: string
  posts: ProfilePost[]
}

/* generic-by-design demo copy, deterministic counts */
const DEFAULT_TABS: ProfileTab[] = [
  {
    label: "Posts",
    posts: [
      {
        age: "2h",
        pinned: true,
        body: "Shipped the density pass: every table row lost 4px and gained a hover state. Same data, half the scrolling.",
        replies: 12,
        reposts: 38,
        likes: 214,
      },
      {
        age: "1d",
        body: "A meter without its limit drawn is decoration. Put the threshold on the track and the number becomes a decision.",
        replies: 5,
        reposts: 61,
        likes: 340,
      },
      {
        age: "3d",
        body: "Reminder that an empty state and a zero are different things, and a dashboard that renders them the same way is lying to someone.",
        replies: 9,
        reposts: 22,
        likes: 178,
      },
    ],
  },
  {
    label: "Replies",
    posts: [
      {
        age: "4h",
        body: "Agreed on the easing. Long travel wants a symmetric curve; anything settling into place wants expo-out.",
        replies: 2,
        reposts: 3,
        likes: 41,
      },
      {
        age: "2d",
        body: "We measured it: 38ms median round trip. The perceived lag was the spinner, not the request.",
        replies: 4,
        reposts: 7,
        likes: 96,
      },
    ],
  },
  {
    label: "Media",
    posts: [
      {
        age: "5d",
        body: "Before and after of the risk panel. The limit ticks are the whole change.",
        replies: 7,
        reposts: 18,
        likes: 260,
      },
    ],
  },
]

const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K` : String(n)

/**
 * A profile the way a follow decision actually gets made: the cover sets the
 * tone, the counts sit where the eye lands, and the tabs glide rather than
 * cut. Follow flips to a quieter state so the button stops competing once the
 * decision is made.
 */
export function ProfileCard({
  name = "Sample Studio",
  handle = "sample_studio",
  bio = "Design system and front-end for information-dense products. Notes on interfaces that hold up when the stakes are real.",
  location = "Remote, worldwide",
  site = "ssych.com",
  joined = "Joined June 2025",
  following = 48,
  followers = 4520,
  tabs = DEFAULT_TABS,
  className,
}: {
  name?: string
  /** without the @, which the card adds */
  handle?: string
  bio?: string
  location?: string
  site?: string
  joined?: string
  following?: number
  followers?: number
  tabs?: ProfileTab[]
  className?: string
}) {
  const reduced = useReducedMotion()
  const uid = useId()
  const [tab, setTab] = useState(0)
  const [on, setOn] = useState(false)

  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")

  return (
    <div
      className={cn(
        "w-full max-w-[520px] overflow-hidden rounded-xl border border-foreground/[0.04]",
        className,
      )}
      style={{
        background: "var(--card)",
        boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 4%, transparent)",
      }}
    >
      {/* cover — accent family only, so it never turns into a second brand colour */}
      <div className="relative h-24">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(120deg, ${accentRgba(0.26)} 0%, ${accentRgba(0.06)} 52%, transparent 100%)`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(color-mix(in srgb, var(--foreground) 5%, transparent) 1px, transparent 1px) 0 0 / 14px 14px",
          }}
        />
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-end justify-between gap-3">
          {/* the avatar overlaps the cover, which is what makes the header read as one object */}
          <div
            className="-mt-8 grid h-16 w-16 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-foreground/80"
            style={{
              background: "color-mix(in srgb, var(--foreground) 6%, transparent)",
              border: "3px solid var(--card)",
              boxShadow: "inset 0 1px 0 0 color-mix(in srgb, var(--foreground) 6%, transparent)",
            }}
          >
            {initials}
          </div>

          <button
            type="button"
            aria-pressed={on}
            onClick={() => setOn((v) => !v)}
            className={cn(
              "rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors duration-150",
              on
                ? "border border-foreground/[0.08] text-foreground/60 hover:text-foreground/85"
                : "text-[var(--on-accent,#0b0e15)]",
            )}
            style={on ? undefined : { background: accentRgba(0.9) }}
          >
            {on ? "Following" : "Follow"}
          </button>
        </div>

        <div className="mt-2.5">
          <p className="text-[13px] font-medium text-foreground/85">{name}</p>
          <p className="mt-0.5 text-[11px] text-foreground/45">@{handle}</p>
        </div>

        <p className="mt-2.5 text-[12px] leading-[1.5] text-foreground/70">{bio}</p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-foreground/45">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {location}
          </span>
          <span className="inline-flex items-center gap-1">
            <LinkIcon className="h-3 w-3" />
            <span style={{ color: accentRgba(0.9) }}>{site}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {joined}
          </span>
        </div>

        <div className="mt-2.5 flex items-center gap-4 text-[11px]">
          <span className="text-foreground/45">
            <span className="text-[12px] font-medium tabular-nums text-foreground/85">
              {compact(following)}
            </span>{" "}
            Following
          </span>
          <span className="text-foreground/45">
            <span className="text-[12px] font-medium tabular-nums text-foreground/85">
              {compact(followers)}
            </span>{" "}
            Followers
          </span>
        </div>
      </div>

      {/* tabs — one gliding underline rather than a per-tab border */}
      <LayoutGroup id={uid}>
        <div
          role="tablist"
          aria-label="Profile sections"
          className="flex border-b border-foreground/[0.04] px-2"
        >
          {tabs.map((t, i) => {
            const active = i === tab
            return (
              <button
                key={t.label}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(i)}
                className={cn(
                  "relative px-3 py-2.5 text-[12px] transition-colors duration-150",
                  active ? "text-foreground/85" : "text-foreground/45 hover:text-foreground/70",
                )}
              >
                {t.label}
                {active && (
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute inset-x-2 -bottom-px h-[2px] rounded-full"
                    style={{ background: accentRgba(0.9) }}
                    transition={reduced ? { duration: 0 } : { duration: 0.32, ease: EASE }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </LayoutGroup>

      <ul>
        {tabs[tab].posts.map((p, i) => (
          <li
            key={p.body}
            className={cn(
              "px-4 py-3 transition-colors duration-150 hover:bg-foreground/[0.02]",
              i > 0 && "border-t border-foreground/[0.04]",
            )}
          >
            {p.pinned && (
              <p className="mb-1.5 text-[10px] uppercase tracking-[0.1em] text-foreground/30">
                Pinned
              </p>
            )}
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12px] font-medium text-foreground/85">{name}</span>
              <span className="text-[11px] text-foreground/40">
                @{handle} · {p.age}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-[1.5] text-foreground/70">{p.body}</p>
            <div className="mt-2 flex items-center gap-5 text-[10.5px] tabular-nums text-foreground/40">
              <span>{compact(p.replies)} replies</span>
              <span>{compact(p.reposts)} reposts</span>
              <span>{compact(p.likes)} likes</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
