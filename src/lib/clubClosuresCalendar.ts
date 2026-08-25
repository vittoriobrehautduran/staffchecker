import type { ClubClosuresPayload, ClosureType } from '@/pages/club/clubAttendanceTypes'

export const LOV_CLOSURE_DEFAULT_LABEL = 'lov/tävling'
export const ROD_CLOSURE_DEFAULT_LABEL = 'Röd dag'

export function closureTypeDisplayLabel(type: ClosureType): string {
  return type === 'lov' ? LOV_CLOSURE_DEFAULT_LABEL : ROD_CLOSURE_DEFAULT_LABEL
}

export type DayClosureInfo = {
  type: ClosureType
  label: string
}

function parseDateParts(dateStr: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

function dateStrFromParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function compareDateStr(a: string, b: string): number {
  return a.localeCompare(b)
}

function eachDateInRange(fromDate: string, toDate: string): string[] {
  const from = parseDateParts(fromDate)
  const to = parseDateParts(toDate)
  if (!from || !to) return []

  const dates: string[] = []
  const cursor = new Date(from.y, from.m - 1, from.d)
  const end = new Date(to.y, to.m - 1, to.d)

  while (cursor <= end) {
    dates.push(
      dateStrFromParts(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate())
    )
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

export function buildClosureDayMap(closures: ClubClosuresPayload): Map<string, DayClosureInfo> {
  const map = new Map<string, DayClosureInfo>()

  for (const range of closures.lovRanges) {
    const label = range.label?.trim() || LOV_CLOSURE_DEFAULT_LABEL
    for (const dateStr of eachDateInRange(range.fromDate, range.toDate)) {
      if (!map.has(dateStr)) {
        map.set(dateStr, { type: 'lov', label })
      }
    }
  }

  for (const day of closures.rodDays) {
    const label = day.label?.trim() || ROD_CLOSURE_DEFAULT_LABEL
    map.set(day.date, { type: 'rod_dag', label })
  }

  return map
}

export function getClosureForDate(
  map: Map<string, DayClosureInfo>,
  dateStr: string
): DayClosureInfo | null {
  return map.get(dateStr) ?? null
}

export type MonthClosureSummary = {
  type: ClosureType
  label: string
  fromDate: string
  toDate: string
}

function monthBounds(year: number, monthIndex: number): { start: string; end: string } {
  const month = monthIndex + 1
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return {
    start: `${prefix}-01`,
    end: `${prefix}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function listClosureSummariesForMonth(
  closures: ClubClosuresPayload,
  year: number,
  monthIndex: number
): MonthClosureSummary[] {
  const { start: monthStart, end: monthEnd } = monthBounds(year, monthIndex)
  const items: MonthClosureSummary[] = []

  for (const range of closures.lovRanges) {
    if (compareDateStr(range.toDate, monthStart) < 0) continue
    if (compareDateStr(range.fromDate, monthEnd) > 0) continue

    const fromDate = compareDateStr(range.fromDate, monthStart) < 0 ? monthStart : range.fromDate
    const toDate = compareDateStr(range.toDate, monthEnd) > 0 ? monthEnd : range.toDate
    items.push({
      type: 'lov',
      label: range.label?.trim() || LOV_CLOSURE_DEFAULT_LABEL,
      fromDate,
      toDate,
    })
  }

  for (const day of closures.rodDays) {
    if (compareDateStr(day.date, monthStart) < 0 || compareDateStr(day.date, monthEnd) > 0) continue
    items.push({
      type: 'rod_dag',
      label: day.label?.trim() || 'Röd dag',
      fromDate: day.date,
      toDate: day.date,
    })
  }

  return items.sort((a, b) => compareDateStr(a.fromDate, b.fromDate))
}

export function dateToLocalDateStr(date: Date): string {
  return dateStrFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function localDateFromDateStr(dateStr: string): Date | null {
  const parts = parseDateParts(dateStr)
  if (!parts) return null
  return new Date(parts.y, parts.m - 1, parts.d)
}
