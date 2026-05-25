import type {
  AttendanceHistorySession,
  AuditEntry,
  ClubNotification,
} from '@/pages/club/clubAttendanceTypes'

const CACHE_TTL_MS = 3 * 60 * 1000

type HistoryEntry = {
  sessions: AttendanceHistorySession[]
  cachedAt: number
}

type ChangesEntry = {
  auditEntries: AuditEntry[]
  notifications: ClubNotification[]
  cachedAt: number
}

let historyCache: HistoryEntry | null = null
let changesCache: ChangesEntry | null = null

function isFresh(cachedAt: number) {
  return Date.now() - cachedAt <= CACHE_TTL_MS
}

export function readAttendanceHistoryCache(): AttendanceHistorySession[] | null {
  if (!historyCache || !isFresh(historyCache.cachedAt)) {
    historyCache = null
    return null
  }
  return historyCache.sessions
}

export function writeAttendanceHistoryCache(sessions: AttendanceHistorySession[]) {
  historyCache = { sessions, cachedAt: Date.now() }
}

export function readClubChangesCache(): {
  auditEntries: AuditEntry[]
  notifications: ClubNotification[]
} | null {
  if (!changesCache || !isFresh(changesCache.cachedAt)) {
    changesCache = null
    return null
  }
  return {
    auditEntries: changesCache.auditEntries,
    notifications: changesCache.notifications,
  }
}

export function writeClubChangesCache(
  auditEntries: AuditEntry[],
  notifications: ClubNotification[]
) {
  changesCache = { auditEntries, notifications, cachedAt: Date.now() }
}

export function invalidateClubChangesCache() {
  changesCache = null
}
