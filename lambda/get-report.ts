import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromCognitoSession } from './utils/cognito-auth'

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
  // Log all incoming requests
  console.log('=== get-report Lambda called ===')
  console.log('HTTP Method:', event.httpMethod)
  console.log('Path:', event.path)
  console.log('Resource:', event.resource)
  console.log('Request ID:', event.requestContext?.requestId)
  console.log('Headers received:', Object.keys(event.headers || {}))
  
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
    console.log('Handling OPTIONS preflight request')
    return {
      statusCode: 200,
      headers: {
        ...getCorsHeaders(origin),
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie,X-Auth-Token',
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    }
  }

  // Convert API Gateway event to Netlify-like format for compatibility
  const httpMethod = event.httpMethod || 'GET'
  
  if (httpMethod !== 'GET') {
    console.log('Method not allowed:', httpMethod)
    return {
      statusCode: 405,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  console.log('Processing GET request for get-report')
  
  try {
    // Get user ID from Cognito session
    console.log('Attempting to get user ID from Cognito session...')
    let userId: number | null = null
    try {
      userId = await getUserIdFromCognitoSession(event)
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
    console.error('=== ERROR in get-report Lambda ===')
    console.error('Error type:', error?.constructor?.name)
    console.error('Error message:', error?.message)
    console.error('Error stack:', error?.stack)
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
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
    } catch (originError) {
      console.error('Failed to get CORS origin in error handler:', originError)
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

