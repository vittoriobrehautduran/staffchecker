import { apiRequest } from '@/services/api'
import type { ClubClosuresPayload } from '@/pages/club/clubAttendanceTypes'

const CACHE_TTL_MS = 60_000

let cached: ClubClosuresPayload | null = null
let cachedAt = 0
let inflight: Promise<ClubClosuresPayload> | null = null

export function invalidateClubClosuresCache() {
  cached = null
  cachedAt = 0
}

export async function fetchClubClosures(options?: { force?: boolean }): Promise<ClubClosuresPayload> {
  const force = options?.force ?? false
  if (!force && cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached
  }

  if (!force && inflight) {
    return inflight
  }

  inflight = apiRequest<ClubClosuresPayload>('/club-admin', {
    method: 'POST',
    body: JSON.stringify({ operation: 'get_closures' }),
  })
    .then((payload) => {
      cached = payload
      cachedAt = Date.now()
      return payload
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}
