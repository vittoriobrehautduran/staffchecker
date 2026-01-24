import { Handler } from '@netlify/functions'
import { sql } from './utils/database'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { entryId, time_from, time_to, work_type, annat_specification, comment, userId } = body

    if (!entryId || !time_from || !time_to || !work_type || !userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'All required fields must be provided' }),
      }
    }

    // Verify user owns this entry
    const userResult = await sql`
      SELECT id FROM users WHERE clerk_user_id = ${userId} LIMIT 1
    `

    if (userResult.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'User not found' }),
      }
    }

    const user = userResult[0]

    // Verify entry belongs to user's report and check if report is submitted
    const entryCheck = await sql`
      SELECT e.id, r.status
      FROM entries e
      JOIN reports r ON e.report_id = r.id
      WHERE e.id = ${entryId} AND r.user_id = ${user.id}
      LIMIT 1
    `

    if (entryCheck.length === 0) {
      return {
        statusCode: 403,
        body: JSON.stringify({ message: 'Entry not found or access denied' }),
      }
    }

    if (entryCheck[0].status === 'submitted') {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Cannot edit entries in a submitted report' }),
      }
    }

    // Update entry
    const result = await sql`
      UPDATE entries
      SET time_from = ${time_from}::time,
          time_to = ${time_to}::time,
          work_type = ${work_type},
          annat_specification = ${annat_specification || null},
          comment = ${comment || null},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${entryId}
      RETURNING id, date, time_from, time_to, work_type, annat_specification, comment
    `

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result[0]),
    }
  } catch (error: any) {
    console.error('Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

