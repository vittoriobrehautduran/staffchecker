import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromCognitoSession, getCognitoUserIdFromRequest } from './utils/cognito-auth'

// Helper function to get CORS origin from request
function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.Origin || event.headers?.origin || '*'
  const allowedOrigins = [
    'http://localhost:5173',
    'https://staffcheck.spangatbk.se',
    'https://staging.d3jub8c52hgrc6.amplifyapp.com',
  ]
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = getCorsOrigin(event)

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: '',
    }
  }

  if (event.httpMethod !== 'GET') {
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
    const cognitoSub = await getCognitoUserIdFromRequest(event)
    if (!cognitoSub) {
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

    const userId = await getUserIdFromCognitoSession(event)

    if (!userId) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({
          code: 'USER_NOT_REGISTERED',
          message:
            'Det finns inget konto kopplat till den här inloggningen. Registrera dig först med samma e-postadress, eller använd e-post och lösenord om du redan har ett konto.',
        }),
      }
    }

    // Get user info including admin status
    const userResult = await sql`
      SELECT id, email, name, last_name, is_admin, ui_theme
      FROM users 
      WHERE id = ${userId}
      LIMIT 1
    `

    if (userResult.length === 0) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({
          code: 'USER_NOT_REGISTERED',
          message:
            'Det finns inget konto kopplat till den här inloggningen. Registrera dig först med samma e-postadress, eller använd e-post och lösenord om du redan har ett konto.',
        }),
      }
    }

    const user = userResult[0]
    const theme = user.ui_theme === 'dark' ? 'dark' : 'light'

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        lastName: user.last_name,
        isAdmin: user.is_admin || false,
        theme,
      }),
    }
  } catch (error: any) {
    console.error('Error getting user info:', error)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ 
        message: 'Internal server error',
        error: error?.message || 'Unknown error'
      }),
    }
  }
}

