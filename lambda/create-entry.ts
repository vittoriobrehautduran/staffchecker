import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromCognitoSession } from './utils/cognito-auth'

// Helper function to get CORS origin from request
function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.Origin || event.headers?.origin || '*'
  const allowedOrigins = [
    'http://localhost:5173',
    'https://staffcheck.spangatbk.se',
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
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie,X-Auth-Token',
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
      userId = await getUserIdFromCognitoSession(event)
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
    const { 
      date, 
      entry_type, 
      time_from, 
      time_to, 
      work_type, 
      leave_type,
      compensation_type,
      student_count,
      sport_type,
      is_full_day_leave,
      mileage_km,
      compensation_amount,
      compensation_description,
      annat_specification, 
      comment 
    } = body

    if (!date || !entry_type) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(origin),
        body: JSON.stringify({ message: 'Date and entry_type are required' }),
      }
    }

    // Validate based on entry_type
    if (entry_type === 'work') {
      if (!work_type || !time_from || !time_to) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({ message: 'Work entries require work_type, time_from, and time_to' }),
        }
      }
      if (work_type === 'privat_traning' && !student_count) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({ message: 'Privatträning requires student_count' }),
        }
      }
      if (work_type === 'annat' && !annat_specification) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({ message: 'Annat requires annat_specification' }),
        }
      }
    } else if (entry_type === 'leave') {
      if (!leave_type) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({ message: 'Leave entries require leave_type' }),
        }
      }
      if (!is_full_day_leave && (!time_from || !time_to)) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({ message: 'Leave entries require time_from and time_to unless is_full_day_leave is true' }),
        }
      }
    } else if (entry_type === 'compensation') {
      if (!compensation_type) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({ message: 'Compensation entries require compensation_type' }),
        }
      }
      if (compensation_type === 'milersattning' && !mileage_km) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({ message: 'Milersättning requires mileage_km' }),
        }
      }
      if (compensation_type === 'annan_ersattning' && (!compensation_description || !compensation_amount)) {
        return {
          statusCode: 400,
          headers: getCorsHeaders(origin),
          body: JSON.stringify({ message: 'Annan ersättning requires compensation_description and compensation_amount' }),
        }
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
      INSERT INTO entries (
        report_id, 
        date, 
        entry_type,
        time_from, 
        time_to, 
        work_type,
        leave_type,
        compensation_type,
        student_count,
        sport_type,
        is_full_day_leave,
        mileage_km,
        compensation_amount,
        compensation_description,
        annat_specification, 
        comment
      )
      VALUES (
        ${reportId}, 
        ${date}::date, 
        ${entry_type},
        ${time_from || null}::time, 
        ${time_to || null}::time, 
        ${work_type || null},
        ${leave_type || null},
        ${compensation_type || null},
        ${student_count || null},
        ${body.sport_type || null},
        ${is_full_day_leave || false},
        ${mileage_km || null},
        ${compensation_amount || null},
        ${compensation_description || null},
        ${annat_specification || null}, 
        ${comment || null}
      )
      RETURNING 
        id, 
        TO_CHAR(date, 'YYYY-MM-DD') as date, 
        entry_type,
        time_from, 
        time_to, 
        work_type,
        leave_type,
        compensation_type,
        student_count,
        sport_type,
        is_full_day_leave,
        mileage_km,
        compensation_amount,
        compensation_description,
        annat_specification, 
        comment
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

