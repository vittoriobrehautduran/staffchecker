export type AttendanceStatus = 'present' | 'absent' | 'unknown'

export type DaySessionCoach = {
  id: number
  coachId: number
  name: string
  isDayAddition: boolean
  isRemoved: boolean
}

export type DaySessionPlayer = {
  id: number
  playerId: number | null
  name: string
  isDayAddition: boolean
  isRemoved: boolean
  attendanceStatus: AttendanceStatus
  markedAt: string | null
}

export type DaySession = {
  id: number
  date: string
  startTime: string
  endTime: string
  sport: 'tennis' | 'bordtennis'
  resourceId: number
  resourceType: 'court' | 'table'
  resourceNumber: number
  resourceLabel: string | null
  classId: number
  className: string | null
  coaches: DaySessionCoach[]
  players: DaySessionPlayer[]
}

export type DayPayload = {
  date: string
  cancelled: boolean
  tennisEnabled: boolean
  bordtennisEnabled: boolean
  sessions: DaySession[]
  coachesCatalog: { id: number; name: string; sport: string }[]
  version?: string
}

export type LessonSport = 'tennis' | 'bordtennis'

export type AuditEntry = {
  id: number
  action: string
  entityType: string
  entityId: number | null
  summary: string
  payload: {
    sessionDate?: string
    sessionId?: number
    changes?: {
      field: string
      before: unknown
      after: unknown
      isNew: boolean
    }[]
  } | null
  createdAt: string
  actorName: string
}

export type ClubNotification = {
  id: number
  type: string
  title: string
  body: string
  sessionId: number | null
  readAt: string | null
  createdAt: string
  isUnread: boolean
}

export type AttendanceHistorySession = {
  sessionId: number
  date: string
  startTime: string
  endTime: string
  sport: 'tennis' | 'bordtennis'
  resourceLabel: string | null
  resourceNumber: number
  className: string | null
  summary: { present: number; absent: number; unknown: number; total: number }
  players: {
    id: number
    name: string
    status: AttendanceStatus
    isDayAddition: boolean
  }[]
}

export function todayDateStr(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatSessionVenue(session: Pick<DaySession, 'resourceLabel' | 'resourceNumber' | 'resourceType'>) {
  if (session.resourceLabel?.trim()) return session.resourceLabel
  return session.resourceType === 'court'
    ? `Bana ${session.resourceNumber}`
    : `Bord ${session.resourceNumber}`
}
