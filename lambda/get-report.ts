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

// Lambda handler format (converted from Netlify Functions)
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
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie',
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    }
  }

  // Convert API Gateway event to Netlify-like format for compatibility
  const httpMethod = event.httpMethod || 'GET'
  
  if (httpMethod !== 'GET') {
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
      // Return 401 with CORS headers even on auth error
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
    
    if (!userId) {
      return {
        statusCode: 401,
        headers: getCorsHeaders(origin),
        body: JSON.stringify({ message: 'Not authenticated' }),
      }
    }

    // Extract query parameters from API Gateway event
    const queryParams = event.queryStringParameters || {}
    const month = parseInt(queryParams.month || '0')
    const year = parseInt(queryParams.year || '0')

    if (!month || !year) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(origin),
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
      WHERE report_id = ${reportId}
      ORDER BY date, time_from
    `

    return {
      statusCode: 200,
      headers: {
        ...getCorsHeaders(origin),
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
    console.error('Error in get-report:', error)
    console.error('Error stack:', error?.stack)
    // Always return CORS headers even on error
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
      // Fallback if even getCorsOrigin fails
      return {
        statusCode: 500,
        headers: getCorsHeaders('https://main.d3jub8c52hgrc6.amplifyapp.com'),
        body: JSON.stringify({ 
          message: 'Internal server error',
        }),
      }
    }
  }
}

