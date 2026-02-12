import { sql } from './database'
import { APIGatewayProxyEvent } from 'aws-lambda'

// Lazy load auth to catch initialization errors
let authInstance: any = null
let authLoadError: Error | null = null
async function getAuth() {
  if (authLoadError) {
    throw authLoadError
  }
  if (!authInstance) {
    try {
      console.log('Loading auth module...')
      const authModule = await import('../../src/lib/auth')
      authInstance = authModule.auth
      if (!authInstance) {
        throw new Error('auth export not found in auth module')
      }
      console.log('Auth module loaded successfully')
    } catch (error) {
      console.error('Failed to import auth module:', error)
      authLoadError = error instanceof Error ? error : new Error(String(error))
      throw authLoadError
    }
  }
  return authInstance
}

// Get Better Auth user ID from request (Lambda format)
export async function getBetterAuthUserIdFromRequest(event: APIGatewayProxyEvent): Promise<string | null> {
  try {
    console.log('getBetterAuthUserIdFromRequest: Starting')
    console.log('Event headers keys:', Object.keys(event.headers || {}))
    console.log('Event multiValueHeaders keys:', Object.keys(event.multiValueHeaders || {}))
    console.log('Raw Authorization header:', event.headers?.Authorization || event.headers?.authorization || 'NOT FOUND')
    
    // Debug: Log ALL headers (not just auth/cookie) to see what API Gateway receives
    console.log('=== ALL HEADERS RECEIVED ===')
    if (event.headers) {
      Object.entries(event.headers).forEach(([key, value]) => {
        console.log(`Header [${key}]:`, typeof value === 'string' ? value.substring(0, 100) : value)
      })
    }
    if (event.multiValueHeaders) {
      Object.entries(event.multiValueHeaders).forEach(([key, values]) => {
        console.log(`MultiHeader [${key}]:`, Array.isArray(values) ? values.map(v => String(v).substring(0, 100)).join('; ') : values)
      })
    }
    console.log('=== END HEADERS DEBUG ===')
    
    // Extract cookies from API Gateway event
    // API Gateway can send cookies in headers.Cookie, headers.cookie, or multiValueHeaders.Cookie
    let cookieHeader = ''
    if (event.multiValueHeaders?.Cookie) {
      cookieHeader = event.multiValueHeaders.Cookie.join('; ')
    } else if (event.multiValueHeaders?.cookie) {
      cookieHeader = event.multiValueHeaders.cookie.join('; ')
    } else if (event.headers?.Cookie) {
      cookieHeader = event.headers.Cookie
    } else if (event.headers?.cookie) {
      cookieHeader = event.headers.cookie
    }
    
    console.log('Extracted cookie header:', cookieHeader ? 'Present' : 'Missing', cookieHeader ? cookieHeader.substring(0, 100) : '')
    
    // Get auth instance (lazy loaded) with timeout protection
    let auth: any
    try {
      auth = await Promise.race([
        getAuth(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth module load timeout')), 10000)
        )
      ]) as any
    } catch (authError: any) {
      console.error('Failed to load auth module:', authError?.message || authError)
      return null
    }
    
    // Use Better Auth's API directly instead of HTTP handler
    if (auth?.api && typeof (auth.api as any).getSession === 'function') {
      const headers: Record<string, string> = {}
      
      // Check query parameters first (workaround for API Gateway REST API stripping headers)
      console.log('Query string parameters:', JSON.stringify(event.queryStringParameters || {}))
      console.log('Multi-value query string parameters:', JSON.stringify(event.multiValueQueryStringParameters || {}))
      const queryToken = event.queryStringParameters?._token || 
                        event.multiValueQueryStringParameters?._token?.[0] ||
                        ''
      if (queryToken) {
        console.log('Found _token query parameter, length:', queryToken.length, 'first 20 chars:', queryToken.substring(0, 20))
      } else {
        console.log('No _token query parameter found')
      }
      
      // Prioritize Authorization header (token-based auth) over cookies
      // This works better for cross-origin requests and mobile browsers
      // API Gateway may send headers in different cases, check both
      // Also check multiValueHeaders (API Gateway v1)
      // Also check X-Auth-Token as fallback (API Gateway REST API sometimes strips Authorization)
      const authHeader = event.headers?.Authorization || 
                        event.headers?.authorization || 
                        event.multiValueHeaders?.Authorization?.[0] ||
                        event.multiValueHeaders?.authorization?.[0] ||
                        ''
      
      const xAuthToken = event.headers?.['X-Auth-Token'] || 
                        event.headers?.['x-auth-token'] ||
                        event.multiValueHeaders?.['X-Auth-Token']?.[0] ||
                        event.multiValueHeaders?.['x-auth-token']?.[0] ||
                        ''
      
      // Use query parameter if headers are missing (API Gateway REST API strips headers)
      // Priority: Authorization header > X-Auth-Token header > query parameter
      const tokenToUse = authHeader ? authHeader : 
                        (xAuthToken ? `Bearer ${xAuthToken}` : 
                        (queryToken ? `Bearer ${queryToken}` : ''))
      
      if (tokenToUse) {
        if (authHeader) {
          console.log('Authorization header received:', authHeader.substring(0, 50) + '...')
        } else if (xAuthToken) {
          console.log('X-Auth-Token header received (Authorization was stripped by API Gateway):', xAuthToken.substring(0, 50) + '...')
        } else if (queryToken) {
          console.log('Token from query parameter (headers were stripped by API Gateway):', queryToken.substring(0, 50) + '...')
        }
        
        // If it's a Bearer token, extract just the token part
        if (tokenToUse.startsWith('Bearer ')) {
          const token = tokenToUse.substring(7)
          console.log('Extracted Bearer token, length:', token.length, 'first 20 chars:', token.substring(0, 20))
          
          // Better Auth expects the session token in a cookie format
          // Use the raw token value (don't double-encode, it's already URL encoded from cookie)
          headers['cookie'] = `__Secure-better-auth.session_token=${token}`
          // Also try without __Secure- prefix
          headers['cookie'] += `; better-auth.session_token=${token}`
          console.log('Set cookie header from Bearer token')
        } else {
          headers['authorization'] = tokenToUse
        }
      } else {
        console.log('No Authorization header, X-Auth-Token header, or _token query parameter found')
      }
      // Fallback to cookies if no Authorization header (for backward compatibility)
      if (cookieHeader && !headers['cookie']) {
        headers['cookie'] = cookieHeader
      }
      if (event.headers?.Host || event.headers?.host) {
        headers['host'] = event.headers.Host || event.headers.host || ''
      }
      
      console.log('Calling Better Auth getSession with headers:', Object.keys(headers))
      console.log('Cookie header present:', !!cookieHeader, cookieHeader ? cookieHeader.substring(0, 50) + '...' : '')
      console.log('Authorization header present:', !!(headers['authorization'] || headers['Authorization']))
      console.log('All event headers:', Object.keys(event.headers || {}).filter(h => h.toLowerCase().includes('auth')))
      
      const sessionResult = await (auth.api as any).getSession({
        headers,
      })
      
      console.log('Better Auth session result:', sessionResult ? 'Got result' : 'No result')
      console.log('Session user ID:', sessionResult?.user?.id || sessionResult?.data?.user?.id || 'NOT FOUND')
      console.log('Full session result keys:', sessionResult ? Object.keys(sessionResult) : 'null')
      
      // Better Auth API returns {user: {...}} or {data: {user: {...}}}
      const user = sessionResult?.user || sessionResult?.data?.user
      
      if (user?.id) {
        return user.id
      }
    }
    
    // Fallback: use Better Auth handler directly with a Request object
    const protocol = event.headers?.['X-Forwarded-Proto'] || event.headers?.['x-forwarded-proto'] || 'https'
    const host = event.headers?.Host || event.headers?.host || 'localhost'
    const apiBaseUrl = process.env.BETTER_AUTH_URL || `https://${host}`
    // Fix: Better Auth endpoint is /auth/session, not /api/auth/session
    const url = `${apiBaseUrl}/auth/session`
    
    console.log('Fallback: Calling Better Auth handler at:', url)
    
    const request = new Request(url, {
      method: 'GET',
      headers: {
        'cookie': cookieHeader,
        'host': host,
      },
    })
    
    const authHandler = await getAuth()
    const response = await authHandler.handler(request)
    
    console.log('Better Auth handler response status:', response?.status)
    
    if (response && response.status === 200) {
      const sessionData: any = await response.json()
      const user = sessionData?.user || sessionData?.data?.user
      if (user?.id) {
        return user.id
      }
    }
    
    return null
  } catch (error) {
    console.error('Error getting Better Auth user ID:', error)
    return null
  }
}

// Get numeric user ID from Better Auth session
export async function getUserIdFromBetterAuthSession(event: APIGatewayProxyEvent): Promise<number | null> {
  const betterAuthUserId = await getBetterAuthUserIdFromRequest(event)
  
  console.log('getUserIdFromBetterAuthSession: Better Auth user ID:', betterAuthUserId ? 'Found' : 'Missing')
  
  if (!betterAuthUserId) {
    console.error('getUserIdFromBetterAuthSession: No Better Auth user ID found in session')
    return null
  }

  // Look up our numeric user ID from Better Auth user ID
  try {
    const result = await sql`
      SELECT id FROM users 
      WHERE better_auth_user_id = ${betterAuthUserId}
      LIMIT 1
    `

    if (result.length === 0) {
      console.error(`getUserIdFromBetterAuthSession: No user found with better_auth_user_id: ${betterAuthUserId}`)
      
      // Fallback: Try to find user by email from Better Auth user table
      try {
        const betterAuthUser = await sql`
          SELECT email FROM "user" WHERE id = ${betterAuthUserId} LIMIT 1
        `
        
        if (betterAuthUser.length > 0) {
          const email = betterAuthUser[0].email
          console.log(`getUserIdFromBetterAuthSession: Trying fallback lookup by email: ${email}`)
          
          const emailResult = await sql`
            SELECT id FROM users WHERE email = ${email} LIMIT 1
          `
          
          if (emailResult.length > 0) {
            console.log(`getUserIdFromBetterAuthSession: Found user by email, updating better_auth_user_id`)
            // Update the better_auth_user_id to fix the mapping
            await sql`
              UPDATE users 
              SET better_auth_user_id = ${betterAuthUserId}
              WHERE id = ${emailResult[0].id}
            `
            return emailResult[0].id
          }
        }
      } catch (fallbackError) {
        console.error('getUserIdFromBetterAuthSession: Fallback lookup failed:', fallbackError)
      }
      
      return null
    }

    console.log(`getUserIdFromBetterAuthSession: Found user ID: ${result[0].id}`)
    return result[0].id
  } catch (error) {
    console.error('Error getting user ID:', error)
    return null
  }
}

