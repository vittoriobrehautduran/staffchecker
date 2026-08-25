import { useMemo, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { sv } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WEEKDAYS } from '@/pages/club/clubTypes'

// ISO weekday: 1 = Monday … 7 = Sunday (matches club_schedule_template).
export function weekdayFromDateStr(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

export function dateStrFromParts(year: number, monthIndex: number, day: number): string {
  const date = new Date(Date.UTC(year, monthIndex, day))
  return date.toISOString().slice(0, 10)
}

export function todayDateStrLocal(): string {
  const now = new Date()
  return dateStrFromParts(now.getFullYear(), now.getMonth(), now.getDate())
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return dateStrFromParts(year, month - 1, day + days)
}

// Monday of the week that contains dateStr.
export function mondayOfWeek(dateStr: string): string {
  const weekday = weekdayFromDateStr(dateStr)
  return addDaysToDateStr(dateStr, -(weekday - 1))
}

function parseDateStr(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDayMonth(dateStr: string): string {
  return parseDateStr(dateStr).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
  })
}

function formatFullDate(dateStr: string): string {
  return parseDateStr(dateStr).toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

type Props = {
  selectedDate: string
  activeWeekday: number
  onSelectDate: (dateStr: string) => void
  onSelectWeekday: (weekday: number) => void
}

export function ClubWeekDateNav({
  selectedDate,
  activeWeekday,
  onSelectDate,
  onSelectWeekday,
}: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const weekStart = useMemo(() => mondayOfWeek(selectedDate), [selectedDate])

  const weekDays = useMemo(() => {
    return WEEKDAYS.map((day) => {
      const dateStr = addDaysToDateStr(weekStart, day.value - 1)
      return { ...day, dateStr }
    })
  }, [weekStart])

  function goWeek(delta: number) {
    onSelectDate(addDaysToDateStr(selectedDate, delta * 7))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11"
            onClick={() => goWeek(-1)}
            aria-label="Föregående vecka"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11"
            onClick={() => goWeek(1)}
            aria-label="Nästa vecka"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-1 min-h-11 px-3"
            onClick={() => onSelectDate(todayDateStrLocal())}
          >
            Idag
          </Button>
        </div>
        <Button
          type="button"
          variant={calendarOpen ? 'secondary' : 'outline'}
          size="sm"
          className="min-h-11 gap-2"
          onClick={() => setCalendarOpen((open) => !open)}
        >
          <CalendarDays className="h-4 w-4" />
          Kalender
        </Button>
      </div>

      <p className="text-sm capitalize text-muted-foreground">{formatFullDate(selectedDate)}</p>

      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((day) => {
          const isActiveWeekday = activeWeekday === day.value
          const isSelectedDate = selectedDate === day.dateStr
          return (
            <button
              key={day.value}
              type="button"
              onClick={() => {
                onSelectWeekday(day.value)
                onSelectDate(day.dateStr)
              }}
              className={cn(
                'flex min-h-[4.25rem] touch-manipulation flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition-colors duration-150',
                isSelectedDate || isActiveWeekday
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border/80 bg-background hover:bg-muted/60'
              )}
            >
              <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                {day.label.slice(0, 3)}
              </span>
              <span className="text-sm font-semibold">
                {formatDayMonth(day.dateStr).split(' ')[0]}
              </span>
            </button>
          )
        })}
      </div>

      {calendarOpen && (
        <div className="rounded-xl border border-border bg-background/70 p-3" data-testid="schedule-calendar">
          <DayPicker
            mode="single"
            locale={sv}
            selected={parseDateStr(selectedDate)}
            onSelect={(date) => {
              if (!date) return
              const next = dateStrFromParts(date.getFullYear(), date.getMonth(), date.getDate())
              onSelectDate(next)
              onSelectWeekday(weekdayFromDateStr(next))
              setCalendarOpen(false)
            }}
            className="mx-auto"
            classNames={{
              months: 'flex flex-col',
              month: 'space-y-3',
              caption: 'flex justify-center relative items-center px-8',
              caption_label: 'text-sm font-medium',
              nav: 'flex items-center',
              nav_button:
                'h-9 w-9 bg-transparent p-0 opacity-70 hover:opacity-100 inline-flex items-center justify-center rounded-md border border-input',
              nav_button_previous: 'absolute left-1',
              nav_button_next: 'absolute right-1',
              table: 'w-full border-collapse',
              head_row: 'flex',
              head_cell: 'text-muted-foreground rounded-md w-9 font-normal text-[0.75rem]',
              row: 'flex w-full mt-1',
              cell: 'h-9 w-9 text-center text-sm p-0 relative',
              day: 'h-9 w-9 p-0 font-normal rounded-md hover:bg-accent',
              day_selected: 'bg-primary text-primary-foreground hover:bg-primary',
              day_today: 'bg-accent text-accent-foreground',
              day_outside: 'text-muted-foreground opacity-40',
              day_disabled: 'text-muted-foreground opacity-40',
              day_hidden: 'invisible',
            }}
          />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Välj ett datum för att hoppa till den veckan. Ändringar i schemat gäller fortfarande
            varje {WEEKDAYS.find((d) => d.value === activeWeekday)?.label.toLowerCase() || 'veckodag'}.
          </p>
        </div>
      )}
    </div>
  )
}
