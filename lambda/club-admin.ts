import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromCognitoSession } from './utils/cognito-auth'

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

function corsHeaders(origin: string) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
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
  try {
    const rows = (await sql`
      SELECT club_id
      FROM user_club_memberships
      WHERE user_id = ${userId}
        AND permissions @> ARRAY['club_boss']::text[]
      ORDER BY club_id ASC
      LIMIT 1
    `) as { club_id: number }[]

    return rows.length ? rows[0].club_id : null
  } catch (error: unknown) {
    const pgError = error as { code?: string }
    if (pgError?.code === '42P01') {
      return null
    }
    throw error
  }
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
      r.resource_type,
      r.resource_number,
      r.label AS resource_label
    FROM club_schedule_template t
    INNER JOIN club_resources r ON r.id = t.resource_id
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
    resource_type: ResourceType
    resource_number: number
    resource_label: string | null
  }[]

  const lessonsByWeekday: Record<string, unknown[]> = {}
  for (let day = 1; day <= 7; day += 1) {
    lessonsByWeekday[String(day)] = []
  }

  for (const template of templates) {
    const sport =
      template.sport ||
      (template.resource_type === 'court' ? 'tennis' : 'bordtennis')

    const coachRows = (await sql`
      SELECT c.id, c.name
      FROM club_schedule_template_coaches tc
      INNER JOIN club_coaches c ON c.id = tc.coach_id
      WHERE tc.template_id = ${template.id}
      ORDER BY c.id ASC
    `) as { id: number; name: string }[]

    const playerRows = (await sql`
      SELECT id, player_name
      FROM club_class_players
      WHERE class_id = ${template.class_id}
        AND is_active = true
      ORDER BY sort_order ASC, id ASC
    `) as { id: number; player_name: string }[]

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
      coachIds: coachRows.map((coach) => coach.id),
      coaches: coachRows,
      players: playerRows.map((player) => ({
        id: player.id,
        name: player.player_name,
      })),
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
  }
) {
  const startTime = formatTimeValue(params.startTime)
  const durationMinutes = Math.max(20, params.durationMinutes)
  const endTime = addMinutesToTime(startTime, durationMinutes)
  const weekdayNames = ['', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
  const classLabel = `${weekdayNames[params.weekday]} ${startTime} ${params.sport}`

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

  let sortOrder = 0
  for (const playerName of params.playerNames) {
    sortOrder += 1
    await sql`
      INSERT INTO club_class_players (class_id, player_name, sort_order)
      VALUES (${classId}, ${playerName}, ${sortOrder})
    `
  }
}

async function deleteAllLessonsForSport(clubId: number, sport: LessonSport) {
  const templates = (await sql`
    SELECT id
    FROM club_schedule_template
    WHERE club_id = ${clubId}
      AND sport = ${sport}
  `) as { id: number }[]

  for (const template of templates) {
    await deleteLessonById(clubId, template.id)
  }
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

    const clubId = await getBossClubId(userId)
    if (!clubId) {
      return {
        statusCode: 403,
        headers: corsHeaders(origin),
        body: JSON.stringify({ message: 'Club boss permission required' }),
      }
    }

    if (event.httpMethod === 'GET') {
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
      const classLabel = `${weekdayNames[weekday]} ${startTime} ${sport}`

      let lessonId = Number(body.lessonId ?? 0)
      let classId = 0

      if (operation === 'update_lesson') {
        if (!lessonId) {
          return {
            statusCode: 400,
            headers: corsHeaders(origin),
            body: JSON.stringify({ message: 'lessonId krävs' }),
          }
        }

        const existing = (await sql`
          SELECT id, class_id
          FROM club_schedule_template
          WHERE id = ${lessonId}
            AND club_id = ${clubId}
          LIMIT 1
        `) as { id: number; class_id: number }[]

        if (!existing.length) {
          return {
            statusCode: 404,
            headers: corsHeaders(origin),
            body: JSON.stringify({ message: 'Lektionen hittades inte' }),
          }
        }

        classId = existing[0].class_id

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

      let importedCount = 0

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

        if (sport !== 'tennis' && sport !== 'bordtennis') continue
        if (weekday < 1 || weekday > 7) continue
        if (!startTime || playerNames.length === 0) continue

        let resourceId = Number(lesson.resourceId ?? 0)
        if (!resourceId && createMissingResources) {
          const resourceNumber = Number(lesson.resourceNumber ?? 0)
          const resourceType: ResourceType = sport === 'tennis' ? 'court' : 'table'
          const label = String(lesson.venueRaw || '').trim() || `${resourceType === 'court' ? 'Bana' : 'Bord'} ${resourceNumber}`

          if (resourceNumber > 0) {
            const existing = (await sql`
              SELECT id
              FROM club_resources
              WHERE club_id = ${clubId}
                AND resource_type = ${resourceType}
                AND resource_number = ${resourceNumber}
                AND is_active = true
              LIMIT 1
            `) as { id: number }[]

            if (existing.length) {
              resourceId = existing[0].id
            } else {
              const created = (await sql`
                INSERT INTO club_resources (club_id, resource_type, resource_number, label, is_active)
                VALUES (${clubId}, ${resourceType}, ${resourceNumber}, ${label}, true)
                RETURNING id
              `) as { id: number }[]
              resourceId = created[0].id
            }
          }
        }

        if (!resourceId) {
          throw new Error(
            `Saknar bana/bord för lektion ${startTime} (${lesson.venueRaw || 'okänd plats'}). Lägg till under Inställningar eller kryssa i "Skapa saknade banor/bord".`
          )
        }

        const coachIds: number[] = []
        const coachId = Number(lesson.coachId ?? 0)
        if (coachId > 0) {
          coachIds.push(coachId)
        } else if (lesson.coachName && createMissingCoaches) {
          const coachName = String(lesson.coachName).trim()
          if (looksLikePhoneNumber(coachName)) {
            continue
          }
          let resolvedCoachId = await findCoachByName(clubId, coachName)
          if (!resolvedCoachId) {
            const inserted = (await sql`
              INSERT INTO club_coaches (club_id, name, sport)
              VALUES (${clubId}, ${coachName}, ${sport})
              RETURNING id
            `) as { id: number }[]
            resolvedCoachId = inserted[0].id
          }
          if (resolvedCoachId) {
            coachIds.push(resolvedCoachId)
          }
        }

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

      const payload = await getClubPayload(clubId)
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ ...payload, importedCount }),
      }
    }

    const payload = await getClubPayload(clubId)
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify(payload),
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
