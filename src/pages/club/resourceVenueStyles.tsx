import { cn } from '@/lib/utils'

// Soft tints aligned with the app teal palette — one hue per bana/bord number (cycles after 3).
const VENUE_STYLE_SLOTS = [
  {
    card: 'border-l-[5px] border-l-primary border-border/80 bg-primary/[0.06] dark:bg-primary/10',
    badge:
      'bg-primary/12 text-primary border border-primary/20 dark:bg-primary/20 dark:text-primary-foreground',
  },
  {
    card: 'border-l-[5px] border-l-sky-600 border-border/80 bg-sky-500/[0.07] dark:bg-sky-500/10',
    badge:
      'bg-sky-500/12 text-sky-900 border border-sky-500/20 dark:bg-sky-500/15 dark:text-sky-100',
  },
  {
    card: 'border-l-[5px] border-l-violet-600 border-border/80 bg-violet-500/[0.06] dark:bg-violet-500/10',
    badge:
      'bg-violet-500/12 text-violet-900 border border-violet-500/20 dark:bg-violet-500/15 dark:text-violet-100',
  },
] as const

function venueStyleIndex(resourceNumber: number): number | null {
  if (resourceNumber <= 0) return null
  return (resourceNumber - 1) % VENUE_STYLE_SLOTS.length
}

export function resourceVenueCardClassName(resourceNumber: number, extra?: string): string {
  const index = venueStyleIndex(resourceNumber)
  const base =
    index === null
      ? 'border border-border/80 bg-background/60'
      : VENUE_STYLE_SLOTS[index].card

  return cn('rounded-2xl', base, extra)
}

type ResourceVenueBadgeProps = {
  name: string
  resourceNumber: number
  className?: string
}

export function ResourceVenueBadge({ name, resourceNumber, className }: ResourceVenueBadgeProps) {
  const index = venueStyleIndex(resourceNumber)
  const badgeTone =
    index === null
      ? 'bg-muted text-foreground border border-border'
      : VENUE_STYLE_SLOTS[index].badge

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-lg px-3 py-1.5 text-base font-semibold leading-tight tracking-tight md:text-lg',
        badgeTone,
        className
      )}
    >
      {name}
    </span>
  )
}

type LessonTimeRangeProps = {
  startTime: string
  endTime: string
  className?: string
}

export function LessonTimeRange({ startTime, endTime, className }: LessonTimeRangeProps) {
  return (
    <p
      className={cn(
        'text-xl font-semibold tabular-nums leading-none tracking-tight text-foreground md:text-2xl',
        className
      )}
    >
      <time dateTime={startTime}>{startTime}</time>
      <span className="mx-2 font-medium text-muted-foreground" aria-hidden>
        –
      </span>
      <time dateTime={endTime}>{endTime}</time>
    </p>
  )
}
