import { useMemo, useState, type KeyboardEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react"

import { cn } from "@/lib/utils"

const EASE = [0.16, 1, 0.3, 1] as const
const SPRING = { type: "spring", stiffness: 400, damping: 32 } as const
const ACCENT: [number, number, number] = [72, 159, 250]
const accentRgba = (a: number) => `rgba(${ACCENT.join(",")},${a})`
const ROW = 32

export interface FileTreeNode {
  /** what the row shows */
  name: string
  /** unique; selection and expansion are reported by it */
  path: string
  /** present on a folder, even an empty one */
  children?: FileTreeNode[]
  /** the quiet right-hand column: a line count, a size, a note */
  meta?: string
}

const countFiles = (node: FileTreeNode): number =>
  (node.children ?? []).reduce((n, c) => n + (c.children ? countFiles(c) : 1), 0)

/** Folders before files, both alphabetical, the way a repository listing reads.
 *  A folder with no meta of its own reports how many files it holds. */
export function treeFromPaths(files: { path: string; meta?: string }[]): FileTreeNode[] {
  const root: FileTreeNode[] = []
  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean)
    let level = root
    let acc = ""
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part
      const leaf = i === parts.length - 1
      let node = level.find((n) => n.path === acc)
      if (!node) {
        node = leaf ? { name: part, path: acc, meta: f.meta } : { name: part, path: acc, children: [] }
        level.push(node)
      }
      if (!leaf) level = node.children ?? (node.children = [])
    })
  }
  const finish = (nodes: FileTreeNode[]): FileTreeNode[] =>
    nodes
      .map((n) => (n.children ? { ...n, children: finish(n.children), meta: n.meta ?? `${countFiles(n)} files` } : n))
      .sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name))
  return finish(root)
}

const DEFAULT_NODES: FileTreeNode[] = treeFromPaths([
  { path: "components/ui/market-watchlist.tsx", meta: "212 lines" },
  { path: "components/ui/sparkline.tsx", meta: "64 lines" },
  { path: "components/ui/amount.tsx", meta: "48 lines" },
  { path: "components/lab/chart/axis.tsx", meta: "91 lines" },
  { path: "components/lab/chart/scale.ts", meta: "37 lines" },
  { path: "components/lab/StatTile.tsx", meta: "58 lines" },
  { path: "lib/utils.ts", meta: "6 lines" },
  { path: "lib/format.ts", meta: "29 lines" },
  { path: "data/quotes.ts", meta: "140 lines" },
  { path: "pages/WatchlistPage.tsx", meta: "173 lines" },
])

type Row = { node: FileTreeNode; depth: number; parent: string | null; index: number; count: number }

function flatten(nodes: FileTreeNode[], open: ReadonlySet<string>, depth = 0, parent: string | null = null): Row[] {
  return nodes.flatMap((node, i) => {
    const row: Row = { node, depth, parent, index: i, count: nodes.length }
    return node.children && open.has(node.path) ? [row, ...flatten(node.children, open, depth + 1, node.path)] : [row]
  })
}

/** A bundle read as a tree. Folders fold open under the pointer or the arrow
 *  keys, their branch line growing down as the rows inside arrive, and closing
 *  folds them back up in place. One soft highlight glides between rows rather
 *  than each row lighting on its own; the chosen file carries an accent spine.
 *  The right-hand column is for what a listing usually hides: how much is in
 *  each file, how many files a folder holds. */
export function FileTree({
  nodes = DEFAULT_NODES,
  selected,
  defaultSelected = null,
  onSelect,
  expanded,
  defaultExpanded,
  onExpandedChange,
  label = "Files",
  indent = 16,
  className,
}: {
  nodes?: FileTreeNode[]
  /** controlled: the selected path */
  selected?: string | null
  defaultSelected?: string | null
  onSelect?: (path: string, node: FileTreeNode) => void
  /** controlled: the open folders */
  expanded?: string[]
  /** open on arrival; the first folder when unset */
  defaultExpanded?: string[]
  onExpandedChange?: (paths: string[]) => void
  /** the tree's accessible name */
  label?: string
  /** px per level */
  indent?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const [ownSelected, setOwnSelected] = useState<string | null>(defaultSelected)
  const [ownExpanded, setOwnExpanded] = useState<string[]>(
    () => defaultExpanded ?? nodes.filter((n) => n.children).slice(0, 1).map((n) => n.path),
  )
  const [hot, setHot] = useState<string | null>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const current = selected === undefined ? ownSelected : selected
  const openList = expanded ?? ownExpanded
  const open = useMemo(() => new Set(openList), [openList])
  const rows = useMemo(() => flatten(nodes, open), [nodes, open])
  /* roving tabindex: one row is reachable by Tab, and it stays a row that
     exists after a fold closes over the one that had it */
  const tabStop = rows.some((r) => r.node.path === focused) ? focused : (rows[0]?.node.path ?? null)

  const setOpen = (next: string[]) => {
    if (expanded === undefined) setOwnExpanded(next)
    onExpandedChange?.(next)
  }
  const toggle = (path: string) => setOpen(open.has(path) ? openList.filter((p) => p !== path) : [...openList, path])
  const choose = (row: Row) => {
    if (selected === undefined) setOwnSelected(row.node.path)
    onSelect?.(row.node.path, row.node)
    if (row.node.children) toggle(row.node.path)
  }
  const focusRow = (path: string, root: HTMLElement | null) => {
    setFocused(path)
    root?.querySelector<HTMLButtonElement>(`[data-path="${CSS.escape(path)}"]`)?.focus()
  }

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, row: Row) => {
    const root = e.currentTarget.closest("[role=tree]") as HTMLElement | null
    const i = rows.findIndex((r) => r.node.path === row.node.path)
    const prev = rows[i - 1]
    const next = rows[i + 1]
    const folder = !!row.node.children
    const isOpen = open.has(row.node.path)
    const go = (r?: Row) => r && focusRow(r.node.path, root)
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); go(next); break
      case "ArrowUp": e.preventDefault(); go(prev); break
      case "Home": e.preventDefault(); go(rows[0]); break
      case "End": e.preventDefault(); go(rows[rows.length - 1]); break
      case "ArrowRight":
        e.preventDefault()
        if (folder && !isOpen) toggle(row.node.path)
        else if (folder && next?.parent === row.node.path) go(next)
        break
      case "ArrowLeft":
        e.preventDefault()
        if (folder && isOpen) toggle(row.node.path)
        else if (row.parent) focusRow(row.parent, root)
        break
      case "Enter":
      case " ": e.preventDefault(); choose(row); break
    }
  }

  return (
    <div
      role="tree"
      aria-label={label}
      onPointerLeave={() => setHot(null)}
      className={cn("w-full max-w-[360px] select-none text-[12.5px] text-foreground/70", className)}
    >
      <AnimatePresence initial={false}>
        {rows.map((row) => {
          const { node, depth } = row
          const folder = !!node.children
          const isOpen = folder && open.has(node.path)
          const isSelected = current === node.path
          const lit = hot === node.path
          return (
            <motion.div
              key={node.path}
              initial={reduced ? false : { height: 0, opacity: 0 }}
              animate={{ height: ROW, opacity: 1 }}
              exit={reduced ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0, transition: { duration: 0.15, ease: EASE } }}
              transition={reduced ? { duration: 0 } : { duration: 0.22, ease: EASE, delay: Math.min(row.index * 0.02, 0.08) }}
              className="relative overflow-hidden"
            >
              {/* hover affordance: one soft highlight that glides between rows */}
              {lit && (reduced ? (
                <span className="absolute inset-0 rounded-md bg-foreground/[0.04]" />
              ) : (
                <motion.span layoutId="file-tree-hot" transition={SPRING} className="absolute inset-0 rounded-md bg-foreground/[0.04]" />
              ))}
              {/* branch lines: one per ancestor, so nesting is read from the
                  lines rather than counted from the indent */}
              {Array.from({ length: depth }, (_, k) => (
                <motion.span
                  key={k}
                  aria-hidden
                  initial={reduced ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }}
                  className="absolute top-0 bottom-0 w-px origin-top bg-foreground/[0.06]"
                  style={{ left: 15 + k * indent }}
                />
              ))}
              {isSelected && (
                <span aria-hidden className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full" style={{ background: accentRgba(0.9) }} />
              )}
              <button
                type="button"
                role="treeitem"
                data-path={node.path}
                aria-level={depth + 1}
                aria-posinset={row.index + 1}
                aria-setsize={row.count}
                aria-selected={isSelected}
                aria-expanded={folder ? isOpen : undefined}
                tabIndex={tabStop === node.path ? 0 : -1}
                onFocus={() => { setFocused(node.path); setHot(node.path) }}
                onPointerEnter={() => setHot(node.path)}
                onKeyDown={(e) => onKey(e, row)}
                onClick={() => choose(row)}
                className={cn(
                  "relative flex h-8 w-full items-center gap-1.5 rounded-md pr-2.5 text-left transition-colors duration-150",
                  isSelected ? "text-foreground/90" : "hover:text-foreground/90",
                )}
                style={{ paddingLeft: 8 + depth * indent, background: isSelected ? accentRgba(0.045) : undefined }}
              >
                <motion.span
                  aria-hidden
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE }}
                  className={cn("grid h-3.5 w-3.5 shrink-0 place-items-center text-foreground/35", !folder && "invisible")}
                >
                  <ChevronRight className="h-3 w-3" strokeWidth={2} />
                </motion.span>
                <span aria-hidden className={cn("shrink-0", folder && isOpen ? "text-foreground/70" : "text-foreground/40")}>
                  {folder ? (isOpen ? <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Folder className="h-3.5 w-3.5" strokeWidth={1.75} />) : <File className="h-3.5 w-3.5" strokeWidth={1.75} />}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", folder && "font-medium")}>{node.name}</span>
                {node.meta && <span className="shrink-0 pl-3 text-[11px] tabular-nums text-foreground/35">{node.meta}</span>}
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
