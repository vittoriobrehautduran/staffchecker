import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { auth } from '../src/lib/auth'

// Helper function to get CORS origin from request
function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.Origin || event.headers?.origin || '*'
  const allowedOrigins = [
    'http://localhost:5173',
    'https://main.d3jub8c52hgrc6.amplifyapp.com',
  ]
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]
}

// Custom login handler that looks up email by personnummer, then uses Better Auth
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
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie',
        'Access-Control-Max-Age': '86400', // 24 hours
      },
      body: '',
    }
  }

  const httpMethod = event.httpMethod || 'POST'
  
  if (httpMethod !== 'POST') {
    const origin = getCorsOrigin(event)
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
    const { email, password } = body

    if (!email || !password) {
      const origin = getCorsOrigin(event)
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          },
        body: JSON.stringify({ message: 'E-post och lösenord krävs' }),
        }
      }
      
    const userEmail = email.toLowerCase().trim()

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
      const error: { message?: string } = await authResponse?.json().catch(() => ({ message: 'Felaktigt e-post eller lösenord' })) || { message: 'Felaktigt e-post eller lösenord' }
      const origin = getCorsOrigin(event)
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: error?.message || 'Felaktigt e-post eller lösenord' }),
      }
    }

    // Get response body and headers
    const responseBody = await authResponse.text()
    const origin = getCorsOrigin(event)
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    }
    // Copy headers from Better Auth response, but exclude CORS headers
    authResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase()
      if (!lowerKey.startsWith('access-control-')) {
      responseHeaders[key] = value
      }
    })

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: responseBody,
    }
  } catch (error: any) {
    console.error('Login error:', error)
    const origin = getCorsOrigin(event)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

