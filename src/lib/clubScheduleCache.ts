import type { ClubPayload } from '@/pages/club/clubTypes'

// Keeps veckoschema in memory while navigating (Kalender → Klubb). Survives route unmount.
const CACHE_TTL_MS = 5 * 60 * 1000

let cachedPayload: ClubPayload | null = null
let cachedAt = 0

export function readClubScheduleCache(): ClubPayload | null {
  if (!cachedPayload) return null
  if (Date.now() - cachedAt > CACHE_TTL_MS) {
    cachedPayload = null
    cachedAt = 0
    return null
  }
  return cachedPayload
}

export function isClubScheduleCacheFresh(): boolean {
  return cachedPayload != null && Date.now() - cachedAt <= CACHE_TTL_MS
}

export function writeClubScheduleCache(payload: ClubPayload) {
  cachedPayload = payload
  cachedAt = Date.now()
}

export function invalidateClubScheduleCache() {
  cachedPayload = null
  cachedAt = 0
}
