import type { AttendanceStatus, DayPayload } from '@/pages/club/clubAttendanceTypes'

// Update one player's checkbox in local state before the server responds.
export function patchSessionPlayerAttendance(
  payload: DayPayload,
  sessionId: number,
  sessionPlayerId: number,
  status: AttendanceStatus
): DayPayload {
  return {
    ...payload,
    sessions: payload.sessions.map((session) =>
      session.id !== sessionId
        ? session
        : {
            ...session,
            players: session.players.map((player) =>
              player.id !== sessionPlayerId ? player : { ...player, attendanceStatus: status }
            ),
          }
    ),
  }
}

export function isAttendanceOnlyPatch(patch: {
  coachIds?: number[]
  players?: unknown[]
  attendance?: unknown[]
}): boolean {
  return (
    Array.isArray(patch.attendance) &&
    patch.attendance.length > 0 &&
    !patch.coachIds &&
    !patch.players
  )
}
