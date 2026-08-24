import { sql } from './database'
import { getClubIdBySlug } from './club-membership'

export const CLEANUP_CONFIRM_PHRASE = 'RADERA GAMMAL NARVARO'

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function cutoffDateFromRetentionDays(retentionDays: number): string {
  const safeDays = Math.max(1, Math.floor(retentionDays))
  return addDaysToDateStr(todayDateStr(), -safeDays)
}

export type ClubCleanupPreview = {
  clubId: number
  clubName: string
  clubSlug: string
  retentionDays: number
  deleteAll: boolean
  cutoffDate: string
  sessions: number
  auditLogEntries: number
  notifications: number
}

async function countRows(
  clubId: number,
  cutoffDate: string
): Promise<{ sessions: number; auditLogEntries: number; notifications: number }> {
  const sessionRows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM club_sessions
    WHERE club_id = ${clubId}
      AND session_date < ${cutoffDate}::date
  `) as { count: number }[]

  const auditRows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM club_audit_log
    WHERE club_id = ${clubId}
      AND created_at < (${cutoffDate}::date + INTERVAL '1 day')
  `) as { count: number }[]

  const notificationRows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM club_notifications
    WHERE club_id = ${clubId}
      AND created_at < (${cutoffDate}::date + INTERVAL '1 day')
  `) as { count: number }[]

  return {
    sessions: sessionRows[0]?.count ?? 0,
    auditLogEntries: auditRows[0]?.count ?? 0,
    notifications: notificationRows[0]?.count ?? 0,
  }
}

export async function getClubCleanupPreview(
  clubSlug: string,
  retentionDays?: number
): Promise<ClubCleanupPreview> {
  const clubId = await getClubIdBySlug(clubSlug)
  if (!clubId) {
    throw new Error(`Klubben "${clubSlug}" hittades inte`)
  }

  const clubs = (await sql`
    SELECT id, name, slug, retention_days
    FROM clubs
    WHERE id = ${clubId}
    LIMIT 1
  `) as { id: number; name: string; slug: string; retention_days: number }[]

  const club = clubs[0]
  const safeRetentionInput =
    retentionDays != null && Number.isFinite(retentionDays)
      ? Math.max(0, Math.floor(retentionDays))
      : undefined
  const effectiveRetention =
    safeRetentionInput != null ? safeRetentionInput : Math.max(1, club.retention_days ?? 60)
  const deleteAll = effectiveRetention === 0
  const cutoffDate = deleteAll ? '9999-12-31' : cutoffDateFromRetentionDays(effectiveRetention)
  const counts = await countRows(clubId, cutoffDate)

  return {
    clubId,
    clubName: club.name,
    clubSlug: club.slug,
    retentionDays: effectiveRetention,
    deleteAll,
    cutoffDate,
    ...counts,
  }
}

export async function runClubCleanup(
  clubSlug: string,
  retentionDays?: number
): Promise<ClubCleanupPreview> {
  const preview = await getClubCleanupPreview(clubSlug, retentionDays)

  if (preview.sessions > 0) {
    await sql`
      DELETE FROM club_sessions
      WHERE club_id = ${preview.clubId}
        AND session_date < ${preview.cutoffDate}::date
    `
  }

  if (preview.auditLogEntries > 0) {
    await sql`
      DELETE FROM club_audit_log
      WHERE club_id = ${preview.clubId}
        AND created_at < (${preview.cutoffDate}::date + INTERVAL '1 day')
    `
  }

  if (preview.notifications > 0) {
    await sql`
      DELETE FROM club_notifications
      WHERE club_id = ${preview.clubId}
        AND created_at < (${preview.cutoffDate}::date + INTERVAL '1 day')
    `
  }

  return preview
}

// Nightly job: purge old data for every club using each club's retention_days.
export async function runScheduledCleanupForAllClubs(): Promise<
  { clubSlug: string; clubName: string; deleted: ClubCleanupPreview }[]
> {
  const clubs = (await sql`
    SELECT slug, name, retention_days
    FROM clubs
    ORDER BY id ASC
  `) as { slug: string; name: string; retention_days: number }[]

  const results: { clubSlug: string; clubName: string; deleted: ClubCleanupPreview }[] = []

  for (const club of clubs) {
    const preview = await getClubCleanupPreview(club.slug, club.retention_days)
    const hasWork =
      preview.sessions > 0 || preview.auditLogEntries > 0 || preview.notifications > 0

    if (!hasWork) continue

    const deleted = await runClubCleanup(club.slug, club.retention_days)
    results.push({ clubSlug: club.slug, clubName: club.name, deleted })
  }

  return results
}
