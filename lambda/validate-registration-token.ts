import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'

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

  try {
    const token = event.queryStringParameters?.token

    if (!token) {
      return {
        statusCode: 400,
        headers: getCorsHeaders(origin),
        body: JSON.stringify({ 
          valid: false,
          message: 'Token is required' 
        }),
      }
    }

    // Check if token exists and is not expired
    const now = new Date()
    let tokenRow: { expires_at: string; club_id?: number | null } | undefined

    try {
      const tokens = await sql`
        SELECT token, expires_at, club_id
        FROM registration_tokens
        WHERE token = ${token}
        AND expires_at > ${now}
        LIMIT 1
      `
      tokenRow = tokens[0] as typeof tokenRow
    } catch (columnError: any) {
      if (columnError?.code !== '42703') {
        throw columnError
      }
      const tokens = await sql`
        SELECT token, expires_at
        FROM registration_tokens
        WHERE token = ${token}
        AND expires_at > ${now}
        LIMIT 1
      `
      tokenRow = tokens[0] as typeof tokenRow
    }

    if (!tokenRow) {
      return {
        statusCode: 200,
        headers: getCorsHeaders(origin),
        body: JSON.stringify({ 
          valid: false,
          message: 'Token is invalid or expired' 
        }),
      }
    }

    return {
      statusCode: 200,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({ 
        valid: true,
        expiresAt: tokenRow.expires_at,
        clubId: tokenRow.club_id ?? null,
      }),
    }
  } catch (error: any) {
    console.error('Error validating token:', error)
    return {
      statusCode: 500,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({ 
        valid: false,
        message: 'Failed to validate token',
        error: error.message 
      }),
    }
  }
}
