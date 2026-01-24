import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isPast, isFuture } from 'date-fns'
import { sv } from 'date-fns/locale'

export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function formatDateSwedish(date: Date): string {
  return format(date, 'd MMMM yyyy', { locale: sv })
}

export function formatTime(time: string): string {
  return time
}

export function getMonthDays(date: Date): Date[] {
  const start = startOfMonth(date)
  const end = endOfMonth(date)
  return eachDayOfInterval({ start, end })
}

export function isCurrentMonth(date: Date, currentDate: Date = new Date()): boolean {
  return isSameMonth(date, currentDate)
}

export function isDateToday(date: Date): boolean {
  return isToday(date)
}

export function isDatePast(date: Date): boolean {
  return isPast(date)
}

export function isDateFuture(date: Date): boolean {
  return isFuture(date)
}

export function getMonthName(date: Date): string {
  return format(date, 'MMMM yyyy', { locale: sv })
}

export function getWeekdayName(date: Date): string {
  return format(date, 'EEEE', { locale: sv })
}

export function getWeekdayShort(date: Date): string {
  return format(date, 'EEE', { locale: sv })
}

