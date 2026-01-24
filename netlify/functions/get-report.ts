import { Handler } from '@netlify/functions'
import { sql } from './utils/database'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    const month = parseInt(event.queryStringParameters?.month || '0')
    const year = parseInt(event.queryStringParameters?.year || '0')
    const userId = event.queryStringParameters?.userId

    if (!month || !year || !userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Month, year, and userId are required' }),
      }
    }

    // Get user from database
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

    // Get or create report
    let reportResult = await sql`
      SELECT id, status FROM reports 
      WHERE user_id = ${user.id} AND month = ${month} AND year = ${year}
      LIMIT 1
    `

    let reportId
    let status: 'draft' | 'submitted' = 'draft'

    if (reportResult.length === 0) {
      // Create new report
      const newReport = await sql`
        INSERT INTO reports (user_id, month, year, status)
        VALUES (${user.id}, ${month}, ${year}, 'draft')
        RETURNING id, status
      `
      reportId = newReport[0].id
      status = newReport[0].status
    } else {
      reportId = reportResult[0].id
      status = reportResult[0].status
    }

    // Get all entries for this report
    const entries = await sql`
      SELECT id, date, time_from, time_to, work_type, annat_specification, comment
      FROM entries
      WHERE report_id = ${reportId}
      ORDER BY date, time_from
    `

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        month,
        year,
        status,
        entries,
      }),
    }
  } catch (error: any) {
    console.error('Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

