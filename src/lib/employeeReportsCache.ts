const CACHE_TTL_MS = 5 * 60 * 1000

type EmployeeSummary = {
  userId: number
  name: string
  lastName: string
  email: string
  hasReport: boolean
  status: 'draft' | 'submitted'
  submittedAt: string | null
  workedHours: number
  leaveHours: number
  entryCount: number
}

type ReportEntry = {
  id: number
  date: string
  entry_type: string
  time_from: string | null
  time_to: string | null
  [key: string]: unknown
}

export type CachedEmployeeDetail = {
  month: number
  year: number
  status: 'draft' | 'submitted'
  submittedAt: string | null
  user: { id: number; name: string; lastName: string; email: string }
  workedHours: number
  leaveHours: number
  entryCount: number
  entries: ReportEntry[]
  readOnly: boolean
}

type CacheEntry<T> = {
  data: T
  cachedAt: number
}

const listByMonth = new Map<string, CacheEntry<EmployeeSummary[]>>()
const detailByKey = new Map<string, CacheEntry<CachedEmployeeDetail>>()

function monthKey(year: number, month: number) {
  return `${year}-${month.toString().padStart(2, '0')}`
}

function detailKey(year: number, month: number, userId: number) {
  return `${monthKey(year, month)}:${userId}`
}

function isFresh(cachedAt: number) {
  return Date.now() - cachedAt <= CACHE_TTL_MS
}

export function readEmployeeListCache(
  year: number,
  month: number
): EmployeeSummary[] | null {
  const entry = listByMonth.get(monthKey(year, month))
  if (!entry || !isFresh(entry.cachedAt)) {
    listByMonth.delete(monthKey(year, month))
    return null
  }
  return entry.data
}

export function writeEmployeeListCache(year: number, month: number, employees: EmployeeSummary[]) {
  listByMonth.set(monthKey(year, month), { data: employees, cachedAt: Date.now() })
}

export function readEmployeeDetailCache(
  year: number,
  month: number,
  userId: number
): CachedEmployeeDetail | null {
  const entry = detailByKey.get(detailKey(year, month, userId))
  if (!entry || !isFresh(entry.cachedAt)) {
    detailByKey.delete(detailKey(year, month, userId))
    return null
  }
  return entry.data
}

export function writeEmployeeDetailCache(
  year: number,
  month: number,
  userId: number,
  detail: CachedEmployeeDetail
) {
  detailByKey.set(detailKey(year, month, userId), { data: detail, cachedAt: Date.now() })
}
