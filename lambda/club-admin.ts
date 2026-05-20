import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromCognitoSession } from './utils/cognito-auth'

type ResourceType = 'court' | 'table'
type SportType = 'tennis' | 'bordtennis' | 'both'

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

async function getBossClubId(userId: number): Promise<number | null> {
  try {
    const rows = await sql<{ club_id: number }[]>`
      SELECT club_id
      FROM user_club_memberships
      WHERE user_id = ${userId}
        AND permissions @> ARRAY['club_boss']::text[]
      ORDER BY club_id ASC
      LIMIT 1
    `

    if (!rows.length) {
      return null
    }

    return rows[0].club_id
  } catch (error: unknown) {
    // 42P01: table does not exist (migration not applied)
    const pgError = error as { code?: string }
    if (pgError?.code === '42P01') {
      return null
    }
    throw error
  }
}

async function getClubPayload(clubId: number) {
  const [club] = await sql<{
    id: number
    name: string
    slug: string
    tennis_courts_count: number
    bordtennis_tables_count: number
    default_slot_duration_minutes: number
    retention_days: number
  }[]>`
    SELECT
      id,
      name,
      slug,
      tennis_courts_count,
      bordtennis_tables_count,
      default_slot_duration_minutes,
      retention_days
    FROM clubs
    WHERE id = ${clubId}
    LIMIT 1
  `

  if (!club) {
    throw new Error('Club not found')
  }

  const coaches = await sql<{
    id: number
    name: string
    sport: SportType
    is_active: boolean
  }[]>`
    SELECT id, name, sport, is_active
    FROM club_coaches
    WHERE club_id = ${clubId}
    ORDER BY sort_order ASC, id ASC
  `

  const classes = await sql<{
    id: number
    name: string
    sport: Exclude<SportType, 'both'>
    is_active: boolean
  }[]>`
    SELECT id, name, sport, is_active
    FROM club_classes
    WHERE club_id = ${clubId}
    ORDER BY sort_order ASC, id ASC
  `

  const resources = await sql<{
    id: number
    resource_type: ResourceType
    resource_number: number
    label: string | null
    is_active: boolean
  }[]>`
    SELECT id, resource_type, resource_number, label, is_active
    FROM club_resources
    WHERE club_id = ${clubId}
    ORDER BY resource_type ASC, resource_number ASC
  `

  return {
    club,
    coaches,
    classes,
    resources,
  }
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

    const body = JSON.parse(event.body || '{}') as {
      operation?: 'update_settings' | 'add_coach' | 'add_class' | 'add_resource'
      tennisCourtsCount?: number
      bordtennisTablesCount?: number
      defaultSlotDurationMinutes?: number
      retentionDays?: number
      name?: string
      sport?: SportType
      resourceType?: ResourceType
      resourceNumber?: number
      label?: string
    }

    if (!body.operation) {
      return {
        statusCode: 400,
        headers: corsHeaders(origin),
        body: JSON.stringify({ message: 'operation is required' }),
      }
    }

    if (body.operation === 'update_settings') {
      await sql`
        UPDATE clubs
        SET
          tennis_courts_count = ${Math.max(0, Number(body.tennisCourtsCount ?? 0))},
          bordtennis_tables_count = ${Math.max(0, Number(body.bordtennisTablesCount ?? 0))},
          default_slot_duration_minutes = ${Math.max(15, Number(body.defaultSlotDurationMinutes ?? 60))},
          retention_days = ${Math.max(1, Number(body.retentionDays ?? 60))},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${clubId}
      `
    }

    if (body.operation === 'add_coach') {
      const coachName = String(body.name || '').trim()
      const sport = (body.sport || 'both') as SportType
      if (!coachName) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Coach name is required' }),
        }
      }

      await sql`
        INSERT INTO club_coaches (club_id, name, sport)
        VALUES (${clubId}, ${coachName}, ${sport})
      `
    }

    if (body.operation === 'add_class') {
      const className = String(body.name || '').trim()
      const sport = (body.sport || 'tennis') as Exclude<SportType, 'both'>
      if (!className) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Class name is required' }),
        }
      }

      await sql`
        INSERT INTO club_classes (club_id, name, sport)
        VALUES (${clubId}, ${className}, ${sport})
      `
    }

    if (body.operation === 'add_resource') {
      const resourceType = (body.resourceType || 'court') as ResourceType
      const resourceNumber = Number(body.resourceNumber || 0)
      const label = String(body.label || '').trim()

      if (!resourceNumber || resourceNumber < 1) {
        return {
          statusCode: 400,
          headers: corsHeaders(origin),
          body: JSON.stringify({ message: 'Resource number must be at least 1' }),
        }
      }

      await sql`
        INSERT INTO club_resources (club_id, resource_type, resource_number, label)
        VALUES (${clubId}, ${resourceType}, ${resourceNumber}, ${label || null})
      `
    }

    const payload = await getClubPayload(clubId)
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify(payload),
    }
  } catch (error: unknown) {
    const err = error as { message?: string }
    console.error('Error in club-admin:', error)
    return {
      statusCode: 500,
      headers: corsHeaders(origin),
      body: JSON.stringify({ message: err?.message || 'Internal server error' }),
    }
  }
}
