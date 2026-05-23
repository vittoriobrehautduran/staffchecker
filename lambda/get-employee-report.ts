import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getReportViewerUserIdFromRequest } from './utils/cognito-auth'
import { corsJsonHeaders, getCorsOrigin } from './utils/cors'
import { summarizeReportEntries } from './utils/report-hours'

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
    const targetUserId = parseInt(queryParams.userId || '0', 10)
    const month = parseInt(queryParams.month || '0', 10)
    const year = parseInt(queryParams.year || '0', 10)

    if (!targetUserId || !month || !year || month < 1 || month > 12) {
      return {
        statusCode: 400,
        headers: corsJsonHeaders(origin),
        body: JSON.stringify({ message: 'userId, month och year krävs' }),
      }
    }

    const users = (await sql`
      SELECT id, name, last_name, email
      FROM users
      WHERE id = ${targetUserId}
      LIMIT 1
    `) as { id: number; name: string; last_name: string; email: string }[]

    if (!users.length) {
      return {
        statusCode: 404,
        headers: corsJsonHeaders(origin),
        body: JSON.stringify({ message: 'Användaren hittades inte' }),
      }
    }

    const targetUser = users[0]

    const reports = (await sql`
      SELECT id, status, submitted_at
      FROM reports
      WHERE user_id = ${targetUserId}
        AND month = ${month}
        AND year = ${year}
      LIMIT 1
    `) as { id: number; status: 'draft' | 'submitted'; submitted_at: string | null }[]

    let status: 'draft' | 'submitted' = 'draft'
    let submittedAt: string | null = null
    let entries: unknown[] = []

    if (reports.length > 0) {
      const report = reports[0]
      status = report.status
      submittedAt = report.submitted_at

      entries = await sql`
        SELECT
          id,
          TO_CHAR(date, 'YYYY-MM-DD') as date,
          COALESCE(entry_type, 'work') as entry_type,
          time_from,
          time_to,
          work_type,
          leave_type,
          compensation_type,
          student_count,
          sport_type,
          is_full_day_leave,
          mileage_km,
          compensation_amount,
          compensation_description,
          annat_specification,
          comment
        FROM entries
        WHERE report_id = ${report.id}
        ORDER BY date, time_from
      `
    }

    const summary = summarizeReportEntries(
      entries as { entry_type: string; time_from: string | null; time_to: string | null }[]
    )

    return {
      statusCode: 200,
      headers: corsJsonHeaders(origin),
      body: JSON.stringify({
        month,
        year,
        status,
        submittedAt,
        user: {
          id: targetUser.id,
          name: targetUser.name,
          lastName: targetUser.last_name,
          email: targetUser.email,
        },
        workedHours: summary.workedHours,
        leaveHours: summary.leaveHours,
        entryCount: summary.entryCount,
        entries,
        readOnly: true,
      }),
    }
  } catch (error: unknown) {
    const err = error as { message?: string }
    console.error('get-employee-report error:', err?.message || error)
    return {
      statusCode: 500,
      headers: corsJsonHeaders(origin),
      body: JSON.stringify({ message: err?.message || 'Internal server error' }),
    }
  }
}
