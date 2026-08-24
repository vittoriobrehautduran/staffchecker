import { sql } from './database'
import { getClubAccess, type ClubAccess } from './club-attendance'
import { isUserAdmin } from './cognito-auth'

const DEFAULT_CLUB_SLUG = (process.env.DEFAULT_CLUB_SLUG || 'spanga').trim().toLowerCase()

export async function getClubIdBySlug(slug: string): Promise<number | null> {
  const normalized = slug.trim().toLowerCase()
  if (!normalized) return null

  try {
    const rows = (await sql`
      SELECT id
      FROM clubs
      WHERE lower(slug) = ${normalized}
      LIMIT 1
    `) as { id: number }[]

    return rows[0]?.id ?? null
  } catch (error: unknown) {
    const pgError = error as { code?: string }
    if (pgError?.code === '42P01') return null
    throw error
  }
}

export async function getDefaultClubId(): Promise<number | null> {
  return getClubIdBySlug(DEFAULT_CLUB_SLUG)
}

// Which club this user belongs to (first membership). Used for report routing.
export async function getUserPrimaryClubId(userId: number): Promise<number | null> {
  try {
    const rows = (await sql`
      SELECT club_id
      FROM user_club_memberships
      WHERE user_id = ${userId}
      ORDER BY id ASC
      LIMIT 1
    `) as { club_id: number }[]

    return rows[0]?.club_id ?? null
  } catch (error: unknown) {
    const pgError = error as { code?: string }
    if (pgError?.code === '42P01') return null
    throw error
  }
}

// Every registered staff user belongs to a club; permissions start empty until granted.
export async function ensureUserClubMembership(
  userId: number,
  clubId: number,
  permissions: string[] = []
): Promise<void> {
  await sql`
    INSERT INTO user_club_memberships (user_id, club_id, permissions)
    VALUES (${userId}, ${clubId}, ${permissions}::text[])
    ON CONFLICT (user_id, club_id) DO NOTHING
  `
}

export async function ensureDefaultClubMembership(userId: number): Promise<void> {
  const clubId = await getDefaultClubId()
  if (!clubId) {
    console.warn(`ensureDefaultClubMembership: no club with slug "${DEFAULT_CLUB_SLUG}"`)
    return
  }

  await ensureUserClubMembership(userId, clubId, [])
}

function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase()
}

// Timrapport goes to login users with club_boss on the member's club.
export async function getClubBossEmails(clubId: number): Promise<string[]> {
  try {
    const rows = (await sql`
      SELECT DISTINCT u.email
      FROM user_club_memberships m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.club_id = ${clubId}
        AND m.permissions @> ARRAY['club_boss']::text[]
        AND u.email IS NOT NULL
        AND trim(u.email) <> ''
      ORDER BY u.email ASC
    `) as { email: string }[]

    const seen = new Set<string>()
    const emails: string[] = []

    for (const row of rows) {
      const normalized = normalizeEmail(row.email)
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized)
        emails.push(row.email.trim())
      }
    }

    return emails
  } catch (error: unknown) {
    const pgError = error as { code?: string }
    if (pgError?.code === '42P01') return []
    throw error
  }
}

export async function getReportRecipientEmailsForUser(userId: number): Promise<string[]> {
  let clubId = await getUserPrimaryClubId(userId)

  if (!clubId) {
    await ensureDefaultClubMembership(userId)
    clubId = await getUserPrimaryClubId(userId)
  }

  if (clubId) {
    const bossEmails = await getClubBossEmails(clubId)
    if (bossEmails.length > 0) {
      return bossEmails
    }
  }

  const fallback = (process.env.BOSS_EMAIL_ADDRESS || '').trim()
  return fallback ? [fallback] : []
}

// Club API access: coach/boss permissions, or app admin as boss on the user's club.
export type ClubMemberRow = {
  userId: number
  name: string
  lastName: string
  email: string
  permissions: string[]
}

// Users linked to this club (for boss permission management).
export async function getClubMembers(clubId: number): Promise<ClubMemberRow[]> {
  const rows = (await sql`
    SELECT
      u.id,
      u.name,
      u.last_name,
      u.email,
      m.permissions
    FROM user_club_memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.club_id = ${clubId}
    ORDER BY u.last_name ASC, u.name ASC, u.email ASC
  `) as {
    id: number
    name: string
    last_name: string
    email: string
    permissions: string[]
  }[]

  return rows.map((row) => ({
    userId: row.id,
    name: row.name,
    lastName: row.last_name,
    email: row.email,
    permissions: row.permissions || [],
  }))
}

const VALID_CLUB_PERMISSIONS = new Set(['club_boss', 'club_coach'])

export async function updateClubMemberPermissions(
  clubId: number,
  targetUserId: number,
  permissions: string[]
): Promise<ClubMemberRow[]> {
  const normalized = [...new Set(permissions.filter((p) => VALID_CLUB_PERMISSIONS.has(p)))]

  const updated = (await sql`
    UPDATE user_club_memberships
    SET permissions = ${normalized}::text[],
        updated_at = CURRENT_TIMESTAMP
    WHERE club_id = ${clubId}
      AND user_id = ${targetUserId}
    RETURNING user_id
  `) as { user_id: number }[]

  if (updated.length === 0) {
    throw new Error('Användaren tillhör inte klubben')
  }

  return getClubMembers(clubId)
}

export async function resolveClubAccess(userId: number): Promise<ClubAccess | null> {
  const access = await getClubAccess(userId)
  if (access) {
    return access
  }

  if (!(await isUserAdmin(userId))) {
    return null
  }

  let clubId = await getUserPrimaryClubId(userId)
  if (!clubId) {
    await ensureDefaultClubMembership(userId)
    clubId = await getUserPrimaryClubId(userId)
  }

  if (!clubId) {
    return null
  }

  return {
    clubId,
    isBoss: true,
    isCoach: false,
  }
}
