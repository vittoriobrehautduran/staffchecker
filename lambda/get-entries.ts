import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromBetterAuthSession } from './utils/auth'

// Helper function to get CORS origin from request
function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.Origin || event.headers?.origin || '*'
  const allowedOrigins = [
    'http://localhost:5173',
    'https://main.d3jub8c52hgrc6.amplifyapp.com',
  ]
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Handle OPTIONS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    const origin = getCorsOrigin(event)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie',
        'Access-Control-Max-Age': '86400', // 24 hours
      },
      body: '',
    }
  }

  const httpMethod = event.httpMethod || 'GET'
  const origin = getCorsOrigin(event)
  
  if (httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    // Get user ID from Better Auth session
    const userId = await getUserIdFromBetterAuthSession(event)
    
    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Not authenticated' }),
      }
    }

    const queryParams = event.queryStringParameters || {}
    const date = queryParams.date

    if (!date) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
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
    // Format date as yyyy-MM-dd for frontend compatibility
    const entries = await sql`
      SELECT 
        id, 
        TO_CHAR(date, 'YYYY-MM-DD') as date,
        time_from, 
        time_to, 
        work_type, 
        annat_specification, 
        comment
      FROM entries
      WHERE report_id = ${reportId} AND date = ${date}::date
      ORDER BY time_from
    `

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ entries, reportStatus }),
    }
  } catch (error: any) {
    console.error('Error:', error)
    const errorOrigin = getCorsOrigin(event)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': errorOrigin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

