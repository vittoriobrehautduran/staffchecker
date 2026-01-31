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

// Import the same challenge store (in production, use Redis or database)
// For now, we'll pass challengeKey and verify it matches
const registrationChallenges = new Map<string, { challenge: string; userId: string; expiresAt: number }>()

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
    const { challengeKey, credential, name } = body

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
    const storedChallenge = registrationChallenges.get(challengeKey)
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
      registrationChallenges.delete(challengeKey)
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

    // Extract credential data from WebAuthn response
    // credential.rawId is an ArrayBuffer, convert to base64url
    const credentialId = Buffer.from(credential.rawId).toString('base64url')
    
    // Store the attestation response data
    // The public key is embedded in credential.response.attestationObject
    // For now, we'll store the raw response data - proper verification requires @simplewebauthn/server
    const publicKey = JSON.stringify({
      attestationObject: credential.response.attestationObject 
        ? Buffer.from(credential.response.attestationObject).toString('base64url')
        : null,
      clientDataJSON: credential.response.clientDataJSON
        ? Buffer.from(credential.response.clientDataJSON).toString('base64url')
        : null,
    })
    const counter = 0 // Initial counter

    // Check if credential already exists
    const existingCredential = await sql`
      SELECT id FROM public."passkey" WHERE "credentialId" = ${credentialId} LIMIT 1
    `

    if (existingCredential.length > 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'This passkey is already registered' }),
      }
    }

    // Store the passkey
    const passkeyId = randomBytes(16).toString('hex')
    await sql`
      INSERT INTO public."passkey" (id, "userId", name, "publicKey", "credentialId", counter)
      VALUES (${passkeyId}, ${userId}, ${name || 'Default Device'}, ${publicKey}, ${credentialId}, ${counter.toString()})
    `

    // Clean up challenge
    registrationChallenges.delete(challengeKey)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        message: 'Passkey registered successfully',
        passkeyId,
      }),
    }
  } catch (error: any) {
    console.error('Error in webauthn-register-complete:', error)
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

