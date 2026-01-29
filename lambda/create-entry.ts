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
  // Helper to always return CORS headers
  const getCorsHeaders = (origin: string) => ({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  })

  // Get origin early
  let origin: string
  try {
    origin = getCorsOrigin(event)
  } catch {
    origin = 'https://main.d3jub8c52hgrc6.amplifyapp.com'
  }

  // Handle OPTIONS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        ...getCorsHeaders(origin),
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie',
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    }
  }

  const httpMethod = event.httpMethod || 'POST'
  
  if (httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    // Get user ID from Better Auth session
    let userId: number | null = null
    try {
      userId = await getUserIdFromBetterAuthSession(event)
    } catch (authError: any) {
      console.error('Error getting user ID from session:', authError?.message || authError)
      return {
        statusCode: 401,
        headers: getCorsHeaders(origin),
        body: JSON.stringify({ message: 'Not authenticated' }),
      }
    }
    
    if (!userId) {
      return {
        statusCode: 401,
        headers: getCorsHeaders(origin),
        body: JSON.stringify({ message: 'Not authenticated' }),
      }
    }

    const body = JSON.parse(event.body || '{}')
    const { date, time_from, time_to, work_type, annat_specification, comment } = body

    if (!date || !time_from || !time_to || !work_type) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(origin),
        body: JSON.stringify({ message: 'All required fields must be provided' }),
      }
    }

    // Get or create report for the month
    const reportDate = new Date(date)
    const month = reportDate.getMonth() + 1
    const year = reportDate.getFullYear()

    let reportResult = await sql`
      SELECT id, status FROM reports 
      WHERE user_id = ${userId} AND month = ${month} AND year = ${year}
      LIMIT 1
    `

    let reportId
    if (reportResult.length === 0) {
      const newReport = await sql`
        INSERT INTO reports (user_id, month, year, status)
        VALUES (${userId}, ${month}, ${year}, 'draft')
        RETURNING id
      `
      reportId = newReport[0].id
    } else {
      reportId = reportResult[0].id
      // Check if report is already submitted
      if (reportResult[0].status === 'submitted') {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({ message: 'Cannot add entries to a submitted report' }),
        }
      }
    }

    // Create entry
    // Format date as yyyy-MM-dd for frontend compatibility
    const result = await sql`
      INSERT INTO entries (report_id, date, time_from, time_to, work_type, annat_specification, comment)
      VALUES (${reportId}, ${date}::date, ${time_from}::time, ${time_to}::time, ${work_type}, ${annat_specification || null}, ${comment || null})
      RETURNING id, TO_CHAR(date, 'YYYY-MM-DD') as date, time_from, time_to, work_type, annat_specification, comment
    `

    return {
      statusCode: 200,
      headers: getCorsHeaders(origin),
      body: JSON.stringify(result[0]),
    }
  } catch (error: any) {
    console.error('Error in create-entry:', error)
    console.error('Error stack:', error?.stack)
    try {
      const errorOrigin = getCorsOrigin(event)
      return {
        statusCode: 500,
        headers: getCorsHeaders(errorOrigin),
        body: JSON.stringify({ 
          message: error?.message || 'Internal server error',
          error: process.env.NODE_ENV !== 'production' ? String(error) : undefined,
        }),
      }
    } catch {
      return {
        statusCode: 500,
        headers: getCorsHeaders('https://main.d3jub8c52hgrc6.amplifyapp.com'),
        body: JSON.stringify({ message: 'Internal server error' }),
      }
    }
  }
}

