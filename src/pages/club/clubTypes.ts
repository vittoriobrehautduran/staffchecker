export type LessonSport = 'tennis' | 'bordtennis'

export type ClubCoach = {
  id: number
  name: string
  sport: 'tennis' | 'bordtennis' | 'both'
  is_active: boolean
}

export type ClubResource = {
  id: number
  resource_type: 'court' | 'table'
  resource_number: number
  label: string | null
  is_active: boolean
}

export type ClubLessonPlayer = {
  id?: number
  name: string
}

export type ClubLesson = {
  id: number
  weekday: number
  sport: LessonSport
  startTime: string
  endTime: string
  durationMinutes: number
  resourceId: number
  resourceNumber: number
  resourceLabel: string | null
  resourceType: 'court' | 'table'
  classId: number
  className: string | null
  coachIds: number[]
  coaches: { id: number; name: string }[]
  players: ClubLessonPlayer[]
}

export type ClubPayload = {
  club: {
    id: number
    name: string
    slug: string
    tennis_enabled: boolean
    bordtennis_enabled: boolean
    tennis_courts_count: number
    bordtennis_tables_count: number
    default_slot_duration_minutes: number
    retention_days: number
  }
  coaches: ClubCoach[]
  resources: ClubResource[]
  lessonsByWeekday: Record<string, ClubLesson[]>
}

export type LocalLessonDraft = {
  localId: string
  sport: LessonSport
  startTime: string
  durationMinutes: number
  resourceId: number
  coachIds: number[]
  playerNames: string[]
  className: string
}

// API may return a partial payload (e.g. older club-admin Lambda without lessonsByWeekday).
export function normalizeClubPayload(raw: Partial<ClubPayload> & { club: ClubPayload['club'] }): ClubPayload {
  const club = raw.club
  const lessonsByWeekday: Record<string, ClubLesson[]> = {}
  for (let day = 1; day <= 7; day += 1) {
    lessonsByWeekday[String(day)] = []
  }
  if (raw.lessonsByWeekday && typeof raw.lessonsByWeekday === 'object') {
    for (const [key, lessons] of Object.entries(raw.lessonsByWeekday)) {
      if (Array.isArray(lessons)) {
        lessonsByWeekday[key] = lessons.map((lesson) => ({
          ...lesson,
          className: lesson.className ?? null,
        }))
      }
    }
  }

  return {
    club: {
      ...club,
      tennis_enabled: club.tennis_enabled ?? club.tennis_courts_count > 0,
      bordtennis_enabled: club.bordtennis_enabled ?? club.bordtennis_tables_count > 0,
    },
    coaches: Array.isArray(raw.coaches) ? raw.coaches : [],
    resources: Array.isArray(raw.resources) ? raw.resources : [],
    lessonsByWeekday,
  }
}

export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Måndag' },
  { value: 2, label: 'Tisdag' },
  { value: 3, label: 'Onsdag' },
  { value: 4, label: 'Torsdag' },
  { value: 5, label: 'Fredag' },
  { value: 6, label: 'Lördag' },
  { value: 7, label: 'Söndag' },
]
