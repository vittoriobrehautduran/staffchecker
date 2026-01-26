import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromBetterAuthSession } from './utils/auth'

// Lambda handler format (converted from Netlify Functions)
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Convert API Gateway event to Netlify-like format for compatibility
  const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET'
  
  if (httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET',
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
          'Access-Control-Allow-Origin': '*',
        },
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
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
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
        'Cache-Control': 'private, max-age=30',
        'Access-Control-Allow-Origin': '*',
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

