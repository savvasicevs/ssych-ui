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

const SPRING = { type: "spring", stiffness: 400, damping: 30 } as const
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
 *  data; a still becomes an ambient field (its poster, over-scaled and blurred). */
function Media({ item, className, onClick }: { item: MediaItemType; className?: string; onClick?: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [waiting, setWaiting] = useState(true)

  useEffect(() => {
    const el = video.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) el.play().catch(() => undefined)
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
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/30 border-t-white" />
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
  const lift = reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }

  return (
    <>
      {/* blur: the grid the view opened from stays recognisable behind the scrim, so the
          view reads as on top of your place in the grid */}
      <motion.div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={t({ duration: 0.2 })}
        onClick={onClose}
      />

      <motion.div
        className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2"
        initial={{ opacity: 0, y: reduced ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : 16 }}
        transition={t(SPRING)}
      >
        <MacOsDock
          activeIds={[String(selectedItem.id)]}
          items={mediaItems.map((m) => ({
            id: String(m.id),
            label: m.title,
            icon: <img src={m.poster || m.url} alt="" draggable={false} className="h-full w-full rounded-[10px] object-cover" />,
          }))}
          onSelect={(app) => setSelectedItem(mediaItems.find((m) => String(m.id) === app.id) ?? selectedItem)}
        />
      </motion.div>

      <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
        <motion.article
          aria-label={selectedItem.title}
          className="pointer-events-auto relative w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          initial={lift}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={lift}
          transition={t(SPRING)}
          onClick={(e) => e.stopPropagation()}
        >
          {/* blur: the clip keeps playing under this button, so a flat disc would read as a dead patch */}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-foreground/10 bg-black/40 text-foreground backdrop-blur transition-colors hover:bg-black/70"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative aspect-[16/9] w-full bg-black">
            <AnimatePresence mode="wait">
              <motion.div key={selectedItem.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t({ duration: 0.2 })}>
                <Media item={selectedItem} className="h-full w-full" />
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={selectedItem.id}
              className="p-5 sm:p-7"
              initial={{ opacity: 0, y: reduced ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -8 }}
              transition={t({ duration: 0.2 })}
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
      <AnimatePresence mode="wait">
        {open ? (
          <GalleryModal key="open" isOpen mediaItems={order} selectedItem={open} setSelectedItem={setOpen} onClose={() => setOpen(null)} />
        ) : (
          <motion.ul key="grid" className="grid auto-rows-[96px] grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-4" initial="out" animate="in" exit="out">
            {order.map((item, i) => (
              <motion.li
                key={item.id}
                layoutId={`media-${item.id}`}
                className={cn("relative cursor-move overflow-hidden rounded-xl", item.span)}
                variants={{
                  out: reduced ? { opacity: 0 } : { opacity: 0, y: 50, scale: 0.9 },
                  in: { opacity: 1, y: 0, scale: 1, transition: reduced ? { duration: 0 } : { type: "spring", stiffness: 350, damping: 25, delay: i * 0.05 } },
                }}
                whileHover={reduced ? undefined : { scale: 1.02 }}
                drag
                dragElastic={1}
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                onDragStart={() => (dragging.current = true)}
                onDragEnd={drop(i)}
                onClick={() => pick(item)}
              >
                <Media item={item} className="absolute inset-0 h-full w-full" onClick={() => pick(item)} />
                <motion.div
                  className="absolute inset-0 flex flex-col justify-end p-2 sm:p-3 md:p-4"
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.2 }}
                >
                  <span aria-hidden className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-transparent" />
                  <h3 className="relative line-clamp-1 text-[12px] font-medium text-foreground sm:text-[14px] md:text-[16px]">{item.title}</h3>
                  <p className="relative mt-0.5 line-clamp-2 text-[10px] text-foreground/70 sm:text-[12px] md:text-[14px]">{item.desc}</p>
                </motion.div>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
