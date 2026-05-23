import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getReportViewerUserIdFromRequest } from './utils/cognito-auth'
import { corsJsonHeaders, getCorsOrigin } from './utils/cors'
import { summarizeReportEntries } from './utils/report-hours'

type UserRow = {
  id: number
  name: string
  last_name: string
  email: string
  report_id: number | null
  report_status: 'draft' | 'submitted' | null
  submitted_at: string | null
}

type EntryRow = {
  user_id: number
  entry_type: string
  time_from: string | null
  time_to: string | null
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = getCorsOrigin(event)

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { ...corsJsonHeaders(origin), 'Access-Control-Max-Age': '86400' },
      body: '',
    }
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsJsonHeaders(origin),
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    const viewerId = await getReportViewerUserIdFromRequest(event)
    if (!viewerId) {
      return {
        statusCode: 403,
        headers: corsJsonHeaders(origin),
        body: JSON.stringify({ message: 'Behörighet saknas' }),
      }
    }

    const queryParams = event.queryStringParameters || {}
    const month = parseInt(queryParams.month || '0', 10)
    const year = parseInt(queryParams.year || '0', 10)

    if (!month || !year || month < 1 || month > 12) {
      return {
        statusCode: 400,
        headers: corsJsonHeaders(origin),
        body: JSON.stringify({ message: 'month och year krävs' }),
      }
    }

    const users = (await sql`
      SELECT
        u.id,
        u.name,
        u.last_name,
        u.email,
        r.id AS report_id,
        r.status AS report_status,
        r.submitted_at
      FROM users u
      LEFT JOIN reports r
        ON r.user_id = u.id
        AND r.month = ${month}
        AND r.year = ${year}
      ORDER BY u.last_name, u.name
    `) as UserRow[]

    const entryRows = (await sql`
      SELECT
        r.user_id,
        e.entry_type,
        e.time_from,
        e.time_to
      FROM entries e
      INNER JOIN reports r ON r.id = e.report_id
      WHERE r.month = ${month}
        AND r.year = ${year}
    `) as EntryRow[]

    const entriesByUser = new Map<number, EntryRow[]>()
    for (const row of entryRows) {
      const list = entriesByUser.get(row.user_id) || []
      list.push(row)
      entriesByUser.set(row.user_id, list)
    }

    const employees = users.map((user) => {
      const userEntries = entriesByUser.get(user.id) || []
      const summary = summarizeReportEntries(userEntries)

      return {
        userId: user.id,
        name: user.name,
        lastName: user.last_name,
        email: user.email,
        hasReport: user.report_id !== null,
        status: user.report_status || 'draft',
        submittedAt: user.submitted_at,
        workedHours: summary.workedHours,
        leaveHours: summary.leaveHours,
        entryCount: summary.entryCount,
      }
    })

    return {
      statusCode: 200,
      headers: corsJsonHeaders(origin),
      body: JSON.stringify({ month, year, employees }),
    }
  } catch (error: unknown) {
    const err = error as { message?: string }
    console.error('list-employee-reports error:', err?.message || error)
    return {
      statusCode: 500,
      headers: corsJsonHeaders(origin),
      body: JSON.stringify({ message: err?.message || 'Internal server error' }),
    }
  }
}
