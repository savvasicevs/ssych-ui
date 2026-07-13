import React from 'react'
import { cn } from '@/lib/utils'

/**
 * Glass pricing card — a padded outer shell (p-1.5) whose header is a raised glass
 * panel (its own border + top glass gradient) holding plan / price / CTA, with the
 * feature list breathing below. Self-contained dark surface (white/opacity tokens).
 */

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'relative w-full max-w-xs rounded-2xl',
        'p-1.5 shadow-xl backdrop-blur-xl',
        'border border-white/[0.07]',
        className
      )}
      // the site's raised-sheet gradient
      style={{ background: 'linear-gradient(180deg, #10141e 0%, #0a0e16 100%)' }}
      {...props}
    />
  )
}

function Header({
  className,
  children,
  glassEffect = true,
  ...props
}: React.ComponentProps<'div'> & {
  glassEffect?: boolean
}) {
  return (
    <div className={cn('relative mb-4 rounded-xl border border-white/[0.07] bg-white/[0.04] p-4', className)} {...props}>
      {/* Top glass gradient */}
      {glassEffect && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-48 rounded-[inherit]"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 40%, rgba(0,0,0,0) 100%)',
          }}
        />
      )}
      {children}
    </div>
  )
}

function Plan({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mb-8 flex items-center justify-between', className)} {...props} />
}

function Description({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-xs text-white/40', className)} {...props} />
}

function PlanName({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm font-medium text-white/75 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function Badge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/40', className)}
      {...props}
    />
  )
}

function Price({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mb-3 flex items-end gap-1', className)} {...props} />
}

function MainPrice({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('text-3xl font-semibold tracking-tight tabular-nums text-white', className)} {...props} />
}

function Period({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('pb-1 text-sm text-white/80', className)} {...props} />
}

function OriginalPrice({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('mr-1 ml-auto text-lg text-white/40 line-through', className)} {...props} />
}

function Body({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('space-y-6 p-3', className)} {...props} />
}

function List({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul className={cn('space-y-3', className)} {...props} />
}

function ListItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li className={cn('flex items-start gap-3 text-sm font-medium text-white/60', className)} {...props} />
}

function Separator({
  children = 'Upgrade to access',
  className,
  ...props
}: React.ComponentProps<'div'> & {
  children?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3 text-sm text-white/40', className)} {...props}>
      <span className="h-[1px] flex-1 bg-white/[0.08]" />
      <span className="shrink-0 text-white/40">{children}</span>
      <span className="h-[1px] flex-1 bg-white/[0.08]" />
    </div>
  )
}

export {
  Card,
  Header,
  Description,
  Plan,
  PlanName,
  Badge,
  Price,
  MainPrice,
  Period,
  OriginalPrice,
  Body,
  List,
  ListItem,
  Separator,
}
