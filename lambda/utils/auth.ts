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
      
      // Prioritize Authorization header (token-based auth) over cookies
      // This works better for cross-origin requests and mobile browsers
      if (event.headers?.Authorization || event.headers?.authorization) {
        headers['authorization'] = event.headers.Authorization || event.headers.authorization || ''
      }
      // Fallback to cookies if no Authorization header (for backward compatibility)
      if (cookieHeader && !headers['authorization']) {
        headers['cookie'] = cookieHeader
      }
      if (event.headers?.Host || event.headers?.host) {
        headers['host'] = event.headers.Host || event.headers.host || ''
      }
      
      console.log('Calling Better Auth getSession with headers:', Object.keys(headers))
      const sessionResult = await (auth.api as any).getSession({
        headers,
      })
      
      console.log('Better Auth session result:', sessionResult ? 'Got result' : 'No result', sessionResult?.user?.id || sessionResult?.data?.user?.id)
      
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
  if (!betterAuthUserId) {
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
      return null
    }

    return result[0].id
  } catch (error) {
    console.error('Error getting user ID:', error)
    return null
  }
}

