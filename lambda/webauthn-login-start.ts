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

// In-memory store for login challenges (expires after 5 minutes)
const loginChallenges = new Map<string, { challenge: string; userId: string; credentialId: string; expiresAt: number }>()

// Clean up expired challenges periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of loginChallenges.entries()) {
    if (value.expiresAt < now) {
      loginChallenges.delete(key)
    }
  }
}, 60000) // Clean up every minute

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

    // Find user by email
    const userResult = await sql`
      SELECT id FROM public."user" WHERE email = ${email.toLowerCase().trim()} LIMIT 1
    `

    if (userResult.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'User not found' }),
      }
    }

    const userId = userResult[0].id

    // Get all passkeys for this user
    const passkeys = await sql`
      SELECT id, "credentialId", name FROM public."passkey" WHERE "userId" = ${userId}
    `

    if (passkeys.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'No passkeys registered for this user' }),
      }
    }

    // Generate a random challenge
    const challenge = randomBytes(32).toString('base64url')

    // Get the frontend origin for the rpId
    const frontendOrigin = event.headers?.Origin || event.headers?.origin || process.env.BETTER_AUTH_URL || 'https://main.d3jub8c52hgrc6.amplifyapp.com'
    const rpId = new URL(frontendOrigin).hostname

    // Convert credentialIds to ArrayBuffer format for WebAuthn
    const allowCredentials = passkeys.map(pk => ({
      id: Buffer.from(pk.credentialId, 'base64url'),
      type: 'public-key',
    }))

    // Store challenge for each credential (we'll verify against the one used)
    const challengeKey = `${userId}-${Date.now()}`
    loginChallenges.set(challengeKey, {
      challenge,
      userId,
      credentialId: passkeys[0].credentialId, // Store first one, we'll match during verification
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    })

    const publicKeyCredentialRequestOptions = {
      challenge: Buffer.from(challenge, 'base64url'),
      rpId,
      allowCredentials,
      timeout: 60000, // 60 seconds
      userVerification: 'required',
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        challengeKey,
        options: publicKeyCredentialRequestOptions,
      }),
    }
  } catch (error: any) {
    console.error('Error in webauthn-login-start:', error)
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

