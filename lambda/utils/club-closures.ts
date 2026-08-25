import { isUndefinedTable, sql } from './database'

export type ClosureType = 'lov' | 'rod_dag'

export type DayClosure = {
  closed: boolean
  type: ClosureType | null
  label: string | null
}

export type RodDayRow = {
  id: number
  date: string
  label: string | null
}

export type LovRangeRow = {
  id: number
  fromDate: string
  toDate: string
  label: string | null
}

export type ClubClosuresPayload = {
  rodDays: RodDayRow[]
  lovRanges: LovRangeRow[]
}

function formatDateValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  const raw = String(value ?? '')
  if (raw.length >= 10) return raw.slice(0, 10)
  return raw
}

export async function getDayClosure(clubId: number, dateStr: string): Promise<DayClosure> {
  const rodRows = (await sql`
    SELECT reason
    FROM club_cancelled_days
    WHERE club_id = ${clubId}
      AND cancel_date = ${dateStr}::date
    LIMIT 1
  `) as { reason: string | null }[]

  if (rodRows.length > 0) {
    const reason = rodRows[0].reason?.trim()
    return {
      closed: true,
      type: 'rod_dag',
      label: reason || 'Röd dag',
    }
  }

  try {
    const lovRows = (await sql`
      SELECT label
      FROM club_closure_ranges
      WHERE club_id = ${clubId}
        AND ${dateStr}::date BETWEEN from_date AND to_date
      ORDER BY from_date DESC, id DESC
      LIMIT 1
    `) as { label: string | null }[]

    if (lovRows.length > 0) {
      const label = lovRows[0].label?.trim()
      return {
        closed: true,
        type: 'lov',
        label: label || 'lov/tävling',
      }
    }
  } catch (error: unknown) {
    // Production may not have the lov table yet; närvaro should still load.
    if (!isUndefinedTable(error)) throw error
  }

  return { closed: false, type: null, label: null }
}

export async function listClubClosures(clubId: number): Promise<ClubClosuresPayload> {
  const rodRows = (await sql`
    SELECT id, cancel_date, reason
    FROM club_cancelled_days
    WHERE club_id = ${clubId}
    ORDER BY cancel_date DESC
  `) as { id: number; cancel_date: string; reason: string | null }[]

  const lovRows = (await sql`
    SELECT id, from_date, to_date, label
    FROM club_closure_ranges
    WHERE club_id = ${clubId}
    ORDER BY from_date DESC, id DESC
  `) as { id: number; from_date: string; to_date: string; label: string | null }[]

  return {
    rodDays: rodRows.map((row) => ({
      id: row.id,
      date: formatDateValue(row.cancel_date),
      label: row.reason?.trim() || null,
    })),
    lovRanges: lovRows.map((row) => ({
      id: row.id,
      fromDate: formatDateValue(row.from_date),
      toDate: formatDateValue(row.to_date),
      label: row.label?.trim() || null,
    })),
  }
}

export async function addRodDay(
  clubId: number,
  dateStr: string,
  userId: number,
  label?: string | null
): Promise<void> {
  const reason = label?.trim() || 'Röd dag'
  await sql`
    INSERT INTO club_cancelled_days (
      club_id,
      cancel_date,
      reason,
      closure_type,
      created_by_user_id
    )
    VALUES (
      ${clubId},
      ${dateStr}::date,
      ${reason},
      'rod_dag',
      ${userId}
    )
    ON CONFLICT (club_id, cancel_date)
    DO UPDATE SET
      reason = EXCLUDED.reason,
      closure_type = 'rod_dag',
      created_by_user_id = EXCLUDED.created_by_user_id
  `
}

export async function removeRodDay(clubId: number, dateStr: string): Promise<void> {
  await sql`
    DELETE FROM club_cancelled_days
    WHERE club_id = ${clubId}
      AND cancel_date = ${dateStr}::date
  `
}

export async function addLovRange(
  clubId: number,
  fromDate: string,
  toDate: string,
  userId: number,
  label?: string | null
): Promise<void> {
  if (fromDate > toDate) {
    throw new Error('Slutdatum måste vara samma dag eller efter startdatum')
  }

  await sql`
    INSERT INTO club_closure_ranges (
      club_id,
      from_date,
      to_date,
      label,
      created_by_user_id
    )
    VALUES (
      ${clubId},
      ${fromDate}::date,
      ${toDate}::date,
      ${label?.trim() || 'lov/tävling'},
      ${userId}
    )
  `
}

export async function removeLovRange(clubId: number, rangeId: number): Promise<void> {
  await sql`
    DELETE FROM club_closure_ranges
    WHERE club_id = ${clubId}
      AND id = ${rangeId}
  `
}
