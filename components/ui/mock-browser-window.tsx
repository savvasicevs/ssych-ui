"use client"

import type React from "react"
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Star,
  Plus,
  EllipsisVertical,
} from "lucide-react"

import { cn } from "../../lib/utils"

interface SidebarItem {
  icon?: React.ReactNode
  label: string
  active?: boolean
  badge?: string | number
}

interface WindowControlsProps {
  variant?: "macos" | "windows" | "chrome" | "safari"
  headerStyle?: "minimal" | "full"
}

interface AddressBarProps {
  url?: string
  secure?: boolean
  variant?: "chrome" | "safari"
  className?: string
  /** "right" biases the bar toward the content area on mobile (centered again from sm+). */
  align?: "center" | "right"
}

interface SidebarContentProps {
  items?: SidebarItem[]
  variant?: "navigation" | "bookmarks" | "history" | "extensions"
  className?: string
}

interface BrowserWindowProps {
  children?: React.ReactNode
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  showSidebar?: boolean
  sidebarPosition?: "left" | "right" | "top" | "bottom"
  headerStyle?: "minimal" | "full"
  variant?: "chrome" | "safari" | "generic"
  theme?: "light" | "dark" | "auto"
  url?: string
  /** Back / forward / reload buttons after the window controls (full header). */
  showNavButtons?: boolean
  /** Right-side toolbar: bookmark, new tab, more-options menu (full header). */
  showActions?: boolean
  /** Custom sidebar node — overrides the default passive SidebarContent when provided (e.g. an interactive sidebar). */
  sidebar?: React.ReactNode
  /** Override the sidebar width class (e.g. responsive `w-40 lg:w-48`); falls back to the `size` preset. */
  sidebarWidthClassName?: string
  /** "right" biases the address bar toward the content area on mobile. */
  addressBarAlign?: "center" | "right"
  sidebarItems?: Array<{
    icon?: React.ReactNode
    label: string
    active?: boolean
    badge?: string | number
  }>
}

function WindowControls({
  variant = "macos",
  headerStyle = "full",
}: WindowControlsProps) {
  const sizeClasses = "size-2"

  if (variant === "macos" || variant === "safari") {
    const dotColors =
      headerStyle === "minimal"
        ? {
            red: "bg-foreground/10 border  border-foreground/20",
            yellow: "bg-foreground/10 border border-foreground/20",
            green: "bg-foreground/10 border border-foreground/20",
          }
        : {
            red: "bg-red-500 hover:bg-red-600 border border-foreground/20",
            yellow:
              "bg-yellow-500 hover:bg-yellow-600 border border-foreground/20",
            green:
              "bg-green-500 hover:bg-green-600 border border-foreground/20 ",
          }

    return (
      <div className="flex gap-2">
        <div
          className={cn(
            sizeClasses,
            "rounded-full",
            dotColors.red,
            "transition-colors cursor-pointer flex items-center justify-center group"
          )}
        >
          {headerStyle !== "minimal" && (
            <div className="w-1.5 h-0.5 bg-red-900/60 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          )}
        </div>
        <div
          className={cn(
            sizeClasses,
            "rounded-full",
            dotColors.yellow,
            "transition-colors cursor-pointer flex items-center justify-center group"
          )}
        >
          {headerStyle !== "minimal" && (
            <div className="w-1.5 h-0.5 bg-yellow-900/60 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          )}
        </div>
        <div
          className={cn(
            sizeClasses,
            "rounded-full",
            dotColors.green,
            "transition-colors cursor-pointer flex items-center justify-center group"
          )}
        >
          {headerStyle !== "minimal" && (
            <div className="w-1 h-1 border border-green-900/60 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          )}
        </div>
      </div>
    )
  }

  if (variant === "windows") {
    return (
      <div className="flex gap-1">
        <div className="w-6 h-4 bg-foreground/[0.06] hover:bg-foreground/10 transition-colors cursor-pointer flex items-center justify-center">
          <div className="w-2 h-0.5 bg-foreground/60"></div>
        </div>
        <div className="w-6 h-4 bg-foreground/[0.06] hover:bg-foreground/10 transition-colors cursor-pointer flex items-center justify-center">
          <div className="w-2 h-2 border border-foreground/60"></div>
        </div>
        <div className="w-6 h-4 bg-red-500/80 hover:bg-red-500 transition-colors cursor-pointer flex items-center justify-center">
          <div className="w-2 h-0.5 bg-foreground rotate-45"></div>
          <div className="w-2 h-0.5 bg-foreground -rotate-45 absolute"></div>
        </div>
      </div>
    )
  }

  if (variant === "chrome") {
    return (
      <div className="flex gap-1.5">
        <div
          className={cn(
            sizeClasses,
            "rounded-full bg-red-500 hover:bg-red-600 transition-colors cursor-pointer"
          )}
        ></div>
        <div
          className={cn(
            sizeClasses,
            "rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors cursor-pointer"
          )}
        ></div>
        <div
          className={cn(
            sizeClasses,
            "rounded-full bg-green-500 hover:bg-green-600 transition-colors cursor-pointer"
          )}
        ></div>
      </div>
    )
  }

  return (
    <div className="flex gap-1.5">
      <div
        className={`${sizeClasses} rounded-full border border-foreground/20 bg-foreground/10`}
      ></div>
      <div
        className={`${sizeClasses} rounded-full border border-foreground/20 bg-foreground/10`}
      ></div>
      <div
        className={`${sizeClasses} rounded-full border border-foreground/20 bg-foreground/10`}
      ></div>
    </div>
  )
}

function AddressBar({
  url = "https://example.com",
  variant = "chrome",
  align = "center",
}: AddressBarProps) {
  // No glass on these pills on purpose: they sit on the chrome header, which is a flat
  // 3–4% fill over an opaque window. Nothing moves behind them, so the effect cost a
  // compositor layer and bought nothing visible — §5 says glass has to be earned.
  const variantStyles = {
    chrome:
      "bg-foreground/[0.04] rounded-full border border-foreground/[0.06] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.03)_inset]",
    safari:
      "bg-foreground/[0.03] rounded-full border border-foreground/[0.06] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.03)_inset]",
  }
  // mobile: anchor to the right edge so the bar can't clip off-screen (sidebar sits on the
  // left, so this also sits it over the content area); desktop (sm+): centered.
  const posClass =
    align === "right"
      ? "right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2"
      : "left-1/2 -translate-x-1/2"

  return (
    <div className={`pointer-events-none absolute top-1/2 flex -translate-y-1/2 justify-center ${posClass}`}>
      <div
        className={`${variantStyles[variant]} px-4 py-1.5 text-[12px] text-foreground/50 min-w-[140px] sm:min-w-[220px] max-w-[78vw] sm:max-w-md flex items-center justify-center text-center transition-colors`}
      >
        <span className="truncate">{url}</span>
      </div>
    </div>
  )
}

function SidebarContent({
  items = [
    { label: "Dashboard", active: true },
    { label: "Analytics", badge: "3" },
    { label: "Settings" },
    { label: "Profile" },
  ],
  className = "",
}: SidebarContentProps) {
  return (
    <div className={`p-3 space-y-1 ${className}`}>
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={`
            flex items-center gap-2 px-2 py-1.5 rounded text-[14px] transition-colors cursor-pointer
            ${
              item.active
                ? "bg-foreground/[0.08] text-foreground border border-foreground/10"
                : "text-foreground/55 hover:text-foreground hover:bg-foreground/[0.03]"
            }
          `}
        >
          {item.icon && (
            <div className="w-4 h-4 flex-shrink-0">{item.icon}</div>
          )}
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && (
            <div className="bg-foreground/10 text-foreground/70 text-[12px] px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
              {item.badge}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const toolbarBtn =
  "flex h-6 w-6 items-center justify-center rounded-md text-foreground/40 transition-colors hover:bg-foreground/[0.06] hover:text-foreground/80 cursor-pointer"

function NavButtons() {
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" aria-label="Back" className={toolbarBtn}>
        <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <button type="button" aria-label="Forward" className={cn(toolbarBtn, "text-foreground/20")}>
        <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <button type="button" aria-label="Reload" className={toolbarBtn}>
        <RotateCw className="h-4 w-4" />
      </button>
    </div>
  )
}

function ActionButtons() {
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" aria-label="Bookmark" className={toolbarBtn}>
        <Star className="h-4 w-4" />
      </button>
      <button type="button" aria-label="New tab" className={toolbarBtn}>
        <Plus className="h-4 w-4" />
      </button>
      <button type="button" aria-label="More options" className={toolbarBtn}>
        <EllipsisVertical className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  )
}

export function BrowserWindow({
  children,
  className = "",
  size = "md",
  showSidebar = false,
  sidebarPosition = "left",
  headerStyle = "minimal",
  variant = "generic",
  theme = "auto",
  url,
  showNavButtons = false,
  showActions = false,
  sidebar,
  sidebarWidthClassName,
  addressBarAlign = "center",
  sidebarItems,
}: BrowserWindowProps) {

  const sidebarSizes = {
    sm: "w-32",
    md: "w-48",
    lg: "w-56",
    xl: "w-64",
  }
  const sidebarWidth = sidebarWidthClassName ?? sidebarSizes[size]

  const themeClasses =
    theme === "dark"
      ? "bg-[var(--surface)] border-foreground/10"
      : theme === "light"
        ? "bg-[var(--surface)] border-foreground/10"
        : "bg-[var(--surface)] border-foreground/10"

  const getHeaderStyles = () => {
    const baseStyles =
      "relative h-11 border-b border-foreground/10 flex items-center px-4"

    if (variant === "chrome") {
      return `${baseStyles} bg-foreground/[0.02] overflow-hidden`
    }

    if (variant === "safari") {
      return `${baseStyles} bg-foreground/[0.02] overflow-hidden`
    }

    return `${baseStyles} bg-foreground/[0.03]`
  }

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border shadow-[0_24px_70px_-24px_rgba(0,0,0,0.75)] light:shadow-[0_16px_44px_-26px_rgba(15,23,42,0.25)]
        h-full w-full ${themeClasses} ${className} flex flex-col
      `}
    >
      <div className={getHeaderStyles()}>
        <div className="relative z-10 flex items-center gap-3">
          <WindowControls
            variant={variant === "generic" ? "macos" : variant}
            headerStyle={headerStyle}
          />
          {headerStyle === "full" && showNavButtons && <NavButtons />}
        </div>

        {headerStyle === "full" && (
          <AddressBar
            url={url}
            variant={variant === "generic" ? "chrome" : variant}
            align={addressBarAlign}
          />
        )}

        {headerStyle === "full" && showActions && (
          <div className="relative z-10 ml-auto">
            <ActionButtons />
          </div>
        )}
      </div>

      {showSidebar && sidebarPosition === "top" && (
        <div className="border-b border-foreground/[0.06] bg-foreground/[0.03] h-16">
          <SidebarContent
            items={sidebarItems}
            variant="navigation"
            className="flex-row"
          />
        </div>
      )}

      <div className="flex flex-1 h-0">
        {/* Left Sidebar */}
        {showSidebar && sidebarPosition === "left" && (
          <div
            className={`border-r border-foreground/[0.06] bg-foreground/[0.03] ${sidebarWidth} flex-shrink-0 h-full`}
          >
            {sidebar ?? <SidebarContent items={sidebarItems} />}
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 relative min-w-0 h-full">
          {children || <div className="absolute inset-0">{children}</div>}
        </div>

        {/* Right Sidebar */}
        {showSidebar && sidebarPosition === "right" && (
          <div
            className={`border-l border-foreground/[0.06] bg-foreground/[0.03] ${sidebarWidth} flex-shrink-0 h-full`}
          >
            {sidebar ?? <SidebarContent items={sidebarItems} />}
          </div>
        )}
      </div>

      {/* Bottom Sidebar */}
      {showSidebar && sidebarPosition === "bottom" && (
        <div className="border-t border-foreground/[0.06] bg-foreground/[0.03] h-16">
          <SidebarContent
            items={sidebarItems}
            variant="navigation"
            className="flex-row"
          />
        </div>
      )}
    </div>
  )
}
