import { useState, useMemo, useCallback, createElement, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import { GalleryModal, type MediaItemType } from "@/components/ui/interactive-bento-gallery";

export interface CardData {
  id: string;
  title: string;
  description: string;
  icon?: ReactNode;
  color?: string;
  image?: string;
  video?: string;
  span?: string;
}

/** Map project cards to the bento/gallery media-item shape. */
export function cardsToMediaItems(cards: CardData[]): MediaItemType[] {
  return cards.map((c, i) => ({
    id: i + 1,
    type: "image",
    title: c.title,
    desc: c.description,
    url: c.image || c.video || "",
    span: c.span || "md:col-span-1 md:row-span-2",
    poster: c.image,
  }));
}

/**
 * Shared "click a card → open the details modal (+ floating dock)" wiring used
 * by every layout. Returns an `open(id)` handler and the `modal` element.
 */
export function useProjectDetails(cards: CardData[]) {
  const [selectedItem, setSelectedItem] = useState<MediaItemType | null>(null);
  const mediaItems = useMemo(() => cardsToMediaItems(cards), [cards]);

  const open = useCallback(
    (id: string) => {
      const idx = cards.findIndex((c) => c.id === id);
      if (idx >= 0) setSelectedItem(mediaItems[idx]);
    },
    [cards, mediaItems]
  );

  const modal = createElement(
    AnimatePresence,
    null,
    selectedItem &&
      createElement(GalleryModal, {
        key: "project-details",
        selectedItem,
        isOpen: true,
        onClose: () => setSelectedItem(null),
        setSelectedItem,
        mediaItems,
      })
  );

  return { open, modal };
}
