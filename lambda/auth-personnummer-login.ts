import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { auth } from '../../src/lib/auth'

// Custom login handler that looks up email by personnummer, then uses Better Auth
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'POST'
  
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
    const body = JSON.parse(event.body || '{}')
    const { identifier, password } = body

    if (!identifier || !password) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ message: 'Personnummer/e-post och lösenord krävs' }),
      }
    }

    // Check if identifier is email or personnummer
    const isEmail = identifier.includes('@') && identifier.includes('.')
    let userEmail: string | null = null

    if (isEmail) {
      userEmail = identifier.toLowerCase().trim()
    } else {
      // Personnummer login - look up email by personnummer
      const cleanPersonnummer = identifier.replace(/\D/g, '')

      // Find user by personnummer
      const users = await sql`
        SELECT email, better_auth_user_id
        FROM users 
        WHERE personnummer = ${cleanPersonnummer}
        LIMIT 1
      `

      if (users.length === 0) {
        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ message: 'Felaktigt personnummer eller lösenord' }),
        }
      }

      const user = users[0]

      if (!user.better_auth_user_id) {
        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({ message: 'Användaren är inte korrekt registrerad' }),
        }
      }
      
      userEmail = user.email
    }

    if (!userEmail) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ message: 'Felaktigt personnummer eller lösenord' }),
      }
    }

    // Use Better Auth to sign in with email and password
    const protocol = event.headers?.['X-Forwarded-Proto'] || event.headers?.['x-forwarded-proto'] || 'https'
    const host = event.headers?.Host || event.headers?.host || 'localhost'
    const apiBaseUrl = process.env.BETTER_AUTH_URL || `${protocol}://${host}`
    const signInRequest = new Request(
      `${apiBaseUrl}/auth/sign-in/email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          password,
        }),
      }
    )

    // Call Better Auth's handler
    const authResponse = await auth.handler(signInRequest)

    if (!authResponse || authResponse.status !== 200) {
      const error = await authResponse?.json().catch(() => ({ message: 'Felaktigt personnummer eller lösenord' }))
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ message: error?.message || 'Felaktigt personnummer eller lösenord' }),
      }
    }

    // Get response body and headers
    const responseBody = await authResponse.text()
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
    }
    authResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: responseBody,
    }
  } catch (error: any) {
    console.error('Login error:', error)
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

