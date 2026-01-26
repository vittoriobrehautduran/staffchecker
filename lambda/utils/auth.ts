import { sql } from './database'
import { auth } from '../../src/lib/auth'
import { APIGatewayProxyEvent } from 'aws-lambda'

// Get Better Auth user ID from request (Lambda format)
export async function getBetterAuthUserIdFromRequest(event: APIGatewayProxyEvent): Promise<string | null> {
  try {
    // Use Better Auth's API directly instead of HTTP handler
    if (auth.api && typeof (auth.api as any).getSession === 'function') {
      const headers: Record<string, string> = {}
      
      // Copy all headers from the original request
      if (event.headers?.Cookie || event.headers?.cookie) {
        headers['cookie'] = event.headers.Cookie || event.headers.cookie || ''
      }
      if (event.headers?.Authorization || event.headers?.authorization) {
        headers['authorization'] = event.headers.Authorization || event.headers.authorization || ''
      }
      if (event.headers?.Host || event.headers?.host) {
        headers['host'] = event.headers.Host || event.headers.host || ''
      }
      
      const sessionResult = await (auth.api as any).getSession({
        headers,
      })
      
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
    const url = `${apiBaseUrl}/api/auth/session`
    
    const request = new Request(url, {
      method: 'GET',
      headers: {
        'cookie': event.headers?.Cookie || event.headers?.cookie || '',
        'host': host,
      },
    })
    
    const response = await auth.handler(request)
    
    if (response && response.status === 200) {
      const sessionData = await response.json()
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

