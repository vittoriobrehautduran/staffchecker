// Shared cache for get-report responses (dashboard, preview, etc.).
const CACHE_TTL_MS = 5 * 60 * 1000

export type CachedReportData = {
  month: number
  year: number
  status: 'draft' | 'submitted'
  entries: unknown[]
}

type CacheEntry = {
  data: CachedReportData
  cachedAt: number
}

const cacheByMonth = new Map<string, CacheEntry>()

export function toReportMonthKey(year: number, month: number): string {
  return `${year}-${month.toString().padStart(2, '0')}`
}

export function readReportMonthCache(monthKey: string): CachedReportData | null {
  const entry = cacheByMonth.get(monthKey)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cacheByMonth.delete(monthKey)
    return null
  }
  return entry.data
}

export function writeReportMonthCache(data: CachedReportData) {
  const key = toReportMonthKey(data.year, data.month)
  cacheByMonth.set(key, { data, cachedAt: Date.now() })
}

export function invalidateReportMonthCache(monthKey: string) {
  cacheByMonth.delete(monthKey)
}
