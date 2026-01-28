import { Handler } from '@netlify/functions'
import { sql } from './utils/database'
import { getUserIdFromBetterAuthSession } from './utils/auth'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    // Get user ID from Better Auth session
    const userId = await getUserIdFromBetterAuthSession(event)
    
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Not authenticated' }),
      }
    }

    const month = parseInt(event.queryStringParameters?.month || '0')
    const year = parseInt(event.queryStringParameters?.year || '0')

    if (!month || !year) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Month and year are required' }),
      }
    }

    // Get or create report
    let reportResult = await sql`
      SELECT id, status FROM reports 
      WHERE user_id = ${userId} AND month = ${month} AND year = ${year}
      LIMIT 1
    `

    let reportId
    let status: 'draft' | 'submitted' = 'draft'

    if (reportResult.length === 0) {
      // Create new report
      const newReport = await sql`
        INSERT INTO reports (user_id, month, year, status)
        VALUES (${userId}, ${month}, ${year}, 'draft')
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
        // Cache for 30 seconds to reduce function calls for repeated requests
        // Users can still see updates quickly, but reduces load on high-traffic pages
        'Cache-Control': 'private, max-age=30',
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
