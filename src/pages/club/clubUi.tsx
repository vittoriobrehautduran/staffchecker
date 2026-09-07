import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Shared app page chrome (översikt, förhandsvisning, klubb, …).
// Segmented controls, soft panels, headers — teal accent, mobile-friendly touch targets.

type ClubPageShellProps = {
  children: ReactNode
  className?: string
}

export function ClubPageShell({ children, className }: ClubPageShellProps) {
  return (
    // No min-h-screen / overflow-hidden here — those trapped scroll inside the
    // old md:h-screen app shell and made Android tablet landscape feel stuck.
    <div className={cn('relative flex-1 bg-background', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-primary/[0.07] via-transparent to-transparent"
      />
      <div className="container relative mx-auto max-w-4xl space-y-6 px-4 py-6 md:space-y-8 md:px-6 md:py-8">
        {children}
      </div>
    </div>
  )
}

type ClubPageHeaderProps = {
  title: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
}

export function ClubPageHeader({ title, description, eyebrow, actions }: ClubPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-[2rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </header>
  )
}

export type ClubSegmentOption<T extends string> = {
  value: T
  label: string
  testId?: string
}

type ClubSegmentedControlProps<T extends string> = {
  options: ClubSegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  'aria-label': string
  className?: string
  fullWidth?: boolean
}

export function ClubSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
  fullWidth = false,
}: ClubSegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex rounded-xl bg-muted/90 p-1',
        fullWidth && 'w-full',
        className
      )}
    >
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={option.testId}
            className={cn(
              'min-h-11 touch-manipulation rounded-lg px-3.5 text-sm font-medium transition-colors duration-150',
              fullWidth ? 'flex-1' : 'sm:min-w-[7.5rem]',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

type ClubSoftPanelProps = {
  children: ReactNode
  className?: string
  title?: string
  description?: string
  actions?: ReactNode
}

// Soft bordered panel — prefer this over stacking Card inside Card.
export function ClubSoftPanel({
  children,
  className,
  title,
  description,
  actions,
}: ClubSoftPanelProps) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border/80 bg-card/80 p-4 shadow-sm md:p-6',
        className
      )}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {title ? (
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  )
}

type ClubEmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
}

export function ClubEmptyState({ title, description, action }: ClubEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

type ClubToolbarButtonProps = {
  children: ReactNode
  active?: boolean
  onClick: () => void
  'aria-expanded'?: boolean
  testId?: string
  className?: string
}

// Secondary chrome actions (settings / import) — never compete with the primary tab.
export function ClubToolbarButton({
  children,
  active = false,
  onClick,
  'aria-expanded': ariaExpanded,
  testId,
  className,
}: ClubToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-expanded={ariaExpanded}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors duration-150',
        active
          ? 'border-primary/30 bg-primary/10 text-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  )
}
