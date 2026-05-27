import { createHash } from 'crypto'
import { sql } from './database'

export type AttendanceStatus = 'present' | 'absent' | 'unknown'

export type ClubAccess = {
  clubId: number
  isBoss: boolean
  isCoach: boolean
}

export type AuditChange = {
  field: string
  before: unknown
  after: unknown
  isNew: boolean
}

type SessionRow = {
  id: number
  session_date: string
  start_time: string
  end_time: string
  resource_id: number
  class_id: number
  template_id: number | null
  status: string
  sport: string | null
  resource_type: string
  resource_number: number
  resource_label: string | null
  class_name: string | null
}

export async function getClubAccess(userId: number): Promise<ClubAccess | null> {
  try {
    const rows = (await sql`
      SELECT club_id, permissions
      FROM user_club_memberships
      WHERE user_id = ${userId}
        AND (
          permissions @> ARRAY['club_boss']::text[]
          OR permissions @> ARRAY['club_coach']::text[]
        )
      ORDER BY club_id ASC
      LIMIT 1
    `) as { club_id: number; permissions: string[] }[]

    if (!rows.length) return null

    const permissions = rows[0].permissions || []
    return {
      clubId: rows[0].club_id,
      isBoss: permissions.includes('club_boss'),
      isCoach: permissions.includes('club_coach'),
    }
  } catch (error: unknown) {
    const pgError = error as { code?: string }
    if (pgError?.code === '42P01') return null
    throw error
  }
}

function formatTimeValue(value: unknown): string {
  const raw = String(value ?? '00:00')
  return raw.length >= 5 ? raw.slice(0, 5) : raw
}

function formatDateValue(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    // Postgres `date` comes back as UTC midnight — use UTC parts to avoid off-by-one.
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, '0')
    const day = String(value.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const raw = String(value ?? '').trim()
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoMatch) {
    return isoMatch[1]
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear()
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
    const day = String(parsed.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return ''
}

function isoWeekdayFromDateStr(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const jsDay = date.getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export async function writeAuditLog(
  clubId: number,
  actorUserId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  summary: string,
  payload: Record<string, unknown>
) {
  await sql`
    INSERT INTO club_audit_log (
      club_id, actor_user_id, action, entity_type, entity_id, summary, payload
    )
    VALUES (
      ${clubId},
      ${actorUserId},
      ${action},
      ${entityType},
      ${entityId},
      ${summary},
      ${JSON.stringify(payload)}::jsonb
    )
  `
}

export async function notifyClubBosses(
  clubId: number,
  type: string,
  title: string,
  body: string,
  sessionId: number | null
) {
  await sql`
    INSERT INTO club_notifications (club_id, user_id, type, title, body, session_id)
    SELECT ${clubId}, m.user_id, ${type}, ${title}, ${body}, ${sessionId}
    FROM user_club_memberships m
    WHERE m.club_id = ${clubId}
      AND m.permissions @> ARRAY['club_boss']::text[]
  `
}

async function isDayCancelled(clubId: number, dateStr: string): Promise<boolean> {
  const rows = (await sql`
    SELECT 1
    FROM club_cancelled_days
    WHERE club_id = ${clubId}
      AND cancel_date = ${dateStr}::date
    LIMIT 1
  `) as { '?column?': number }[]
  return rows.length > 0
}

async function ensureSessionRoster(sessionId: number, classId: number, templateId: number | null) {
  const existing = (await sql`
    SELECT COUNT(*)::int AS count
    FROM club_session_players
    WHERE session_id = ${sessionId}
  `) as { count: number }[]

  if (Number(existing[0]?.count ?? 0) > 0) return

  const classPlayers = (await sql`
    SELECT id, player_name, sort_order
    FROM club_class_players
    WHERE class_id = ${classId}
      AND is_active = true
    ORDER BY sort_order ASC, id ASC
  `) as { id: number; player_name: string; sort_order: number }[]

  for (const player of classPlayers) {
    try {
      await sql`
        INSERT INTO club_session_players (
          session_id, player_id, player_name, is_day_addition, is_removed, sort_order
        )
        VALUES (
          ${sessionId},
          ${player.id},
          ${player.player_name},
          false,
          false,
          ${player.sort_order}
        )
      `
    } catch (error: unknown) {
      const err = error as { code?: string }
      // Another parallel request may have inserted the same roster row first.
      if (err?.code !== '23505') throw error
    }
  }

  const coachIds: number[] = []
  if (templateId) {
    const templateCoaches = (await sql`
      SELECT coach_id
      FROM club_schedule_template_coaches
      WHERE template_id = ${templateId}
      ORDER BY coach_id ASC
    `) as { coach_id: number }[]
    coachIds.push(...templateCoaches.map((row) => row.coach_id))
  }

  for (const coachId of coachIds) {
    await sql`
      INSERT INTO club_session_coaches (session_id, coach_id, is_day_addition, is_removed)
      VALUES (${sessionId}, ${coachId}, false, false)
      ON CONFLICT (session_id, coach_id) DO NOTHING
    `
  }
}

async function upsertSessionFromTemplate(
  clubId: number,
  dateStr: string,
  template: {
    id: number
    start_time: string
    end_time: string
    resource_id: number
    class_id: number
    default_coach_id: number | null
  }
): Promise<number> {
  const startTime = formatTimeValue(template.start_time)
  const endTime = formatTimeValue(template.end_time)

  const inserted = (await sql`
    INSERT INTO club_sessions (
      club_id,
      session_date,
      start_time,
      end_time,
      resource_id,
      class_id,
      planned_coach_id,
      actual_coach_id,
      status,
      source,
      template_id
    )
    VALUES (
      ${clubId},
      ${dateStr}::date,
      ${startTime},
      ${endTime},
      ${template.resource_id},
      ${template.class_id},
      ${template.default_coach_id},
      ${template.default_coach_id},
      'scheduled',
      'template',
      ${template.id}
    )
    ON CONFLICT (club_id, session_date, resource_id, start_time)
    DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    RETURNING id, class_id, template_id
  `) as { id: number; class_id: number; template_id: number | null }[]

  const session = inserted[0]
  await ensureSessionRoster(session.id, session.class_id, session.template_id ?? template.id)
  return session.id
}

export async function ensureSessionsForDate(clubId: number, dateStr: string): Promise<void> {
  if (await isDayCancelled(clubId, dateStr)) return

  const weekday = isoWeekdayFromDateStr(dateStr)
  const templates = (await sql`
    SELECT
      t.id,
      t.start_time,
      t.end_time,
      t.resource_id,
      t.class_id,
      t.default_coach_id
    FROM club_schedule_template t
    WHERE t.club_id = ${clubId}
      AND t.weekday = ${weekday}
      AND t.is_active = true
    ORDER BY t.start_time ASC, t.id ASC
  `) as {
    id: number
    start_time: string
    end_time: string
    resource_id: number
    class_id: number
    default_coach_id: number | null
  }[]

  for (const template of templates) {
    const cancelledOverride = (await sql`
      SELECT 1
      FROM club_schedule_slot_overrides
      WHERE club_id = ${clubId}
        AND override_date = ${dateStr}::date
        AND template_id = ${template.id}
        AND action = 'cancel'
      LIMIT 1
    `) as { '?column?': number }[]

    if (cancelledOverride.length) continue

    await upsertSessionFromTemplate(clubId, dateStr, template)
  }
}

async function loadSessionCoaches(sessionId: number) {
  return (await sql`
    SELECT
      sc.id,
      sc.coach_id,
      sc.is_day_addition,
      sc.is_removed,
      c.name
    FROM club_session_coaches sc
    INNER JOIN club_coaches c ON c.id = sc.coach_id
    WHERE sc.session_id = ${sessionId}
    ORDER BY sc.is_removed ASC, c.name ASC, sc.id ASC
  `) as {
    id: number
    coach_id: number
    is_day_addition: boolean
    is_removed: boolean
    name: string
  }[]
}

async function loadSessionPlayers(sessionId: number) {
  return (await sql`
    SELECT
      sp.id,
      sp.player_id,
      sp.player_name,
      sp.is_day_addition,
      sp.is_removed,
      sp.sort_order,
      a.status AS attendance_status,
      a.marked_at,
      a.marked_by_user_id
    FROM club_session_players sp
    LEFT JOIN club_attendance a
      ON a.session_id = sp.session_id
      AND a.session_player_id = sp.id
    WHERE sp.session_id = ${sessionId}
    ORDER BY sp.is_removed ASC, sp.sort_order ASC, sp.id ASC
  `) as {
    id: number
    player_id: number | null
    player_name: string
    is_day_addition: boolean
    is_removed: boolean
    sort_order: number
    attendance_status: AttendanceStatus | null
    marked_at: string | null
    marked_by_user_id: number | null
  }[]
}

export type DayPayloadResponse =
  | { unchanged: true; date: string; version: string }
  | {
      unchanged: false
      date: string
      cancelled: boolean
      tennisEnabled: boolean
      bordtennisEnabled: boolean
      sessions: unknown[]
      coachesCatalog: { id: number; name: string; sport: string }[]
      version: string
    }

export function normalizeIfNoneMatch(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.replace(/^W\//, '').replace(/^"|"$/g, '')
}

// Cheap fingerprint for a day's närvaro — used before building the full day payload.
export async function getDayRevision(clubId: number, dateStr: string): Promise<string> {
  const cancelled = await isDayCancelled(clubId, dateStr)

  const [row] = (await sql`
    SELECT md5(
      ${dateStr} || '|' || ${cancelled ? '1' : '0'} || '|' || COALESCE((
        SELECT string_agg(token, ';' ORDER BY sort_key)
        FROM (
          SELECT
            (s.start_time::text || '|' || s.id::text) AS sort_key,
            s.id::text || '|' ||
            COALESCE((
              SELECT string_agg(
                sc.coach_id::text || ':' || sc.is_removed::text,
                ',' ORDER BY sc.coach_id
              )
              FROM club_session_coaches sc
              WHERE sc.session_id = s.id
            ), '') || '|' ||
            COALESCE((
              SELECT string_agg(
                sp.id::text || ':' || sp.is_removed::text || ':' || COALESCE(a.status, 'unknown'),
                ',' ORDER BY sp.id
              )
              FROM club_session_players sp
              LEFT JOIN club_attendance a
                ON a.session_id = s.id
                AND a.session_player_id = sp.id
              WHERE sp.session_id = s.id
            ), '') AS token
          FROM club_sessions s
          WHERE s.club_id = ${clubId}
            AND s.session_date = ${dateStr}::date
            AND s.status <> 'cancelled'
        ) lines
      ), '')
    ) AS revision
  `) as { revision: string }[]

  return row?.revision ?? createHash('md5').update(`${clubId}:${dateStr}:empty`).digest('hex')
}

export async function getDayPayloadForRequest(
  clubId: number,
  dateStr: string,
  ifNoneMatch?: string | null
): Promise<DayPayloadResponse> {
  try {
    await ensureSessionsForDate(clubId, dateStr)
  } catch (error: unknown) {
    const err = error as { code?: string }
    // Two coaches loading the same new day at once can race on session creation.
    if (err?.code !== '23505') throw error
  }
  const version = await getDayRevision(clubId, dateStr)
  const clientVersion = normalizeIfNoneMatch(ifNoneMatch)

  if (clientVersion && clientVersion === version) {
    return { unchanged: true, date: dateStr, version }
  }

  const payload = await getDayPayload(clubId, dateStr, { skipEnsure: true })
  return { unchanged: false, ...payload, version }
}

export async function getDayPayload(
  clubId: number,
  dateStr: string,
  options?: { skipEnsure?: boolean }
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Ogiltigt datum: ${dateStr}`)
  }

  if (!options?.skipEnsure) {
    await ensureSessionsForDate(clubId, dateStr)
  }

  const cancelled = await isDayCancelled(clubId, dateStr)

  const sessions = (await sql`
    SELECT
      s.id,
      s.session_date,
      s.start_time,
      s.end_time,
      s.resource_id,
      s.class_id,
      s.template_id,
      s.status,
      t.sport,
      r.resource_type,
      r.resource_number,
      r.label AS resource_label,
      c.name AS class_name
    FROM club_sessions s
    INNER JOIN club_resources r ON r.id = s.resource_id
    LEFT JOIN club_classes c ON c.id = s.class_id
    LEFT JOIN club_schedule_template t ON t.id = s.template_id
    WHERE s.club_id = ${clubId}
      AND s.session_date = ${dateStr}::date
      AND s.status <> 'cancelled'
    ORDER BY s.start_time ASC, s.id ASC
  `) as SessionRow[]

  const coachesCatalog = (await sql`
    SELECT id, name, sport
    FROM club_coaches
    WHERE club_id = ${clubId}
      AND is_active = true
    ORDER BY sport ASC, sort_order ASC, id ASC
  `) as { id: number; name: string; sport: string }[]

  const [clubRow] = (await sql`
    SELECT tennis_enabled, bordtennis_enabled
    FROM clubs
    WHERE id = ${clubId}
    LIMIT 1
  `) as { tennis_enabled: boolean; bordtennis_enabled: boolean }[]

  const sessionPayload = []
  const sessionIds = sessions.map((session) => session.id)

  const coachesBySession = new Map<number, Awaited<ReturnType<typeof loadSessionCoaches>>>()
  const playersBySession = new Map<number, Awaited<ReturnType<typeof loadSessionPlayers>>>()

  if (sessionIds.length > 0) {
    const allCoaches = (await sql`
      SELECT
        sc.id,
        sc.session_id,
        sc.coach_id,
        sc.is_day_addition,
        sc.is_removed,
        c.name
      FROM club_session_coaches sc
      INNER JOIN club_coaches c ON c.id = sc.coach_id
      WHERE sc.session_id = ANY(${sessionIds}::int[])
      ORDER BY sc.session_id ASC, sc.is_removed ASC, c.name ASC, sc.id ASC
    `) as {
      id: number
      session_id: number
      coach_id: number
      is_day_addition: boolean
      is_removed: boolean
      name: string
    }[]

    for (const row of allCoaches) {
      const list = coachesBySession.get(row.session_id) || []
      list.push({
        id: row.id,
        coach_id: row.coach_id,
        is_day_addition: row.is_day_addition,
        is_removed: row.is_removed,
        name: row.name,
      })
      coachesBySession.set(row.session_id, list)
    }

    const allPlayers = (await sql`
      SELECT
        sp.id,
        sp.session_id,
        sp.player_id,
        sp.player_name,
        sp.is_day_addition,
        sp.is_removed,
        sp.sort_order,
        a.status AS attendance_status,
        a.marked_at,
        a.marked_by_user_id
      FROM club_session_players sp
      LEFT JOIN club_attendance a
        ON a.session_id = sp.session_id
        AND a.session_player_id = sp.id
      WHERE sp.session_id = ANY(${sessionIds}::int[])
      ORDER BY sp.session_id ASC, sp.is_removed ASC, sp.sort_order ASC, sp.id ASC
    `) as {
      id: number
      session_id: number
      player_id: number | null
      player_name: string
      is_day_addition: boolean
      is_removed: boolean
      sort_order: number
      attendance_status: AttendanceStatus | null
      marked_at: string | null
      marked_by_user_id: number | null
    }[]

    for (const row of allPlayers) {
      const list = playersBySession.get(row.session_id) || []
      list.push({
        id: row.id,
        player_id: row.player_id,
        player_name: row.player_name,
        is_day_addition: row.is_day_addition,
        is_removed: row.is_removed,
        sort_order: row.sort_order,
        attendance_status: row.attendance_status,
        marked_at: row.marked_at,
        marked_by_user_id: row.marked_by_user_id,
      })
      playersBySession.set(row.session_id, list)
    }
  }

  for (const session of sessions) {
    const sport =
      session.sport ||
      (session.resource_type === 'court' ? 'tennis' : 'bordtennis')

    const coachRows = coachesBySession.get(session.id) || []
    const playerRows = playersBySession.get(session.id) || []

    sessionPayload.push({
      id: session.id,
      date: formatDateValue(session.session_date),
      startTime: formatTimeValue(session.start_time),
      endTime: formatTimeValue(session.end_time),
      sport,
      resourceId: session.resource_id,
      resourceType: session.resource_type,
      resourceNumber: session.resource_number,
      resourceLabel: session.resource_label,
      classId: session.class_id,
      className: session.class_name,
      coaches: coachRows.map((coach) => ({
        id: coach.id,
        coachId: coach.coach_id,
        name: coach.name,
        isDayAddition: coach.is_day_addition,
        isRemoved: coach.is_removed,
      })),
      players: playerRows.map((player) => ({
        id: player.id,
        playerId: player.player_id,
        name: player.player_name,
        isDayAddition: player.is_day_addition,
        isRemoved: player.is_removed,
        attendanceStatus: player.attendance_status || 'unknown',
        markedAt: player.marked_at,
      })),
    })
  }

  return {
    date: dateStr,
    cancelled,
    tennisEnabled: !!clubRow?.tennis_enabled,
    bordtennisEnabled: !!clubRow?.bordtennis_enabled,
    sessions: sessionPayload,
    coachesCatalog,
  }
}

export async function updateSessionDay(
  clubId: number,
  actorUserId: number,
  sessionId: number,
  input: {
    coachIds?: number[]
    players?: {
      sessionPlayerId?: number
      name?: string
      removed?: boolean
    }[]
    attendance?: {
      sessionPlayerId: number
      status: AttendanceStatus
    }[]
  }
) {
  const sessionRows = (await sql`
    SELECT id, session_date, start_time, class_id
    FROM club_sessions
    WHERE id = ${sessionId}
      AND club_id = ${clubId}
    LIMIT 1
  `) as { id: number; session_date: string; start_time: string; class_id: number }[]

  if (!sessionRows.length) {
    throw new Error('Lektionen hittades inte')
  }

  const session = sessionRows[0]
  const dateStr = formatDateValue(session.session_date)
  const changes: AuditChange[] = []

  if (Array.isArray(input.coachIds)) {
    const desiredCoachIds = input.coachIds.filter((id) => id > 0)
    const existingCoaches = await loadSessionCoaches(sessionId)
    const activeBefore = existingCoaches.filter((c) => !c.is_removed).map((c) => c.name)

    for (const coach of existingCoaches) {
      const shouldBeActive = desiredCoachIds.includes(coach.coach_id)
      if (shouldBeActive && coach.is_removed) {
        await sql`
          UPDATE club_session_coaches
          SET is_removed = false, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${coach.id}
        `
      }
      if (!shouldBeActive && !coach.is_removed) {
        await sql`
          UPDATE club_session_coaches
          SET is_removed = true, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${coach.id}
        `
      }
    }

    for (const coachId of desiredCoachIds) {
      const existing = existingCoaches.find((c) => c.coach_id === coachId)
      if (!existing) {
        await sql`
          INSERT INTO club_session_coaches (session_id, coach_id, is_day_addition, is_removed)
          VALUES (${sessionId}, ${coachId}, true, false)
          ON CONFLICT (session_id, coach_id)
          DO UPDATE SET is_removed = false, is_day_addition = true, updated_at = CURRENT_TIMESTAMP
        `
      }
    }

    const coachesAfter = await loadSessionCoaches(sessionId)
    const activeAfter = coachesAfter.filter((c) => !c.is_removed).map((c) => c.name)
    if (JSON.stringify(activeBefore) !== JSON.stringify(activeAfter)) {
      changes.push({
        field: 'coaches',
        before: activeBefore,
        after: activeAfter,
        isNew: coachesAfter.some((c) => c.is_day_addition && !c.is_removed),
      })
    }
  }

  if (Array.isArray(input.players)) {
    for (const playerInput of input.players) {
      const sessionPlayerId = Number(playerInput.sessionPlayerId ?? 0)
      const name = String(playerInput.name || '').trim()
      const removed = !!playerInput.removed

      if (sessionPlayerId > 0) {
        const beforeRows = (await sql`
          SELECT player_name, is_removed, is_day_addition
          FROM club_session_players
          WHERE id = ${sessionPlayerId}
            AND session_id = ${sessionId}
          LIMIT 1
        `) as { player_name: string; is_removed: boolean; is_day_addition: boolean }[]

        if (!beforeRows.length) continue
        const before = beforeRows[0]

        if (before.is_removed !== removed) {
          await sql`
            UPDATE club_session_players
            SET is_removed = ${removed}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${sessionPlayerId}
          `
          changes.push({
            field: 'player',
            before: before.player_name,
            after: removed ? `${before.player_name} (borttagen för dagen)` : before.player_name,
            isNew: false,
          })
        }
      } else if (name.length > 0) {
        const inserted = (await sql`
          INSERT INTO club_session_players (
            session_id, player_name, is_day_addition, is_removed, sort_order
          )
          VALUES (
            ${sessionId},
            ${name},
            true,
            false,
            (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM club_session_players WHERE session_id = ${sessionId})
          )
          RETURNING id, player_name
        `) as { id: number; player_name: string }[]

        changes.push({
          field: 'player',
          before: null,
          after: inserted[0].player_name,
          isNew: true,
        })
      }
    }
  }

  if (Array.isArray(input.attendance)) {
    for (const row of input.attendance) {
      const sessionPlayerId = Number(row.sessionPlayerId)
      const status = row.status
      if (sessionPlayerId <= 0) continue
      if (status !== 'present' && status !== 'absent' && status !== 'unknown') continue

      const playerRows = (await sql`
        SELECT player_name, is_removed
        FROM club_session_players
        WHERE id = ${sessionPlayerId}
          AND session_id = ${sessionId}
        LIMIT 1
      `) as { player_name: string; is_removed: boolean }[]

      if (!playerRows.length || playerRows[0].is_removed) continue

      const existing = (await sql`
        SELECT status
        FROM club_attendance
        WHERE session_id = ${sessionId}
          AND session_player_id = ${sessionPlayerId}
        LIMIT 1
      `) as { status: AttendanceStatus }[]

      const beforeStatus = existing[0]?.status || 'unknown'

      if (existing.length) {
        await sql`
          UPDATE club_attendance
          SET
            status = ${status},
            marked_at = CURRENT_TIMESTAMP,
            marked_by_user_id = ${actorUserId},
            updated_at = CURRENT_TIMESTAMP
          WHERE session_id = ${sessionId}
            AND session_player_id = ${sessionPlayerId}
        `
      } else {
        await sql`
          INSERT INTO club_attendance (
            session_id, session_player_id, status, marked_at, marked_by_user_id
          )
          VALUES (
            ${sessionId},
            ${sessionPlayerId},
            ${status},
            CURRENT_TIMESTAMP,
            ${actorUserId}
          )
        `
      }

      if (beforeStatus !== status) {
        changes.push({
          field: 'attendance',
          before: { player: playerRows[0].player_name, status: beforeStatus },
          after: { player: playerRows[0].player_name, status },
          isNew: false,
        })
      }
    }
  }

  if (changes.length > 0) {
    const timeLabel = formatTimeValue(session.start_time)
    const summary = `${dateStr} ${timeLabel}: ${changes.length} ändring(ar)`
    await writeAuditLog(
      clubId,
      actorUserId,
      'session_day_update',
      'club_session',
      sessionId,
      summary,
      { sessionDate: dateStr, sessionId, changes }
    )

    const changeLines = changes.map((change) => {
      if (change.field === 'attendance') {
        const after = change.after as { player: string; status: string }
        return `${after.player}: ${after.status}`
      }
      if (change.isNew) return `+ ${String(change.after)}`
      return `${change.field}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`
    })

    await notifyClubBosses(
      clubId,
      'session_day_update',
      `Ändring ${dateStr} ${timeLabel}`,
      changeLines.join('\n'),
      sessionId
    )
  }

  return getDayPayloadForRequest(clubId, dateStr)
}

export async function getAuditLog(clubId: number, fromDate: string, toDate: string) {
  const rows = (await sql`
    SELECT
      a.id,
      a.action,
      a.entity_type,
      a.entity_id,
      a.summary,
      a.payload,
      a.created_at,
      u.name AS actor_name,
      u.email AS actor_email
    FROM club_audit_log a
    LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE a.club_id = ${clubId}
      AND a.created_at >= ${fromDate}::date
      AND a.created_at < (${toDate}::date + INTERVAL '1 day')
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 200
  `) as {
    id: number
    action: string
    entity_type: string
    entity_id: number | null
    summary: string
    payload: Record<string, unknown> | null
    created_at: string
    actor_name: string | null
    actor_email: string | null
  }[]

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    payload: row.payload,
    createdAt: row.created_at,
    actorName: row.actor_name || row.actor_email || 'Okänd',
  }))
}

export async function getNotifications(clubId: number, userId: number) {
  const rows = (await sql`
    SELECT id, type, title, body, session_id, read_at, created_at
    FROM club_notifications
    WHERE club_id = ${clubId}
      AND user_id = ${userId}
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  `) as {
    id: number
    type: string
    title: string
    body: string
    session_id: number | null
    read_at: string | null
    created_at: string
  }[]

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    sessionId: row.session_id,
    readAt: row.read_at,
    createdAt: row.created_at,
    isUnread: !row.read_at,
  }))
}

export async function markNotificationsRead(clubId: number, userId: number, notificationIds?: number[]) {
  if (Array.isArray(notificationIds) && notificationIds.length > 0) {
    for (const id of notificationIds) {
      await sql`
        UPDATE club_notifications
        SET read_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
          AND club_id = ${clubId}
          AND user_id = ${userId}
          AND read_at IS NULL
      `
    }
    return
  }

  await sql`
    UPDATE club_notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE club_id = ${clubId}
      AND user_id = ${userId}
      AND read_at IS NULL
  `
}

export async function getAttendanceHistory(clubId: number, fromDate: string, toDate: string) {
  let cursor = fromDate
  while (cursor <= toDate) {
    await ensureSessionsForDate(clubId, cursor)
    cursor = addDaysToDateStr(cursor, 1)
  }

  const sessions = (await sql`
    SELECT
      s.id,
      s.session_date,
      s.start_time,
      s.end_time,
      r.resource_type,
      r.resource_number,
      r.label AS resource_label,
      c.name AS class_name,
      t.sport
    FROM club_sessions s
    INNER JOIN club_resources r ON r.id = s.resource_id
    LEFT JOIN club_classes c ON c.id = s.class_id
    LEFT JOIN club_schedule_template t ON t.id = s.template_id
    WHERE s.club_id = ${clubId}
      AND s.session_date >= ${fromDate}::date
      AND s.session_date <= ${toDate}::date
      AND s.status <> 'cancelled'
    ORDER BY s.session_date DESC, s.start_time ASC, s.id ASC
  `) as SessionRow[]

  const result = []
  for (const session of sessions) {
    const players = await loadSessionPlayers(session.id)
    const activePlayers = players.filter((p) => !p.is_removed)
    const present = activePlayers.filter((p) => p.attendance_status === 'present').length
    const absent = activePlayers.filter((p) => p.attendance_status === 'absent').length
    const unknown = activePlayers.filter((p) => !p.attendance_status || p.attendance_status === 'unknown').length

    result.push({
      sessionId: session.id,
      date: formatDateValue(session.session_date),
      startTime: formatTimeValue(session.start_time),
      endTime: formatTimeValue(session.end_time),
      sport: session.sport || (session.resource_type === 'court' ? 'tennis' : 'bordtennis'),
      resourceLabel: session.resource_label,
      resourceNumber: session.resource_number,
      className: session.class_name,
      summary: { present, absent, unknown, total: activePlayers.length },
      players: activePlayers.map((p) => ({
        id: p.id,
        name: p.player_name,
        status: p.attendance_status || 'unknown',
        isDayAddition: p.is_day_addition,
      })),
    })
  }

  return result
}

export function defaultHistoryRange(): { fromDate: string; toDate: string } {
  const today = new Date()
  const toDate = today.toISOString().slice(0, 10)
  const fromDate = addDaysToDateStr(toDate, -30)
  return { fromDate, toDate }
}
