import { Handler } from '@netlify/functions'
import { sql } from './utils/database'
import { auth } from '../../src/lib/auth'

// Custom login handler that looks up email by personnummer, then uses Better Auth
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { identifier, password } = body

    if (!identifier || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Personnummer/e-post och lösenord krävs' }),
      }
    }

    // Check if identifier is email or personnummer
    const isEmail = identifier.includes('@') && identifier.includes('.')
    let userEmail: string | null = null

    if (isEmail) {
      // Direct email login - use Better Auth's email/password endpoint directly
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
        body: JSON.stringify({ message: 'Felaktigt personnummer eller lösenord' }),
      }
    }

    const user = users[0]

    if (!user.better_auth_user_id) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Användaren är inte korrekt registrerad' }),
        }
      }
      
      userEmail = user.email
    }

    if (!userEmail) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Felaktigt personnummer eller lösenord' }),
      }
    }

    // Use Better Auth to sign in with email and password
    // Create a request object for Better Auth's signIn handler
    const protocol = event.headers['x-forwarded-proto'] || (event.headers.host?.includes('localhost') ? 'http' : 'https')
    const host = event.headers.host || 'localhost:8888'
    const signInRequest = new Request(
      `${protocol}://${host}/.netlify/functions/auth/sign-in/email`,
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
    // Better Auth's handler expects a Request object directly
    const authResponse = await auth.handler(signInRequest)

    if (!authResponse || authResponse.status !== 200) {
      const error = await authResponse?.json().catch(() => ({ message: 'Felaktigt personnummer eller lösenord' }))
      return {
        statusCode: 401,
        body: JSON.stringify({ message: error?.message || 'Felaktigt personnummer eller lösenord' }),
      }
    }

    // Get response body and headers
    const responseBody = await authResponse.text()
    const responseHeaders: Record<string, string> = {}
    authResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...responseHeaders,
      },
      body: responseBody,
    }
  } catch (error: any) {
    console.error('Login error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

