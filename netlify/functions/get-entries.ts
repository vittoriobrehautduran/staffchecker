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

    const date = event.queryStringParameters?.date

    if (!date) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Date parameter is required' }),
      }
    }

    // Get or create report for current month
    // Handle race condition: multiple parallel requests might try to create the same report
    const reportDate = new Date(date)
    const month = reportDate.getMonth() + 1
    const year = reportDate.getFullYear()

    let reportResult = await sql`
      SELECT id FROM reports 
      WHERE user_id = ${userId} AND month = ${month} AND year = ${year}
      LIMIT 1
    `

    let reportId
    if (reportResult.length === 0) {
      // Try to create new report, but handle duplicate key errors from race conditions
      try {
      const newReport = await sql`
        INSERT INTO reports (user_id, month, year, status)
        VALUES (${userId}, ${month}, ${year}, 'draft')
        RETURNING id
      `
      reportId = newReport[0].id
      } catch (error: any) {
        // If duplicate key error (race condition), fetch the existing report
        if (error.code === '23505' && error.constraint === 'reports_user_id_month_year_key') {
          const existingReport = await sql`
            SELECT id FROM reports 
            WHERE user_id = ${userId} AND month = ${month} AND year = ${year}
            LIMIT 1
          `
          if (existingReport.length > 0) {
            reportId = existingReport[0].id
          } else {
            throw error
          }
        } else {
          throw error
        }
      }
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
