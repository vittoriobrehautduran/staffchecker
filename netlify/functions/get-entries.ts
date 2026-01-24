import { Handler } from '@netlify/functions'
import { sql } from './utils/database'

// Get Clerk user ID from request headers
function getClerkUserId(event: any): string | null {
  // Clerk sets the user ID in the Authorization header or as a cookie
  // For now, we'll get it from the request body or query params
  // In production, you'd verify the Clerk session token
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (authHeader) {
    // Extract from Bearer token or similar
    // For now, we'll pass it in the request
  }
  return null
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    // Get user ID from query params (temporary - should use proper auth)
    const userId = event.queryStringParameters?.userId
    
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'User ID is required' }),
      }
    }

    const date = event.queryStringParameters?.date

    if (!date) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Date parameter is required' }),
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

    // Get or create report for current month
    const reportDate = new Date(date)
    const month = reportDate.getMonth() + 1
    const year = reportDate.getFullYear()

    let reportResult = await sql`
      SELECT id FROM reports 
      WHERE user_id = ${user.id} AND month = ${month} AND year = ${year}
      LIMIT 1
    `

    let reportId
    if (reportResult.length === 0) {
      // Create new report
      const newReport = await sql`
        INSERT INTO reports (user_id, month, year, status)
        VALUES (${user.id}, ${month}, ${year}, 'draft')
        RETURNING id
      `
      reportId = newReport[0].id
    } else {
      reportId = reportResult[0].id
    }

    // Get report status
    const reportStatusResult = await sql`
      SELECT status FROM reports WHERE id = ${reportId} LIMIT 1
    `
    const reportStatus = reportStatusResult.length > 0 ? reportStatusResult[0].status : 'draft'

    // Get entries for the specific date
    const entries = await sql`
      SELECT id, date, time_from, time_to, work_type, annat_specification, comment
      FROM entries
      WHERE report_id = ${reportId} AND date = ${date}
      ORDER BY time_from
    `

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entries, reportStatus }),
    }
  } catch (error: any) {
    console.error('Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

