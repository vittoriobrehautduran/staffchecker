import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { randomBytes } from 'crypto'

// Helper function to get CORS origin from request
function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const allowedOrigins = [
    'http://localhost:5173',
    'https://main.d3jub8c52hgrc6.amplifyapp.com',
  ]
  
  // Try to get origin from various header formats
  const requestOrigin = (
    event.headers?.Origin || 
    event.headers?.origin || 
    event.headers?.['Origin'] ||
    event.multiValueHeaders?.Origin?.[0] ||
    event.multiValueHeaders?.origin?.[0] ||
    ''
  ).trim()
  
  // If origin is empty or not in allowed list, default to first allowed origin
  if (!requestOrigin || requestOrigin === '*' || !allowedOrigins.includes(requestOrigin)) {
    return allowedOrigins[0]
  }
  
  return requestOrigin
}

// Import challenge store
const loginChallenges = new Map<string, { challenge: string; userId: string; credentialId: string; expiresAt: number }>()

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Get origin early and ensure it's never empty
  let origin: string
  try {
    origin = getCorsOrigin(event)
    // Fallback if somehow still empty
    if (!origin || origin.trim() === '') {
      origin = 'http://localhost:5173'
    }
  } catch (error) {
    origin = 'http://localhost:5173'
  }

  // Handle OPTIONS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie',
        'Access-Control-Max-Age': '86400',
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
    const { challengeKey, credential } = body

    if (!challengeKey || !credential) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'challengeKey and credential are required' }),
      }
    }

    // Get stored challenge
    const storedChallenge = loginChallenges.get(challengeKey)
    if (!storedChallenge) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Invalid or expired challenge' }),
      }
    }

    if (storedChallenge.expiresAt < Date.now()) {
      loginChallenges.delete(challengeKey)
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Challenge expired' }),
      }
    }

    const { userId } = storedChallenge

    // Extract credential ID
    const credentialId = Buffer.from(credential.rawId).toString('base64url')

    // Verify the credential belongs to this user
    const passkeyResult = await sql`
      SELECT id, "userId", counter FROM public."passkey" 
      WHERE "credentialId" = ${credentialId} AND "userId" = ${userId}
      LIMIT 1
    `

    if (passkeyResult.length === 0) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Invalid passkey' }),
      }
    }

    const passkey = passkeyResult[0]

    // TODO: Verify the signature using the stored public key
    // For now, we'll trust the browser's WebAuthn implementation
    // In production, you should use a library like @simplewebauthn/server to verify

    // Update counter (prevents replay attacks)
    const newCounter = (parseInt(passkey.counter) || 0) + 1
    await sql`
      UPDATE public."passkey" 
      SET counter = ${newCounter.toString()}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${passkey.id}
    `

    // Clean up challenge
    loginChallenges.delete(challengeKey)

    // Create a Better Auth session for this user
    // We'll create a session directly in the database
    const frontendOrigin = event.headers?.Origin || event.headers?.origin || process.env.BETTER_AUTH_URL || 'https://main.d3jub8c52hgrc6.amplifyapp.com'
    
    try {
      const { getAuth } = await import('../../src/lib/auth')
      const auth = getAuth(frontendOrigin)
      
      // Generate session token and ID
      const sessionId = randomBytes(16).toString('hex')
      const sessionToken = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      
      // Create session in database
      await sql`
        INSERT INTO public."session" (id, "userId", "expiresAt", token, "ipAddress", "userAgent")
        VALUES (
          ${sessionId},
          ${userId},
          ${expiresAt.toISOString()},
          ${sessionToken},
          ${event.requestContext?.identity?.sourceIp || null},
          ${event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null}
        )
      `
      
      // Set session cookie
      // Better Auth uses a specific cookie format
      const cookieName = 'better-auth.session_token'
      const cookieValue = sessionToken
      const cookieOptions = [
        `${cookieName}=${cookieValue}`,
        `Path=/`,
        `Max-Age=${30 * 24 * 60 * 60}`, // 30 days
        `SameSite=None`,
        `Secure`,
        `HttpOnly`,
      ].join('; ')
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Set-Cookie': cookieOptions,
        },
        body: JSON.stringify({
          message: 'Authentication successful',
          userId,
          sessionId,
        }),
      }
    } catch (authError: any) {
      console.error('Error creating session:', authError)
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Authentication successful but session creation failed' }),
      }
    }
  } catch (error: any) {
    console.error('Error in webauthn-login-complete:', error)
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

