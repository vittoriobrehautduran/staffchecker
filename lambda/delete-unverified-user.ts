import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import postgres from 'postgres'

// Get CORS origin from request
function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const allowedOrigins = [
    'http://localhost:5173',
    'https://main.d3jub8c52hgrc6.amplifyapp.com',
  ]
  
  const origin = event.headers?.Origin || event.headers?.origin || ''
  return allowedOrigins.includes(origin) ? origin : allowedOrigins[0]
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = getCorsOrigin(event)

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
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
    const body = JSON.parse(event.body || '{}')
    const { email } = body

    if (!email) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Email is required' }),
      }
    }

    // Find Better Auth user by email
    const betterAuthUser = await sql`
      SELECT id, "emailVerified", "createdAt"
      FROM public."user"
      WHERE email = ${email.toLowerCase().trim()}
      LIMIT 1
    `

    if (betterAuthUser.length === 0) {
      // User doesn't exist, return success (nothing to delete)
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'User not found or already deleted' }),
      }
    }

    const betterAuthUserId = betterAuthUser[0].id
    const isVerified = betterAuthUser[0].emailVerified
    const createdAt = betterAuthUser[0].createdAt

    // Only delete if email is not verified
    if (isVerified) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Cannot delete verified user' }),
      }
    }

    // Check if account is older than 2 minutes
    const accountAge = Date.now() - new Date(createdAt).getTime()
    const twoMinutes = 2 * 60 * 1000
    
    if (accountAge < twoMinutes) {
      // Account is less than 2 minutes old - don't delete yet
      const secondsLeft = Math.ceil((twoMinutes - accountAge) / 1000)
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ 
          message: 'Account is too new to delete',
          secondsLeft,
          canDelete: false,
        }),
      }
    }

    // Delete from our users table first (if exists)
    await sql`
      DELETE FROM users
      WHERE better_auth_user_id = ${betterAuthUserId}
    `

    // Delete from Better Auth user table
    // This will cascade delete sessions, accounts, etc. due to foreign key constraints
    await sql`
      DELETE FROM public."user"
      WHERE id = ${betterAuthUserId}
    `

    console.log(`Deleted unverified user: ${email} (Better Auth ID: ${betterAuthUserId})`)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ 
        message: 'Unverified user deleted successfully',
        deleted: true,
      }),
    }
  } catch (error: any) {
    console.error('Error deleting unverified user:', error)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ 
        message: error.message || 'Internal server error',
      }),
    }
  }
}

