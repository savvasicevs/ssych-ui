// provenance: original
"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react"
import { X } from "lucide-react"

import { MacOsDock } from "@/components/ui/mac-os-dock"
import { cn } from "@/lib/utils"

/** One tile: a looping clip (type "video") or a still whose poster is shown as a
 *  blurred colour field. `span` is the tile's grid classes, e.g. "md:col-span-2 row-span-3". */
export type MediaItemType = { id: number; type: string; title: string; desc: string; url: string; span: string; poster?: string }

const EASE = [0.16, 1, 0.3, 1] as const
/* the open view arrives on the house curve and leaves at about half the time */
const ENTER = { duration: 0.3, ease: EASE } as const
const LEAVE = { duration: 0.15, ease: EASE } as const
const pad2 = (n: number) => String(n).padStart(2, "0")

/** Move one item a single slot toward where it was dragged: right/down = later. */
function nudge<T>(list: T[], from: number, offset: number): T[] {
  if (Math.abs(offset) <= 50) return list
  const to = Math.min(list.length - 1, Math.max(0, from + Math.sign(offset)))
  if (to === from) return list
  const next = list.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** A clip plays only while it is on screen and shows a small ring while it waits for
 *  data; a still becomes an ambient field (its poster, over-scaled and blurred). `paused`
 *  holds a grid tile still while the open view covers it, so the full-screen backdrop blur
 *  is not recomputed for every frame of every tile under it. */
function Media({ item, className, onClick, paused = false }: { item: MediaItemType; className?: string; onClick?: () => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [waiting, setWaiting] = useState(true)
  const seen = useRef(false)
  const hold = useRef(paused)

  useEffect(() => {
    hold.current = paused
    const el = video.current
    if (!el) return
    if (paused) el.pause()
    else if (seen.current) el.play().catch(() => undefined)
  }, [paused])

  useEffect(() => {
    const el = video.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        seen.current = e.isIntersecting
        if (e.isIntersecting && !hold.current) el.play().catch(() => undefined)
        else el.pause()
      },
      { rootMargin: "50px", threshold: 0.1 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      el.pause()
    }
  }, [item.url])

  if (item.type !== "video") {
    return (
      <img
        src={item.poster || item.url}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className={cn(className, "scale-150 object-cover blur-[44px] saturate-[1.4] brightness-90")}
      />
    )
  }
  return (
    <div className={cn(className, "relative overflow-hidden")}>
      <video
        ref={video}
        src={item.url}
        muted
        loop
        playsInline
        preload="auto"
        onClick={onClick}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        className={cn("h-full w-full object-cover transition-opacity duration-200", waiting && "opacity-80")}
      />
      {waiting && (
        <span className="absolute inset-0 grid place-items-center bg-black/10">
          <span className="h-6 w-6 animate-spin rounded-full motion-reduce:animate-none border-2 border-foreground/30 border-t-white" />
        </span>
      )}
    </div>
  )
}

/** The open view of one tile: a scrim over the grid, the media and its text in a card,
 *  and a dock along the bottom to jump between tiles (a dot under the open one). */
export const GalleryModal = ({
  selectedItem,
  isOpen,
  onClose,
  setSelectedItem,
  mediaItems,
}: {
  selectedItem: MediaItemType
  isOpen: boolean
  onClose: () => void
  setSelectedItem: (item: MediaItemType | null) => void
  mediaItems: MediaItemType[]
}) => {
  const reduced = useReducedMotion()
  if (!isOpen) return null
  const t = (motionful: object) => (reduced ? { duration: 0 } : motionful)
  const at = mediaItems.findIndex((m) => m.id === selectedItem.id) + 1
  /* transform strings, not the x/y/scale shorthands, so the open and close run off the main thread */
  const lift = { opacity: 0, transform: reduced ? "translateY(0px) scale(1)" : "translateY(12px) scale(0.96)" }

  return (
    <>
      {/* blur: the grid the view opened from stays recognisable behind the scrim, so the
          view reads as on top of your place in the grid */}
      <motion.div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: t({ duration: 0.2, ease: EASE }) }}
        exit={{ opacity: 0, transition: t(LEAVE) }}
        onClick={onClose}
      />

      <motion.div
        className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2"
        initial={{ opacity: 0, transform: `translateY(${reduced ? 0 : 16}px)` }}
        animate={{ opacity: 1, transform: "translateY(0px)", transition: t({ ...ENTER, delay: 0.05 }) }}
        exit={{ opacity: 0, transform: `translateY(${reduced ? 0 : 8}px)`, transition: t(LEAVE) }}
      >
        <MacOsDock
          activeIds={[String(selectedItem.id)]}
          items={mediaItems.map((m) => ({
            id: String(m.id),
            label: m.title,
            icon: <img src={m.poster || m.url} alt="" draggable={false} className="h-full w-full rounded-[7.5px] object-cover" />,
          }))}
          onSelect={(app) => setSelectedItem(mediaItems.find((m) => String(m.id) === app.id) ?? selectedItem)}
        />
      </motion.div>

      <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
        <motion.article
          aria-label={selectedItem.title}
          className="pointer-events-auto relative w-full max-w-3xl overflow-hidden rounded-[12px] border border-border bg-card shadow-2xl"
          initial={lift}
          animate={{ opacity: 1, transform: "translateY(0px) scale(1)", transition: t(ENTER) }}
          exit={{ ...lift, transition: t(LEAVE) }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* blur: the clip keeps playing under this button, so a flat disc would read as a dead patch */}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-foreground/10 bg-black/40 text-foreground backdrop-blur transition-[background-color,scale] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-black/70 focus-visible:bg-black/70 active:scale-[0.96] motion-reduce:active:scale-100"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative aspect-[16/9] w-full bg-black">
            {/* both clips sit in the same box, so they cross-fade rather than dip to black */}
            <AnimatePresence initial={false}>
              <motion.div key={selectedItem.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t({ duration: 0.2, ease: EASE })}>
                <Media item={selectedItem} className="h-full w-full" />
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={selectedItem.id}
              className="p-5 sm:p-7"
              initial={{ opacity: 0, y: reduced ? 0 : 8 }}
              animate={{ opacity: 1, y: 0, transition: t({ duration: 0.2, ease: EASE }) }}
              exit={{ opacity: 0, y: reduced ? 0 : -4, transition: t({ duration: 0.12, ease: EASE }) }}
            >
              <p className="text-[12px] font-medium tabular-nums tracking-wider text-muted-foreground">
                {pad2(at)} / {pad2(mediaItems.length)}
              </p>
              <h3 className="mt-1.5 text-2xl font-semibold text-card-foreground sm:text-3xl">{selectedItem.title}</h3>
              <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground sm:text-[16px]">{selectedItem.desc}</p>
            </motion.div>
          </AnimatePresence>
        </motion.article>
      </div>
    </>
  )
}

/** A bento grid of projects. Tiles rise in one after another, lift a little under the
 *  pointer, show their title on hover, open into the gallery view on click, and can be
 *  dragged one slot earlier or later to reorder. */
export function InteractiveBentoGallery({ mediaItems = [], title = "", description = "" }: { mediaItems: MediaItemType[]; title: string; description: string }) {
  const reduced = useReducedMotion()
  const [open, setOpen] = useState<MediaItemType | null>(null)
  const [order, setOrder] = useState(mediaItems)
  // the stagger belongs to the first arrival only; after it a hover settles back at once.
  // It is capped at 8 steps, and the last staggered tile landing ends it.
  const [arrived, setArrived] = useState(false)
  const lastStep = Math.min(order.length - 1, 7)
  const dragging = useRef(false)
  const pick = (item: MediaItemType) => {
    if (!dragging.current) setOpen(item)
  }
  const drop = (i: number) => (_: unknown, info: PanInfo) => {
    setOrder((list) => nudge(list, i, info.offset.x + info.offset.y))
    /* the click that ends a drag must not open the tile */
    requestAnimationFrame(() => (dragging.current = false))
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      {(title || description) && (
        <header className="mb-8 text-center">
          {title && <h1 className="text-2xl font-semibold text-foreground sm:text-3xl md:text-4xl">{title}</h1>}
          {description && <p className="mt-2 text-[14px] text-muted-foreground sm:text-[16px]">{description}</p>}
        </header>
      )}
      {/* the grid stays put under the open view, so the scrim blurs your place in it and
          closing does not replay the entrance */}
      <AnimatePresence>
        {open && <GalleryModal key="open" isOpen mediaItems={order} selectedItem={open} setSelectedItem={setOpen} onClose={() => setOpen(null)} />}
      </AnimatePresence>
      <motion.ul className="grid auto-rows-[96px] grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-4" initial="out" animate="in">
        {order.map((item, i) => (
          <motion.li
            key={item.id}
            layoutId={`media-${item.id}`}
            className={cn("relative cursor-move overflow-hidden rounded-[9px]", item.span)}
            variants={{
              out: reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 },
              in: { opacity: 1, y: 0, scale: 1, transition: reduced ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: arrived ? 0 : Math.min(i, 7) * 0.05 } },
            }}
            whileHover={reduced ? undefined : { scale: 1.02, transition: { duration: 0.2, ease: EASE } }}
            transition={reduced ? { duration: 0 } : { layout: { type: "spring", stiffness: 400, damping: 32 } }}
            drag
            dragElastic={1}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            onDragStart={() => (dragging.current = true)}
            onDragEnd={drop(i)}
            onClick={() => pick(item)}
            onAnimationComplete={(def) => !arrived && def === "in" && i === lastStep && setArrived(true)}
          >
            <Media item={item} className="absolute inset-0 h-full w-full" onClick={() => pick(item)} paused={!!open} />
            <motion.div
              className="absolute inset-0 flex flex-col justify-end p-2 sm:p-3 md:p-4 [@media(hover:none)]:opacity-100!"
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE }}
            >
              <span aria-hidden className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-transparent" />
              <h3 className="relative line-clamp-1 text-[12px] font-medium text-foreground sm:text-[14px] md:text-[16px]">{item.title}</h3>
              <p className="relative mt-0.5 line-clamp-2 text-[10px] text-foreground/70 sm:text-[12px] md:text-[14px]">{item.desc}</p>
            </motion.div>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  )
}
