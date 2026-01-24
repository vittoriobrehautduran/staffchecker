import { Handler } from '@netlify/functions'
import { sql } from './utils/database'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { date, time_from, time_to, work_type, annat_specification, comment, userId } = body

    if (!date || !time_from || !time_to || !work_type || !userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'All required fields must be provided' }),
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

    // Get or create report for the month
    const reportDate = new Date(date)
    const month = reportDate.getMonth() + 1
    const year = reportDate.getFullYear()

    let reportResult = await sql`
      SELECT id, status FROM reports 
      WHERE user_id = ${user.id} AND month = ${month} AND year = ${year}
      LIMIT 1
    `

    let reportId
    if (reportResult.length === 0) {
      const newReport = await sql`
        INSERT INTO reports (user_id, month, year, status)
        VALUES (${user.id}, ${month}, ${year}, 'draft')
        RETURNING id
      `
      reportId = newReport[0].id
    } else {
      reportId = reportResult[0].id
      // Check if report is already submitted
      if (reportResult[0].status === 'submitted') {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Cannot add entries to a submitted report' }),
        }
      }
    }

    // Create entry
    const result = await sql`
      INSERT INTO entries (report_id, date, time_from, time_to, work_type, annat_specification, comment)
      VALUES (${reportId}, ${date}::date, ${time_from}::time, ${time_to}::time, ${work_type}, ${annat_specification || null}, ${comment || null})
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

