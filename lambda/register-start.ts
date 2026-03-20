import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import crypto from 'crypto'

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://staffcheck.spangatbk.se',
    'https://staging.d3jub8c52hgrc6.amplifyapp.com',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[]

  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || '*'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
}

// Generate a secure random token
function generateToken(): string {
  return `token_${crypto.randomBytes(32).toString('hex')}`
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = event.headers.origin || event.headers.Origin || null

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(origin),
      body: '',
    }
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  // Require secret parameter from QR code
  const requiredSecret = process.env.REGISTRATION_SECRET
  const providedSecret = event.queryStringParameters?.secret

  if (!requiredSecret) {
    console.error('REGISTRATION_SECRET environment variable is not set')
    return {
      statusCode: 500,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({ message: 'Server configuration error' }),
    }
  }

  if (!providedSecret || providedSecret !== requiredSecret) {
    // Don't reveal that the endpoint exists - return generic error
    return {
      statusCode: 404,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({ message: 'Not found' }),
    }
  }

  try {
    // Check if a valid token exists (not expired)
    const now = new Date()
    const validTokens = await sql`
      SELECT token, expires_at
      FROM registration_tokens
      WHERE expires_at > ${now}
      ORDER BY created_at DESC
      LIMIT 1
    `

    let token: string

    if (validTokens.length > 0) {
      // Use existing valid token
      token = validTokens[0].token
    } else {
      // Generate new token (valid for 24 hours)
      token = generateToken()
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours from now

      await sql`
        INSERT INTO registration_tokens (token, expires_at, club_location)
        VALUES (${token}, ${expiresAt}, 'staffroom')
      `
    }

    // Redirect to registration page with token
    const frontendUrl = process.env.FRONTEND_URL || process.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:5173'
    const redirectUrl = `${frontendUrl.replace(/\/$/, '')}/register?token=${token}`

    return {
      statusCode: 302,
      headers: {
        ...getCorsHeaders(origin),
        Location: redirectUrl,
      },
      body: JSON.stringify({ redirectUrl }),
    }
  } catch (error: any) {
    console.error('Error in register-start:', error)
    return {
      statusCode: 500,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({ 
        message: 'Failed to generate registration token',
        error: error.message 
      }),
    }
  }
}
