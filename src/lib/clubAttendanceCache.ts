import type { DayPayload, DaySession } from '@/pages/club/clubAttendanceTypes'

// Närvaro per datum — snabb växling mellan flikar/sidor. Kort TTL eftersom coaches uppdaterar ofta.
const CACHE_TTL_MS = 2 * 60 * 1000

type CacheEntry = {
  payload: DayPayload
  cachedAt: number
}

const cacheByDate = new Map<string, CacheEntry>()

function sessionSnapshot(session: DaySession): string {
  const players = session.players
    .filter((player) => !player.isRemoved)
    .map((player) => `${player.id}:${player.attendanceStatus}`)
    .join(',')
  const coaches = session.coaches
    .filter((coach) => !coach.isRemoved)
    .map((coach) => coach.coachId)
    .join(',')
  return `${session.id}|${coaches}|${players}`
}

function payloadFingerprint(payload: DayPayload): string {
  return payload.sessions.map(sessionSnapshot).join(';')
}

export function readAttendanceDayCache(date: string): DayPayload | null {
  const entry = cacheByDate.get(date)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cacheByDate.delete(date)
    return null
  }
  return entry.payload
}

export function writeAttendanceDayCache(payload: DayPayload) {
  cacheByDate.set(payload.date, {
    payload,
    cachedAt: Date.now(),
  })
}

export function invalidateAttendanceDayCache(date: string) {
  cacheByDate.delete(date)
}

// Keep unchanged sessions referentially stable so React skips re-rendering those cards.
export function mergeAttendanceDayPayload(cached: DayPayload, fresh: DayPayload): DayPayload {
  if (cached.date !== fresh.date) return fresh
  if (cached.cancelled !== fresh.cancelled) return fresh
  if (payloadFingerprint(cached) === payloadFingerprint(fresh)) {
    return cached
  }

  const freshById = new Map(fresh.sessions.map((session) => [session.id, session]))
  const seenIds = new Set<number>()
  const mergedSessions: DaySession[] = []

  for (const oldSession of cached.sessions) {
    const newer = freshById.get(oldSession.id)
    if (!newer) continue
    seenIds.add(oldSession.id)
    mergedSessions.push(
      sessionSnapshot(oldSession) === sessionSnapshot(newer) ? oldSession : newer
    )
  }

  for (const session of fresh.sessions) {
    if (!seenIds.has(session.id)) {
      mergedSessions.push(session)
    }
  }

  mergedSessions.sort((a, b) => a.startTime.localeCompare(b.startTime))

  return {
    ...fresh,
    sessions: mergedSessions,
    coachesCatalog: fresh.coachesCatalog,
  }
}
