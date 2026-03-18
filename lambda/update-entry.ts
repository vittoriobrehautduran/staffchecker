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
  // Handle OPTIONS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    const origin = getCorsOrigin(event)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie,X-Auth-Token',
        'Access-Control-Max-Age': '86400', // 24 hours
      },
      body: '',
    }
  }

  const httpMethod = event.httpMethod || 'PUT'
  const origin = getCorsOrigin(event)
  
  if (httpMethod !== 'PUT') {
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
    // Get user ID from Cognito session
    const userId = await getUserIdFromCognitoSession(event)
    
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

    const body = JSON.parse(event.body || '{}')
    const { 
      entryId, 
      entry_type,
      time_from, 
      time_to, 
      work_type,
      leave_type,
      compensation_type,
      student_count,
      is_full_day_leave,
      mileage_km,
      compensation_amount,
      compensation_description,
      annat_specification, 
      comment 
    } = body

    if (!entryId || !entry_type) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Entry ID and entry_type are required' }),
      }
    }

    // Verify entry belongs to user's report and check if report is submitted
    const entryCheck = await sql`
      SELECT e.id, r.status
      FROM entries e
      JOIN reports r ON e.report_id = r.id
      WHERE e.id = ${entryId} AND r.user_id = ${userId}
      LIMIT 1
    `

    if (entryCheck.length === 0) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Entry not found or access denied' }),
      }
    }

    if (entryCheck[0].status === 'submitted') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Cannot edit entries in a submitted report' }),
      }
    }

    // Update entry
    // Format date as yyyy-MM-dd for frontend compatibility
    const result = await sql`
      UPDATE entries
      SET entry_type = ${entry_type},
          time_from = ${time_from || null}::time,
          time_to = ${time_to || null}::time,
          work_type = ${work_type || null},
          leave_type = ${leave_type || null},
          compensation_type = ${compensation_type || null},
          student_count = ${student_count || null},
          sport_type = ${body.sport_type || null},
          is_full_day_leave = ${is_full_day_leave || false},
          mileage_km = ${mileage_km || null},
          compensation_amount = ${compensation_amount || null},
          compensation_description = ${compensation_description || null},
          annat_specification = ${annat_specification || null},
          comment = ${comment || null},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${entryId}
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify(result[0]),
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

