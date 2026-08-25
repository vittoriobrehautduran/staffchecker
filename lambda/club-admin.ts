import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromCognitoSession } from './utils/cognito-auth'
import {
  resolveClubAccess,
  getClubMembers,
  updateClubMemberPermissions,
} from './utils/club-membership'
import {
  defaultHistoryRange,
  getAttendanceHistory,
  getAuditLog,
  getDayPayloadForRequest,
  getNotifications,
  markNotificationsRead,
  updateSessionDay,
} from './utils/club-attendance'
import {
  addLovRange,
  addRodDay,
  listClubClosures,
  removeLovRange,
  removeRodDay,
} from './utils/club-closures'
import { reviewScheduleImportWithAi } from './utils/schedule-import-review'

type ResourceType = 'court' | 'table'
type SportType = 'tennis' | 'bordtennis' | 'both'
type LessonSport = 'tennis' | 'bordtennis'

function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.Origin || event.headers?.origin || '*'
  const allowedOrigins = [
    'http://localhost:5173',
    'https://staffcheck.spangatbk.se',
    'https://staging.d3jub8c52hgrc6.amplifyapp.com',
  ]
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]
}

function corsHeaders(origin: string, extra?: { etag?: string }) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'ETag',
    ...(extra?.etag ? { ETag: `"${extra.etag}"` } : {}),
  }
}

function formatTimeValue(value: unknown): string {
  const raw = String(value ?? '00:00')
  return raw.length >= 5 ? raw.slice(0, 5) : raw
}

function durationFromTimes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

function addMinutesToTime(startTime: string, minutes: number): string {
  const [h, m] = startTime.split(':').map(Number)
  const total = h * 60 + m + minutes
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

async function getBossClubId(userId: number): Promise<number | null> {
  const access = await resolveClubAccess(userId)
  if (!access?.isBoss) return null
  return access.clubId
}

function isValidDateStr(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

async function getMaxUsedResourceNumber(
  clubId: number,
  resourceType: ResourceType
): Promise<number> {
  const rows = (await sql`
    SELECT MAX(r.resource_number) AS max_number
    FROM club_schedule_template t
    INNER JOIN club_resources r ON r.id = t.resource_id
    WHERE t.club_id = ${clubId}
      AND t.is_active = true
      AND r.resource_type = ${resourceType}
  `) as { max_number: number | null }[]

  return Number(rows[0]?.max_number ?? 0)
}

async function syncResourcesForSport(
  clubId: number,
  resourceType: ResourceType,
  targetCount: number
): Promise<void> {
  const existing = (await sql`
    SELECT id, resource_number, is_active
    FROM club_resources
    WHERE club_id = ${clubId}
      AND resource_type = ${resourceType}
    ORDER BY resource_number ASC
  `) as { id: number; resource_number: number; is_active: boolean }[]

  const existingByNumber = new Map(existing.map((row) => [row.resource_number, row]))

  for (let number = 1; number <= targetCount; number += 1) {
    const row = existingByNumber.get(number)
    if (row) {
      if (!row.is_active) {
        await sql`
          UPDATE club_resources
          SET is_active = true, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${row.id}
        `
      }
    } else {
      await sql`
        INSERT INTO club_resources (club_id, resource_type, resource_number)
        VALUES (${clubId}, ${resourceType}, ${number})
      `
    }
  }

  for (const row of existing) {
    if (row.resource_number > targetCount && row.is_active) {
      await sql`
        UPDATE club_resources
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${row.id}
      `
    }
  }
}

async function countActiveResources(clubId: number, resourceType: ResourceType): Promise<number> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM club_resources
    WHERE club_id = ${clubId}
      AND resource_type = ${resourceType}
      AND is_active = true
  `) as { count: number }[]
  return Number(rows[0]?.count ?? 0)
}

async function getNextResourceNumber(clubId: number, resourceType: ResourceType): Promise<number> {
  const rows = (await sql`
    SELECT COALESCE(MAX(resource_number), 0) + 1 AS next_number
    FROM club_resources
    WHERE club_id = ${clubId}
      AND resource_type = ${resourceType}
  `) as { next_number: number }[]
  return Number(rows[0]?.next_number ?? 1)
}

async function syncClubResourceCounts(clubId: number) {
  const courtCount = await countActiveResources(clubId, 'court')
  const tableCount = await countActiveResources(clubId, 'table')
  await sql`
    UPDATE clubs
    SET
      tennis_courts_count = ${courtCount},
      bordtennis_tables_count = ${tableCount},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${clubId}
  `
}

async function getLessonsByWeekday(clubId: number) {
  const templates = (await sql`
    SELECT
      t.id,
      t.weekday,
      t.start_time,
      t.end_time,
      t.resource_id,
      t.class_id,
      t.sport,
      c.name AS class_name,
      r.resource_type,
      r.resource_number,
      r.label AS resource_label
    FROM club_schedule_template t
    INNER JOIN club_resources r ON r.id = t.resource_id
    LEFT JOIN club_classes c ON c.id = t.class_id
    WHERE t.club_id = ${clubId}
      AND t.is_active = true
    ORDER BY t.weekday ASC, t.start_time ASC, t.id ASC
  `) as {
    id: number
    weekday: number
    start_time: string
    end_time: string
    resource_id: number
    class_id: number
    sport: LessonSport | null
    class_name: string | null
    resource_type: ResourceType
    resource_number: number
    resource_label: string | null
  }[]

  const lessonsByWeekday: Record<string, unknown[]> = {}
  for (let day = 1; day <= 7; day += 1) {
    lessonsByWeekday[String(day)] = []
  }

  if (templates.length === 0) {
    return lessonsByWeekday
  }

  const templateIds = templates.map((template) => template.id)
  const classIds = [...new Set(templates.map((template) => template.class_id))]

  const coachRows = (await sql`
    SELECT tc.template_id, c.id, c.name
    FROM club_schedule_template_coaches tc
    INNER JOIN club_coaches c ON c.id = tc.coach_id
    WHERE tc.template_id = ANY(${templateIds}::int[])
    ORDER BY tc.template_id ASC, c.id ASC
  `) as { template_id: number; id: number; name: string }[]

  const playerRows = (await sql`
    SELECT class_id, id, player_name
    FROM club_class_players
    WHERE class_id = ANY(${classIds}::int[])
      AND is_active = true
    ORDER BY class_id ASC, sort_order ASC, id ASC
  `) as { class_id: number; id: number; player_name: string }[]

  const coachesByTemplate = new Map<number, { id: number; name: string }[]>()
  for (const row of coachRows) {
    const list = coachesByTemplate.get(row.template_id) || []
    list.push({ id: row.id, name: row.name })
    coachesByTemplate.set(row.template_id, list)
  }

  const playersByClass = new Map<number, { id: number; name: string }[]>()
  for (const row of playerRows) {
    const list = playersByClass.get(row.class_id) || []
    list.push({ id: row.id, name: row.player_name })
    playersByClass.set(row.class_id, list)
  }

  for (const template of templates) {
    const sport =
      template.sport ||
      (template.resource_type === 'court' ? 'tennis' : 'bordtennis')

    const coachRowsForLesson = coachesByTemplate.get(template.id) || []
    const playerRowsForLesson = playersByClass.get(template.class_id) || []

    const startTime = formatTimeValue(template.start_time)
    const endTime = formatTimeValue(template.end_time)

    const lesson = {
      id: template.id,
      weekday: template.weekday,
      sport,
      startTime,
      endTime,
      durationMinutes: durationFromTimes(startTime, endTime),
      resourceId: template.resource_id,
      resourceNumber: template.resource_number,
      resourceLabel: template.resource_label,
      resourceType: template.resource_type,
      classId: template.class_id,
      className: template.class_name || null,
      coachIds: coachRowsForLesson.map((coach) => coach.id),
      coaches: coachRowsForLesson,
      players: playerRowsForLesson,
    }

    const key = String(template.weekday)
    if (!lessonsByWeekday[key]) {
      lessonsByWeekday[key] = []
    }
    lessonsByWeekday[key].push(lesson)
  }

  return lessonsByWeekday
}

async function getClubPayload(clubId: number) {
  const [club] = (await sql`
    SELECT
      id,
      name,
      slug,
      tennis_enabled,
      bordtennis_enabled,
      tennis_courts_count,
      bordtennis_tables_count,
      default_slot_duration_minutes,
      retention_days
    FROM clubs
    WHERE id = ${clubId}
    LIMIT 1
  `) as {
    id: number
    name: string
    slug: string
    tennis_enabled: boolean
    bordtennis_enabled: boolean
    tennis_courts_count: number
    bordtennis_tables_count: number
    default_slot_duration_minutes: number
    retention_days: number
  }[]

  if (!club) {
    throw new Error('Club not found')
  }

  const coaches = (await sql`
    SELECT id, name, sport, is_active
    FROM club_coaches
    WHERE club_id = ${clubId}
      AND is_active = true
    ORDER BY sport ASC, sort_order ASC, id ASC
  `) as {
    id: number
    name: string
    sport: SportType
    is_active: boolean
  }[]

  const resources = (await sql`
    SELECT id, resource_type, resource_number, label, is_active
    FROM club_resources
    WHERE club_id = ${clubId}
      AND is_active = true
    ORDER BY resource_type ASC, resource_number ASC
  `) as {
    id: number
    resource_type: ResourceType
    resource_number: number
    label: string | null
    is_active: boolean
  }[]

  const lessonsByWeekday = await getLessonsByWeekday(clubId)

  return {
    club,
    coaches,
    resources,
    lessonsByWeekday,
  }
}

async function insertLessonRecord(
  clubId: number,
  params: {
    weekday: number
    sport: LessonSport
    startTime: string
    durationMinutes: number
    resourceId: number
    coachIds: number[]
    playerNames: string[]
    className?: string | null
  }
) {
  const startTime = formatTimeValue(params.startTime)
  const durationMinutes = Math.max(20, params.durationMinutes)
  const endTime = addMinutesToTime(startTime, durationMinutes)
  const weekdayNames = ['', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
  const fallbackLabel = `${weekdayNames[params.weekday]} ${startTime} ${params.sport}`
  const classLabel = (params.className || '').trim() || fallbackLabel

  const newClasses = (await sql`
    INSERT INTO club_classes (club_id, name, sport)
    VALUES (${clubId}, ${classLabel}, ${params.sport})
    RETURNING id
  `) as { id: number }[]

  const classId = newClasses[0].id

  const newTemplates = (await sql`
    INSERT INTO club_schedule_template (
      club_id,
      weekday,
      start_time,
      end_time,
      resource_id,
      class_id,
      sport,
      default_coach_id
    )
    VALUES (
      ${clubId},
      ${params.weekday},
      ${startTime},
      ${endTime},
      ${params.resourceId},
      ${classId},
      ${params.sport},
      ${params.coachIds[0] ?? null}
    )
    RETURNING id
  `) as { id: number }[]

  const lessonId = newTemplates[0].id

  for (const coachId of params.coachIds) {
    await sql`
      INSERT INTO club_schedule_template_coaches (template_id, coach_id)
      VALUES (${lessonId}, ${coachId})
      ON CONFLICT DO NOTHING
    `
  }

  if (params.playerNames.length > 0) {
    await sql`
      INSERT INTO club_class_players (class_id, player_name, sort_order)
      SELECT ${classId}, name, ordinality::int
      FROM unnest(${params.playerNames}::text[]) WITH ORDINALITY AS t(name, ordinality)
    `
  }
}

type ImportCaches = {
  coachByName: Map<string, number>
  resourceByKey: Map<string, number>
  unknownCoachBySport: Map<LessonSport, number>
}

async function createImportCaches(clubId: number): Promise<ImportCaches> {
  const coaches = (await sql`
    SELECT id, name
    FROM club_coaches
    WHERE club_id = ${clubId}
      AND is_active = true
  `) as { id: number; name: string }[]

  const coachByName = new Map<string, number>()
  for (const coach of coaches) {
    coachByName.set(coach.name.trim().toLowerCase(), coach.id)
  }

  const resources = (await sql`
    SELECT id, resource_type, resource_number
    FROM club_resources
    WHERE club_id = ${clubId}
      AND is_active = true
  `) as { id: number; resource_type: ResourceType; resource_number: number }[]

  const resourceByKey = new Map<string, number>()
  for (const resource of resources) {
    const sport: LessonSport = resource.resource_type === 'court' ? 'tennis' : 'bordtennis'
    resourceByKey.set(`${sport}:${resource.resource_number}`, resource.id)
  }

  return {
    coachByName,
    resourceByKey,
    unknownCoachBySport: new Map<LessonSport, number>(),
  }
}

async function resolveUnknownCoachId(
  clubId: number,
  sport: LessonSport,
  caches: ImportCaches
): Promise<number> {
  const cached = caches.unknownCoachBySport.get(sport)
  if (cached) return cached

  const coachId = await ensureUnknownCoachId(clubId, sport)
  caches.unknownCoachBySport.set(sport, coachId)
  caches.coachByName.set('unknown', coachId)
  return coachId
}

async function resolveResourceIdForImport(
  clubId: number,
  sport: LessonSport,
  resourceId: number,
  resourceNumber: number,
  venueRaw: string,
  createMissingResources: boolean,
  caches: ImportCaches
): Promise<number> {
  if (resourceId > 0) return resourceId

  const cacheKey = `${sport}:${resourceNumber}`
  const cached = caches.resourceByKey.get(cacheKey)
  if (cached) return cached

  if (!createMissingResources || resourceNumber <= 0) return 0

  const resourceType: ResourceType = sport === 'tennis' ? 'court' : 'table'
  const label =
    venueRaw.trim() || `${resourceType === 'court' ? 'Bana' : 'Bord'} ${resourceNumber}`

  const created = (await sql`
    INSERT INTO club_resources (club_id, resource_type, resource_number, label, is_active)
    VALUES (${clubId}, ${resourceType}, ${resourceNumber}, ${label}, true)
    RETURNING id
  `) as { id: number }[]

  const newId = created[0].id
  caches.resourceByKey.set(cacheKey, newId)
  return newId
}

async function resolveCoachIdsForImport(
  clubId: number,
  sport: LessonSport,
  coachId: number,
  coachName: string | undefined,
  createMissingCoaches: boolean,
  caches: ImportCaches
): Promise<number[]> {
  if (coachId > 0) return [coachId]

  if (coachName && createMissingCoaches) {
    const trimmed = coachName.trim()
    if (looksLikePhoneNumber(trimmed)) {
      return [await resolveUnknownCoachId(clubId, sport, caches)]
    }

    const normalized = trimmed.toLowerCase()
    const existing = caches.coachByName.get(normalized)
    if (existing) return [existing]

    const inserted = (await sql`
      INSERT INTO club_coaches (club_id, name, sport)
      VALUES (${clubId}, ${trimmed}, ${sport})
      RETURNING id
    `) as { id: number }[]

    const newId = inserted[0].id
    caches.coachByName.set(normalized, newId)
    return [newId]
  }

  return [await resolveUnknownCoachId(clubId, sport, caches)]
}

async function bulkDeleteLessonsForSport(clubId: number, sport: LessonSport) {
  const rows = (await sql`
    SELECT id AS template_id, class_id
    FROM club_schedule_template
    WHERE club_id = ${clubId}
      AND sport = ${sport}
  `) as { template_id: number; class_id: number }[]

  if (rows.length === 0) return

  const templateIds = rows.map((row) => row.template_id)
  const classIds = [...new Set(rows.map((row) => row.class_id))]

  await sql`
    DELETE FROM club_sessions
    WHERE club_id = ${clubId}
      AND template_id = ANY(${templateIds}::int[])
  `
  await sql`DELETE FROM club_schedule_template WHERE id = ANY(${templateIds}::int[])`
  await sql`DELETE FROM club_class_players WHERE class_id = ANY(${classIds}::int[])`
  await sql`DELETE FROM club_classes WHERE id = ANY(${classIds}::int[])`
}

async function deleteAllLessonsForSport(clubId: number, sport: LessonSport) {
  await bulkDeleteLessonsForSport(clubId, sport)
}

const CLEAR_SCHEDULE_CONFIRM_PHRASE = 'RADERA SCHEMA'

async function deleteAllClubSchedule(clubId: number): Promise<number> {
  const templates = (await sql`
    SELECT id
    FROM club_schedule_template
    WHERE club_id = ${clubId}
  `) as { id: number }[]

  await sql`DELETE FROM club_sessions WHERE club_id = ${clubId}`

  for (const template of templates) {
    await deleteLessonById(clubId, template.id)
  }

  return templates.length
}

function looksLikePhoneNumber(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  const letters = (trimmed.match(/[a-zA-ZåäöÅÄÖ]/g) || []).length
  if (letters >= 3) return false
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 13) return false
  const compact = trimmed.replace(/[\s-]/g, '')
  if (/^(\+46|0046|0)/.test(compact)) return true
  if (/^[\d\s+\-()]+$/.test(trimmed)) return true
  return false
}

async function findCoachByName(clubId: number, coachName: string) {
  const normalized = coachName.trim().toLowerCase()
  const coaches = (await sql`
    SELECT id, name
    FROM club_coaches
    WHERE club_id = ${clubId}
      AND is_active = true
  `) as { id: number; name: string }[]

  return coaches.find((coach) => coach.name.trim().toLowerCase() === normalized)?.id ?? null
}

async function ensureUnknownCoachId(clubId: number, sport: LessonSport): Promise<number> {
  const existing = await findCoachByName(clubId, 'unknown')
  if (existing) return existing

  const inserted = (await sql`
    INSERT INTO club_coaches (club_id, name, sport)
    VALUES (${clubId}, ${'unknown'}, ${sport})
    RETURNING id
  `) as { id: number }[]

  return inserted[0].id
}

async function deleteSessionsForLesson(clubId: number, classId: number, templateId: number) {
  // Närvaro-sessions materialiseras från veckoschemat och blockerar annars borttagning av klassen.
  await sql`
    DELETE FROM club_sessions
    WHERE club_id = ${clubId}
      AND (class_id = ${classId} OR template_id = ${templateId})
  `
}

async function deleteLessonById(clubId: number, lessonId: number) {
  const rows = (await sql`
    SELECT id, class_id
    FROM club_schedule_template
    WHERE id = ${lessonId}
      AND club_id = ${clubId}
    LIMIT 1
  `) as { id: number; class_id: number }[]

  if (!rows.length) {
    throw new Error('Lektionen hittades inte')
  }

  const classId = rows[0].class_id

  await deleteSessionsForLesson(clubId, classId, lessonId)
  await sql`DELETE FROM club_schedule_template WHERE id = ${lessonId}`
  await sql`DELETE FROM club_class_players WHERE class_id = ${classId}`
  await sql`DELETE FROM club_classes WHERE id = ${classId}`
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = getCorsOrigin(event)

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(origin),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
      },
      body: '',
    }
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(origin),
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    const userId = await getUserIdFromCognitoSession(event)
    if (!userId) {
      return {
        statusCode: 401,
        headers: corsHeaders(origin),
        body: JSON.stringify({ message: 'Not authenticated' }),
      }
    }

    const access = await resolveClubAccess(userId)
    if (!access) {
      return {
        statusCode: 403,
        headers: corsHeaders(origin),
        body: JSON.stringify({ message: 'Club permission required' }),
      }
    }

    const clubId = access.clubId
    const queryDate = event.queryStringParameters?.date?.trim() || ''

    if (event.httpMethod === 'GET') {
      if (queryDate) {
        if (!isValidDateStr(queryDate)) {
          return {
            statusCode: 400,
            headers: corsHeaders(origin),
            body: JSON.stringify({ message: 'date must be YYYY-MM-DD' }),
          }
        }
        const ifNoneMatch =
          event.headers?.['If-None-Match'] ||
          event.headers?.['if-none-match'] ||
          event.queryStringParameters?.ifNoneMatch ||
          ''

        const dayResult = await getDayPayloadForRequest(clubId, queryDate, ifNoneMatch)

        if (dayResult.unchanged) {
          return {
            statusCode: 200,
            headers: corsHeaders(origin, { etag: dayResult.version }),
            body: JSON.stringify({
              unchanged: true,
              date: dayResult.date,
              version: dayResult.version,
            }),
          }
        }

        const { unchanged: _unchanged, ...dayPayload } = dayResult
        return {
          statusCode: 200,
          headers: corsHeaders(origin, { etag: dayResult.version }),
          body: JSON.stringify(dayPayload),
        }
      }

      if (!access.isBoss) {
        return {
          statusCode: 403,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Club boss permission required' }),
        }
      }

      const payload = await getClubPayload(clubId)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify(payload),
      }
    }

    const body = JSON.parse(event.body || '{}') as Record<string, unknown> & {
      operation?: string
      tennisEnabled?: boolean
      bordtennisEnabled?: boolean
      resourceType?: ResourceType
      label?: string
      name?: string
    }
    const operation = String(body.operation || '')

    if (!operation) {
      return {
        statusCode: 400,
        headers: corsHeaders(origin),
        body: JSON.stringify({ message: 'operation is required' }),
      }
    }

    const bossOnlyOperations = new Set([
      'update_club_settings',
      'add_resource',
      'add_coach',
      'delete_coach',
      'add_lesson',
      'update_lesson',
      'delete_lesson',
      'import_schedule',
      'review_schedule_import',
      'clear_schedule',
      'get_audit_log',
      'get_notifications',
      'mark_notifications_read',
      'get_attendance_history',
      'get_club_members',
      'update_club_member_permissions',
      'add_rod_dag',
      'add_lov_range',
      'remove_rod_dag',
      'remove_lov_range',
    ])

    if (bossOnlyOperations.has(operation) && !access.isBoss) {
      return {
        statusCode: 403,
        headers: corsHeaders(origin),
        body: JSON.stringify({ message: 'Club boss permission required' }),
      }
    }

    if (operation === 'get_day') {
      const dateStr = String(body.date || '').trim()
      if (!isValidDateStr(dateStr)) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'date must be YYYY-MM-DD' }),
        }
      }
      const dayResult = await getDayPayloadForRequest(clubId, dateStr)
      if (dayResult.unchanged) {
        return {
          statusCode: 200,
          headers: corsHeaders(origin, { etag: dayResult.version }),
          body: JSON.stringify({
            unchanged: true,
            date: dayResult.date,
            version: dayResult.version,
          }),
        }
      }
      const { unchanged: _unchanged, ...dayPayload } = dayResult
      return {
        statusCode: 200,
        headers: corsHeaders(origin, { etag: dayResult.version }),
        body: JSON.stringify(dayPayload),
      }
    }

    if (operation === 'update_session') {
      const sessionId = Number(body.sessionId)
      if (!sessionId) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'sessionId is required' }),
        }
      }

      const dayResult = await updateSessionDay(clubId, userId, sessionId, {
        coachIds: Array.isArray(body.coachIds)
          ? (body.coachIds as unknown[]).map((id) => Number(id)).filter((id) => id > 0)
          : undefined,
        players: Array.isArray(body.players)
          ? (body.players as { sessionPlayerId?: number; name?: string; removed?: boolean }[])
          : undefined,
        attendance: Array.isArray(body.attendance)
          ? (body.attendance as { sessionPlayerId: number; status: 'present' | 'absent' | 'unknown' }[])
          : undefined,
      })

      if (dayResult.unchanged) {
        return {
          statusCode: 200,
          headers: corsHeaders(origin, { etag: dayResult.version }),
          body: JSON.stringify({
            unchanged: true,
            date: dayResult.date,
            version: dayResult.version,
          }),
        }
      }

      const { unchanged: _unchanged, ...dayPayload } = dayResult
      return {
        statusCode: 200,
        headers: corsHeaders(origin, { etag: dayResult.version }),
        body: JSON.stringify(dayPayload),
      }
    }

    if (operation === 'get_audit_log') {
      const defaults = defaultHistoryRange()
      const fromDate = String(body.fromDate || defaults.fromDate).trim()
      const toDate = String(body.toDate || defaults.toDate).trim()
      const entries = await getAuditLog(clubId, fromDate, toDate)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ entries }),
      }
    }

    if (operation === 'get_notifications') {
      const notifications = await getNotifications(clubId, userId)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ notifications }),
      }
    }

    if (operation === 'mark_notifications_read') {
      const notificationIds = Array.isArray(body.notificationIds)
        ? (body.notificationIds as unknown[]).map((id) => Number(id)).filter((id) => id > 0)
        : undefined
      await markNotificationsRead(clubId, userId, notificationIds)
      const notifications = await getNotifications(clubId, userId)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ notifications }),
      }
    }

    if (operation === 'get_attendance_history') {
      const defaults = defaultHistoryRange()
      const fromDate = String(body.fromDate || defaults.fromDate).trim()
      const toDate = String(body.toDate || defaults.toDate).trim()
      const sessions = await getAttendanceHistory(clubId, fromDate, toDate)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ fromDate, toDate, sessions }),
      }
    }

    if (operation === 'get_club_members') {
      const members = await getClubMembers(clubId)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ members }),
      }
    }

    if (operation === 'update_club_member_permissions') {
      const targetUserId = Number(body.userId)
      if (!targetUserId) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'userId is required' }),
        }
      }

      const permissions = Array.isArray(body.permissions)
        ? (body.permissions as unknown[]).map((p) => String(p).trim()).filter(Boolean)
        : []

      const members = await updateClubMemberPermissions(clubId, targetUserId, permissions)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ members }),
      }
    }

    if (operation === 'get_closures') {
      const closures = await listClubClosures(clubId)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify(closures),
      }
    }

    if (operation === 'add_rod_dag') {
      const dateStr = String(body.date || '').trim()
      if (!isValidDateStr(dateStr)) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'date must be YYYY-MM-DD' }),
        }
      }
      const label = body.label != null ? String(body.label).trim() : null
      await addRodDay(clubId, dateStr, userId, label || null)
      const closures = await listClubClosures(clubId)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify(closures),
      }
    }

    if (operation === 'remove_rod_dag') {
      const dateStr = String(body.date || '').trim()
      if (!isValidDateStr(dateStr)) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'date must be YYYY-MM-DD' }),
        }
      }
      await removeRodDay(clubId, dateStr)
      const closures = await listClubClosures(clubId)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify(closures),
      }
    }

    if (operation === 'add_lov_range') {
      const fromDate = String(body.fromDate || '').trim()
      const toDate = String(body.toDate || '').trim()
      if (!isValidDateStr(fromDate) || !isValidDateStr(toDate)) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'fromDate and toDate must be YYYY-MM-DD' }),
        }
      }
      const label = body.label != null ? String(body.label).trim() : null
      try {
        await addLovRange(clubId, fromDate, toDate, userId, label || null)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Kunde inte spara lov'
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message }),
        }
      }
      const closures = await listClubClosures(clubId)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify(closures),
      }
    }

    if (operation === 'remove_lov_range') {
      const rangeId = Number(body.rangeId)
      if (!rangeId) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'rangeId is required' }),
        }
      }
      await removeLovRange(clubId, rangeId)
      const closures = await listClubClosures(clubId)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify(closures),
      }
    }

    if (!access.isBoss) {
      return {
        statusCode: 403,
        headers: corsHeaders(origin),
        body: JSON.stringify({ message: 'Club boss permission required' }),
      }
    }

    if (operation === 'update_club_settings') {
      const tennisEnabled = !!body.tennisEnabled
      const bordtennisEnabled = !!body.bordtennisEnabled

      if (!tennisEnabled) {
        const maxCourt = await getMaxUsedResourceNumber(clubId, 'court')
        if (maxCourt > 0) {
          return {
            statusCode: 400,
            headers: corsHeaders(origin),
            body: JSON.stringify({
              message: `Det finns lektioner på tennisbanor. Ta bort lektionerna först innan du stänger av tennis.`,
            }),
          }
        }
        await sql`
          UPDATE club_resources
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE club_id = ${clubId}
            AND resource_type = 'court'
        `
      }

      if (!bordtennisEnabled) {
        const maxTable = await getMaxUsedResourceNumber(clubId, 'table')
        if (maxTable > 0) {
          return {
            statusCode: 400,
            headers: corsHeaders(origin),
            body: JSON.stringify({
              message: `Det finns lektioner på bordtennisbord. Ta bort lektionerna först innan du stänger av bordtennis.`,
            }),
          }
        }
        await sql`
          UPDATE club_resources
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE club_id = ${clubId}
            AND resource_type = 'table'
        `
      }

      const courtCount = tennisEnabled ? await countActiveResources(clubId, 'court') : 0
      const tableCount = bordtennisEnabled ? await countActiveResources(clubId, 'table') : 0

      await sql`
        UPDATE clubs
        SET
          tennis_enabled = ${tennisEnabled},
          bordtennis_enabled = ${bordtennisEnabled},
          tennis_courts_count = ${courtCount},
          bordtennis_tables_count = ${tableCount},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${clubId}
      `
    }

    if (operation === 'add_resource') {
      const resourceType = (body.resourceType === 'table' ? 'table' : 'court') as ResourceType
      const label = String(body.label || body.name || '').trim()

      if (!label) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Namn på bana eller bord krävs' }),
        }
      }

      const resourceNumber = await getNextResourceNumber(clubId, resourceType)

      await sql`
        INSERT INTO club_resources (club_id, resource_type, resource_number, label, is_active)
        VALUES (${clubId}, ${resourceType}, ${resourceNumber}, ${label}, true)
      `

      await syncClubResourceCounts(clubId)
    }

    if (operation === 'add_coach') {
      const coachName = String(body.name || '').trim()
      const sport = (body.sport || 'tennis') as SportType
      if (!coachName) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Tränarens namn krävs' }),
        }
      }
      if (sport !== 'tennis' && sport !== 'bordtennis') {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Sport måste vara tennis eller bordtennis' }),
        }
      }

      await sql`
        INSERT INTO club_coaches (club_id, name, sport)
        VALUES (${clubId}, ${coachName}, ${sport})
      `
    }

    if (operation === 'delete_coach') {
      const coachId = Number(body.coachId)
      if (!coachId) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'coachId krävs' }),
        }
      }

      const coachRows = (await sql`
        SELECT id, name
        FROM club_coaches
        WHERE id = ${coachId}
          AND club_id = ${clubId}
          AND is_active = true
        LIMIT 1
      `) as { id: number; name: string }[]

      if (!coachRows.length) {
        return {
          statusCode: 404,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Tränaren hittades inte' }),
        }
      }

      await sql`
        DELETE FROM club_schedule_template_coaches
        WHERE coach_id = ${coachId}
          AND template_id IN (
            SELECT id FROM club_schedule_template WHERE club_id = ${clubId}
          )
      `

      await sql`
        UPDATE club_schedule_template
        SET default_coach_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE club_id = ${clubId}
          AND default_coach_id = ${coachId}
      `

      await sql`
        UPDATE club_coaches
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${coachId}
          AND club_id = ${clubId}
      `
    }

    if (operation === 'add_lesson' || operation === 'update_lesson') {
      const weekday = Number(body.weekday)
      const sport = body.sport as LessonSport
      const startTime = formatTimeValue(body.startTime)
      const durationMinutes = Math.max(20, Number(body.durationMinutes ?? 60))
      const resourceId = Number(body.resourceId)
      const coachIds = Array.isArray(body.coachIds)
        ? (body.coachIds as unknown[]).map((id) => Number(id)).filter((id) => id > 0)
        : []
      const playerNames = Array.isArray(body.playerNames)
        ? (body.playerNames as unknown[])
            .map((name) => String(name).trim())
            .filter((name) => name.length > 0)
        : []
      const requestedClassName =
        body.className != null ? String(body.className).trim() : ''

      if (weekday < 1 || weekday > 7) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Ogiltig veckodag' }),
        }
      }

      if (sport !== 'tennis' && sport !== 'bordtennis') {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Ogiltig sport' }),
        }
      }

      if (!resourceId) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Bana eller bord måste väljas' }),
        }
      }

      const resourceRows = (await sql`
        SELECT id, resource_type, resource_number
        FROM club_resources
        WHERE id = ${resourceId}
          AND club_id = ${clubId}
          AND is_active = true
        LIMIT 1
      `) as { id: number; resource_type: ResourceType; resource_number: number }[]

      if (!resourceRows.length) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Bana eller bord hittades inte' }),
        }
      }

      const resource = resourceRows[0]
      const expectedType = sport === 'tennis' ? 'court' : 'table'
      if (resource.resource_type !== expectedType) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({
            message:
              sport === 'tennis'
                ? 'Välj en tennisbana för tennislektionen'
                : 'Välj ett bordtennisbord för bordtennislektionen',
          }),
        }
      }

      const endTime = addMinutesToTime(startTime, durationMinutes)
      const weekdayNames = ['', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
      const fallbackLabel = `${weekdayNames[weekday]} ${startTime} ${sport}`

      let lessonId = Number(body.lessonId ?? 0)
      let classId = 0
      let classLabel = requestedClassName || fallbackLabel

      if (operation === 'update_lesson') {
        if (!lessonId) {
          return {
            statusCode: 400,
            headers: corsHeaders(origin),
            body: JSON.stringify({ message: 'lessonId krävs' }),
          }
        }

        const existing = (await sql`
          SELECT t.id, t.class_id, c.name AS class_name
          FROM club_schedule_template t
          LEFT JOIN club_classes c ON c.id = t.class_id
          WHERE t.id = ${lessonId}
            AND t.club_id = ${clubId}
          LIMIT 1
        `) as { id: number; class_id: number; class_name: string | null }[]

        if (!existing.length) {
          return {
            statusCode: 404,
            headers: corsHeaders(origin),
            body: JSON.stringify({ message: 'Lektionen hittades inte' }),
          }
        }

        classId = existing[0].class_id
        // Keep existing class name unless boss typed a new one.
        classLabel = requestedClassName || existing[0].class_name?.trim() || fallbackLabel

        await sql`
          UPDATE club_classes
          SET name = ${classLabel}, sport = ${sport}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${classId}
        `

        await sql`
          UPDATE club_schedule_template
          SET
            weekday = ${weekday},
            start_time = ${startTime},
            end_time = ${endTime},
            resource_id = ${resourceId},
            sport = ${sport},
            default_coach_id = ${coachIds[0] ?? null},
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${lessonId}
        `

        await sql`DELETE FROM club_schedule_template_coaches WHERE template_id = ${lessonId}`
        await sql`DELETE FROM club_class_players WHERE class_id = ${classId}`
      } else {
        const newClasses = (await sql`
          INSERT INTO club_classes (club_id, name, sport)
          VALUES (${clubId}, ${classLabel}, ${sport})
          RETURNING id
        `) as { id: number }[]

        classId = newClasses[0].id

        const newTemplates = (await sql`
          INSERT INTO club_schedule_template (
            club_id,
            weekday,
            start_time,
            end_time,
            resource_id,
            class_id,
            sport,
            default_coach_id
          )
          VALUES (
            ${clubId},
            ${weekday},
            ${startTime},
            ${endTime},
            ${resourceId},
            ${classId},
            ${sport},
            ${coachIds[0] ?? null}
          )
          RETURNING id
        `) as { id: number }[]

        lessonId = newTemplates[0].id
      }

      for (const coachId of coachIds) {
        await sql`
          INSERT INTO club_schedule_template_coaches (template_id, coach_id)
          VALUES (${lessonId}, ${coachId})
          ON CONFLICT DO NOTHING
        `
      }

      let sortOrder = 0
      for (const playerName of playerNames) {
        sortOrder += 1
        await sql`
          INSERT INTO club_class_players (class_id, player_name, sort_order)
          VALUES (${classId}, ${playerName}, ${sortOrder})
        `
      }
    }

    if (operation === 'delete_lesson') {
      const lessonId = Number(body.lessonId)
      if (!lessonId) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'lessonId krävs' }),
        }
      }
      await deleteLessonById(clubId, lessonId)
    }

    if (operation === 'review_schedule_import') {
      const reviewInput = body.review as
        | {
            pagesProcessed?: number
            linesParsed?: number
            lessonCount?: number
            coachCount?: number
            includedCount?: number
            previewWarnings?: string[]
            lessons?: unknown[]
          }
        | undefined

      if (!reviewInput || !Array.isArray(reviewInput.lessons)) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'review.lessons krävs' }),
        }
      }

      const lessons = reviewInput.lessons.slice(0, 120).map((raw) => {
        const lesson = raw as Record<string, unknown>
        const samplePlayers = Array.isArray(lesson.samplePlayers)
          ? (lesson.samplePlayers as unknown[]).map((name) => String(name).trim()).filter(Boolean).slice(0, 3)
          : []
        const warnings = Array.isArray(lesson.warnings)
          ? (lesson.warnings as unknown[]).map((w) => String(w)).filter(Boolean).slice(0, 5)
          : []

        return {
          sport: String(lesson.sport || ''),
          weekday: Number(lesson.weekday) || 0,
          startTime: String(lesson.startTime || ''),
          endTime: String(lesson.endTime || ''),
          venue: String(lesson.venue || ''),
          coachName: lesson.coachName != null ? String(lesson.coachName) : null,
          playerCount: Number(lesson.playerCount) || 0,
          samplePlayers,
          status: String(lesson.status || ''),
          warnings,
          included: lesson.included !== false,
        }
      })

      try {
        const result = await reviewScheduleImportWithAi({
          pagesProcessed: Number(reviewInput.pagesProcessed) || 0,
          linesParsed: Number(reviewInput.linesParsed) || 0,
          lessonCount: Number(reviewInput.lessonCount) || lessons.length,
          coachCount: Number(reviewInput.coachCount) || 0,
          includedCount:
            Number(reviewInput.includedCount) ||
            lessons.filter((lesson) => lesson.included).length,
          previewWarnings: Array.isArray(reviewInput.previewWarnings)
            ? reviewInput.previewWarnings.map((w) => String(w)).slice(0, 20)
            : [],
          lessons,
        })
        return {
          statusCode: 200,
          headers: corsHeaders(origin),
          body: JSON.stringify(result),
        }
      } catch (error: unknown) {
        const err = error as { message?: string }
        return {
          statusCode: 502,
          headers: corsHeaders(origin),
          body: JSON.stringify({
            message: err?.message || 'AI-granskning misslyckades',
          }),
        }
      }
    }

    if (operation === 'import_schedule') {
      const lessonsInput = Array.isArray(body.lessons) ? body.lessons : []
      const replaceSports = Array.isArray(body.replaceSports)
        ? (body.replaceSports as unknown[]).filter((s) => s === 'tennis' || s === 'bordtennis')
        : []
      const createMissingCoaches = !!body.createMissingCoaches
      const createMissingResources = !!body.createMissingResources

      if (lessonsInput.length === 0) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Inga lektioner att importera' }),
        }
      }

      const [clubRow] = (await sql`
        SELECT default_slot_duration_minutes
        FROM clubs
        WHERE id = ${clubId}
        LIMIT 1
      `) as { default_slot_duration_minutes: number }[]

      const defaultDuration = Math.max(20, clubRow?.default_slot_duration_minutes ?? 60)

      for (const sport of replaceSports as LessonSport[]) {
        await deleteAllLessonsForSport(clubId, sport)
      }

      const importCaches = await createImportCaches(clubId)

      let importedCount = 0
      let skippedCount = 0

      for (const rawLesson of lessonsInput) {
        const lesson = rawLesson as {
          sport?: LessonSport
          weekday?: number
          startTime?: string
          durationMinutes?: number
          resourceId?: number
          resourceNumber?: number
          venueRaw?: string
          coachId?: number
          coachName?: string
          playerNames?: string[]
        }

        const sport = lesson.sport
        const weekday = Number(lesson.weekday)
        const startTime = formatTimeValue(lesson.startTime)
        const durationMinutes = Math.max(20, Number(lesson.durationMinutes ?? defaultDuration))
        const playerNames = Array.isArray(lesson.playerNames)
          ? (lesson.playerNames as unknown[])
              .map((name) => String(name).trim())
              .filter((name) => name.length > 0)
          : []

        if (sport !== 'tennis' && sport !== 'bordtennis') {
          skippedCount += 1
          continue
        }
        if (weekday < 1 || weekday > 7) {
          skippedCount += 1
          continue
        }
        if (!startTime || playerNames.length === 0) {
          skippedCount += 1
          continue
        }

        const resourceId = await resolveResourceIdForImport(
          clubId,
          sport,
          Number(lesson.resourceId ?? 0),
          Number(lesson.resourceNumber ?? 0),
          String(lesson.venueRaw || ''),
          createMissingResources,
          importCaches
        )

        if (!resourceId) {
          throw new Error(
            `Saknar bana/bord för lektion ${startTime} (${lesson.venueRaw || 'okänd plats'}). Lägg till under Inställningar eller kryssa i "Skapa saknade banor/bord".`
          )
        }

        const coachIds = await resolveCoachIdsForImport(
          clubId,
          sport,
          Number(lesson.coachId ?? 0),
          lesson.coachName ? String(lesson.coachName) : undefined,
          createMissingCoaches,
          importCaches
        )

        await insertLessonRecord(clubId, {
          weekday,
          sport,
          startTime,
          durationMinutes,
          resourceId,
          coachIds,
          playerNames,
        })
        importedCount += 1
      }

      await syncClubResourceCounts(clubId)

      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ importedCount, skippedCount }),
      }
    }

    if (operation === 'clear_schedule') {
      const confirmPhrase = String(body.confirmPhrase || '').trim().toUpperCase()
      if (confirmPhrase !== CLEAR_SCHEDULE_CONFIRM_PHRASE) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({
            message: `Skriv exakt "${CLEAR_SCHEDULE_CONFIRM_PHRASE}" för att bekräfta`,
          }),
        }
      }

      const deletedCount = await deleteAllClubSchedule(clubId)
      const payload = await getClubPayload(clubId)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ ...payload, deletedCount }),
      }
    }

    return {
      statusCode: 400,
      headers: corsHeaders(origin),
      body: JSON.stringify({ message: `Okänd operation: ${operation}` }),
    }
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string }
    console.error('Error in club-admin:', error)

    if (err?.code === '23505') {
      return {
        statusCode: 400,
        headers: corsHeaders(origin),
        body: JSON.stringify({
          message: 'Den här tiden och banan/bordet är redan upptagen för den veckodagen.',
        }),
      }
    }

    return {
      statusCode: 500,
      headers: corsHeaders(origin),
      body: JSON.stringify({ message: err?.message || 'Internal server error' }),
    }
  }
}
