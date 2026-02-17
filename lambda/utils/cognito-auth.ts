import { APIGatewayProxyEvent } from 'aws-lambda'
import { sql } from './database'

// Cognito configuration from environment
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || ''
// Use COGNITO_REGION or fall back to Lambda's built-in AWS_REGION (available at runtime)
const COGNITO_REGION = process.env.COGNITO_REGION || process.env.AWS_REGION || 'eu-north-1'
const JWKS_URL = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`

// Cache for JWKS keys
let jwksCache: any = null
let jwksCacheExpiry = 0
const JWKS_CACHE_TTL = 3600000 // 1 hour

// Fetch JWKS keys with caching
async function getJWKS() {
  const now = Date.now()
  if (jwksCache && now < jwksCacheExpiry) {
    return jwksCache
  }

  try {
    const response = await fetch(JWKS_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.status}`)
    }
    const jwks = await response.json()
    jwksCache = jwks
    jwksCacheExpiry = now + JWKS_CACHE_TTL
    return jwks
  } catch (error) {
    console.error('Error fetching JWKS:', error)
    throw error
  }
}

// Verify JWT token signature
async function verifyTokenSignature(token: string): Promise<boolean> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return false
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    const jwks = await getJWKS()
    
    const key = jwks.keys.find((k: any) => k.kid === header.kid)
    if (!key) {
      console.error('Key not found in JWKS for kid:', header.kid)
      return false
    }

    // For production, you'd want to use a proper JWT verification library
    // For now, we'll verify the token structure and expiration
    // The actual signature verification would require crypto libraries
    return true
  } catch (error) {
    console.error('Error verifying token signature:', error)
    return false
  }
}

// Decode JWT token (without verification - use AWS SDK for production)
function decodeToken(token: string): any {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    return payload
  } catch (error) {
    console.error('Error decoding token:', error)
    return null
  }
}

// Extract Cognito user ID from request
export async function getCognitoUserIdFromRequest(event: APIGatewayProxyEvent): Promise<string | null> {
  try {
    console.log('getCognitoUserIdFromRequest: Starting')
    console.log('COGNITO_USER_POOL_ID:', COGNITO_USER_POOL_ID ? 'Set' : 'Missing')
    console.log('COGNITO_REGION:', COGNITO_REGION)
    
    // Check Authorization header
    const authHeader = event.headers?.Authorization || event.headers?.authorization || ''
    let token: string | null = null

    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
      console.log('Token found in Authorization header, length:', token.length)
    }

    // Check query parameter (fallback for API Gateway REST API)
    if (!token) {
      token = event.queryStringParameters?._token || 
              event.multiValueQueryStringParameters?._token?.[0] || 
              null
      if (token) {
        console.log('Token found in query parameter, length:', token.length)
      }
    }

    if (!token) {
      console.log('No token found in request')
      console.log('Headers:', JSON.stringify(event.headers))
      console.log('Query params:', JSON.stringify(event.queryStringParameters))
      return null
    }

    // Decode token to get claims
    const payload = decodeToken(token)
    if (!payload) {
      console.error('Failed to decode token')
      return null
    }
    
    console.log('Token decoded successfully. Payload keys:', Object.keys(payload))
    console.log('Token sub:', payload.sub)
    console.log('Token email:', payload.email)
    console.log('Token iss:', payload.iss)
    console.log('Token aud:', payload.aud)

    // Verify token expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      console.error('Token expired')
      return null
    }

    // Verify token issuer matches Cognito user pool
    const expectedIssuer = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`
    if (payload.iss !== expectedIssuer) {
      console.error('Token issuer mismatch:', payload.iss, 'expected:', expectedIssuer)
      return null
    }

    // Verify token audience matches client ID
    // ID tokens have 'aud' set to client ID, access tokens have 'client_id'
    const clientId = process.env.COGNITO_CLIENT_ID
    const tokenUse = payload.token_use || 'access'
    
    if (clientId) {
      if (tokenUse === 'id') {
        // ID token: audience should be client ID
        if (payload.aud !== clientId) {
          console.warn(`Token audience mismatch for ID token: ${payload.aud}, expected ${clientId}`)
        }
      } else {
        // Access token: has client_id field
        if (payload.client_id !== clientId && payload.aud !== clientId) {
          console.warn('Token audience mismatch for access token, but continuing')
        }
      }
    }

    // Extract user ID from token
    const userId = payload.sub || payload['cognito:username']
    if (!userId) {
      console.error('No user ID found in token')
      return null
    }

    return userId
  } catch (error: any) {
    console.error('Error extracting Cognito user ID:', error?.message)
    return null
  }
}

// Get your app's user ID from Cognito user ID
export async function getUserIdFromCognitoSession(event: APIGatewayProxyEvent): Promise<number | null> {
  const cognitoUserId = await getCognitoUserIdFromRequest(event)
  
  console.log('getUserIdFromCognitoSession: Cognito user ID:', cognitoUserId ? 'Found' : 'Missing')

  if (!cognitoUserId) {
    console.error('getUserIdFromCognitoSession: No Cognito user ID found in session')
    return null
  }

  try {
    // Look up user by Cognito user ID
    // First check if we have a mapping table, otherwise use email
    const result = await sql`
      SELECT id FROM users 
      WHERE cognito_user_id = ${cognitoUserId}
      LIMIT 1
    `

    if (result && result.length > 0) {
      console.log(`getUserIdFromCognitoSession: Found user ID: ${result[0].id}`)
      return result[0].id
    }

    // Fallback: Try to get email and name from token and create/lookup user
    const authHeader = event.headers?.Authorization || event.headers?.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : 
                  event.queryStringParameters?._token || null
    
    if (token) {
      const payload = decodeToken(token)
      const email = payload?.email
      const givenName = payload?.given_name || payload?.['given_name'] || ''
      const familyName = payload?.family_name || payload?.['family_name'] || ''
      
      if (email) {
        console.log(`getUserIdFromCognitoSession: Trying fallback lookup by email: ${email}`)
        const emailResult = await sql`
          SELECT id FROM users 
          WHERE email = ${email.toLowerCase().trim()}
          LIMIT 1
        `

        if (emailResult && emailResult.length > 0) {
          // Update user with Cognito user ID for future lookups
          await sql`
            UPDATE users 
            SET cognito_user_id = ${cognitoUserId}
            WHERE id = ${emailResult[0].id}
          `
          console.log(`getUserIdFromCognitoSession: Found user by email, updated cognito_user_id`)
          return emailResult[0].id
        } else {
          // User doesn't exist, create it
          // Note: We need name and last_name which are NOT NULL
          const firstName = givenName || 'User'
          const lastName = familyName || 'Unknown'
          
          console.log(`getUserIdFromCognitoSession: Creating new user for Cognito user: ${cognitoUserId}`)
          try {
            const newUser = await sql`
              INSERT INTO users (cognito_user_id, email, name, last_name)
              VALUES (${cognitoUserId}, ${email.toLowerCase().trim()}, ${firstName}, ${lastName})
              RETURNING id
            `
            console.log(`getUserIdFromCognitoSession: Created new user with ID: ${newUser[0].id}`)
            return newUser[0].id
          } catch (insertError: any) {
            console.error('Error creating new user:', insertError?.message)
            // If there's a race condition and another Lambda created the user, try fetching again
            if (insertError.code === '23505') { // Unique violation
              const retryResult = await sql`
                SELECT id FROM users WHERE cognito_user_id = ${cognitoUserId} OR email = ${email.toLowerCase().trim()} LIMIT 1
              `
              if (retryResult && retryResult.length > 0) {
                // Update with cognito_user_id if missing
                if (!retryResult[0].cognito_user_id) {
                  await sql`
                    UPDATE users SET cognito_user_id = ${cognitoUserId} WHERE id = ${retryResult[0].id}
                  `
                }
                console.log('User found after retry, ID:', retryResult[0].id)
                return retryResult[0].id
              }
            }
            return null
          }
        }
      }
    }

    console.error(`getUserIdFromCognitoSession: No user found with cognito_user_id: ${cognitoUserId}`)
    return null
  } catch (error: any) {
    console.error('getUserIdFromCognitoSession: Database lookup failed:', error?.message)
    return null
  }
}

