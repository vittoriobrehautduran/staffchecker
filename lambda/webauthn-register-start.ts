import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getBetterAuthUserIdFromRequest } from './utils/auth'
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

// In-memory store for registration challenges (expires after 5 minutes)
const registrationChallenges = new Map<string, { challenge: string; userId: string; expiresAt: number }>()

// Clean up expired challenges periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of registrationChallenges.entries()) {
    if (value.expiresAt < now) {
      registrationChallenges.delete(key)
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

  // Debug logging (remove in production)
  console.log('Request method:', event.httpMethod)
  console.log('Request headers:', JSON.stringify(event.headers))
  console.log('Detected origin:', origin)

  // Handle OPTIONS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie',
      'Access-Control-Max-Age': '86400',
    }
    
    console.log('OPTIONS response headers:', JSON.stringify(corsHeaders))
    
    return {
      statusCode: 200,
      headers: corsHeaders,
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
    // User must be logged in to register a passkey
    const betterAuthUserId = await getBetterAuthUserIdFromRequest(event)
    if (!betterAuthUserId) {
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

    // Get user info
    const userResult = await sql`
      SELECT id, email, name FROM public."user" WHERE id = ${betterAuthUserId} LIMIT 1
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

    const user = userResult[0]

    // Generate a random challenge (32 bytes, base64 encoded)
    const challenge = randomBytes(32).toString('base64url')

    // Store challenge temporarily (expires in 5 minutes)
    const challengeKey = `${betterAuthUserId}-${Date.now()}`
    registrationChallenges.set(challengeKey, {
      challenge,
      userId: betterAuthUserId,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    })

    // Get the frontend origin for the rpId (relying party ID)
    const frontendOrigin = event.headers?.Origin || event.headers?.origin || process.env.BETTER_AUTH_URL || 'https://main.d3jub8c52hgrc6.amplifyapp.com'
    const rpId = new URL(frontendOrigin).hostname

    // Return WebAuthn registration options
    const publicKeyCredentialCreationOptions = {
      challenge: Buffer.from(challenge, 'base64url'),
      rp: {
        name: 'Timrapport',
        id: rpId,
      },
      user: {
        id: Buffer.from(betterAuthUserId),
        name: user.email,
        displayName: user.name || user.email,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Prefer platform authenticators (Face ID, Touch ID)
        userVerification: 'required',
      },
      timeout: 60000, // 60 seconds
      attestation: 'none',
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
        options: publicKeyCredentialCreationOptions,
      }),
    }
  } catch (error: any) {
    console.error('Error in webauthn-register-start:', error)
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

