import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromBetterAuthSession } from './utils/auth'

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const httpMethod = event.httpMethod || 'POST'
  
  if (httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
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

    const body = JSON.parse(event.body || '{}')
    const { date, time_from, time_to, work_type, annat_specification, comment } = body

    if (!date || !time_from || !time_to || !work_type) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
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
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
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
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(result[0]),
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

