import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromBetterAuthSession } from './utils/auth'

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const httpMethod = event.httpMethod || 'DELETE'
  
  if (httpMethod !== 'DELETE') {
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
    const { entryId } = body

    if (!entryId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ message: 'Entry ID is required' }),
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
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ message: 'Entry not found or access denied' }),
      }
    }

    if (entryCheck[0].status === 'submitted') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ message: 'Cannot delete entries in a submitted report' }),
      }
    }

    // Delete entry
    await sql`
      DELETE FROM entries WHERE id = ${entryId}
    `

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ message: 'Entry deleted successfully' }),
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

