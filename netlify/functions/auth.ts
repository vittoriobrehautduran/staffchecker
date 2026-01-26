import { Handler } from '@netlify/functions'
import { auth } from '../../src/lib/auth'

// Import baseURL and basePath from auth config for logging
const baseURL = process.env.NETLIFY_DEV 
  ? 'http://localhost:8888' 
  : (process.env.URL ? new URL(process.env.URL).origin : 'http://localhost:8888')

export const handler: Handler = async (event) => {
  // Check if Better Auth secret is set (required for Better Auth to work)
  if (!process.env.BETTER_AUTH_SECRET && !process.env.SECRET) {
    console.error('BETTER_AUTH_SECRET is not set! Better Auth requires a secret.')
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: 'Server configuration error: BETTER_AUTH_SECRET is not set',
        hint: 'Add BETTER_AUTH_SECRET to your .env.local file. Generate one with: openssl rand -base64 32'
      }),
    }
  }
  
  try {
    // Convert Netlify event to Web API Request for Better Auth
    // Better Auth needs the host header to be set correctly
    const host = event.headers.host || event.headers['x-forwarded-host'] || 'localhost:8888'
    const protocol = event.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https')
    
    // Ensure host header is set in headers object for Better Auth
    if (!event.headers.host && !event.headers['x-forwarded-host']) {
      // Add host header if missing
      event.headers.host = host
    }
    
    // Extract the path relative to basePath (/.netlify/functions/auth)
    // If event.path is /.netlify/functions/auth/session, we want /session
    // Handle case where client sends /.netlify/functions/auth/auth/session (double /auth)
    const basePath = '/.netlify/functions/auth'
    let fullPath = event.path || basePath
    
    // Fix double /auth issue: /.netlify/functions/auth/auth/session -> /.netlify/functions/auth/session
    if (fullPath.includes('/auth/auth/')) {
      fullPath = fullPath.replace('/auth/auth/', '/auth/')
    }
    
    const relativePath = fullPath.startsWith(basePath) 
      ? fullPath.slice(basePath.length) || '/'
      : fullPath
    
    // Build the full URL for the Request object
    const baseUrl = `${protocol}://${host}`
    const fullUrl = `${baseUrl}${basePath}${relativePath}`
    
    // Add query parameters if present
    let url: URL
    try {
      url = new URL(fullUrl)
    } catch (error) {
      console.error('Invalid URL construction:', { 
        baseUrl, 
        basePath, 
        relativePath, 
        fullPath: event.path,
        fullUrl, 
        host, 
        protocol 
      })
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Invalid URL construction', error: String(error) }),
      }
    }
    
    if (event.queryStringParameters) {
      Object.entries(event.queryStringParameters).forEach(([key, value]) => {
        if (value) {
          url.searchParams.set(key, value)
        }
      })
    }

    // Create headers object - Better Auth needs host header to construct URLs
    const headers = new Headers()
    
    // First, ensure critical headers are set
    headers.set('host', host)
    headers.set('origin', `${protocol}://${host}`)
    
    // Then add all other headers from the event
    Object.entries(event.headers || {}).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        const lowerKey = key.toLowerCase()
        // Don't override host and origin if already set
        if (lowerKey !== 'host' && lowerKey !== 'origin') {
          headers.set(lowerKey, value)
        }
      }
    })

    // Create Request object
    const requestUrl = url.toString()
    
    // Parse request body early to extract email for OTP code lookup
    // This must be done before creating the Request, as the body gets consumed
    let requestEmail: string | undefined
    if (event.body && (relativePath === '/send-verification-email' || 
                       relativePath === '/email-otp/send-verification-otp' ||
                       relativePath === '/email-otp/check-verification-otp')) {
      try {
        const parsedBody = JSON.parse(event.body)
        requestEmail = parsedBody?.email
      } catch {
        // Ignore parse errors
      }
    }
    
    // Create the request with the full URL including basePath
    // Better Auth will match basePath and route to the relative path
    const request = new Request(requestUrl, {
      method: event.httpMethod || 'GET',
      headers,
      body: event.body || undefined,
    })

    // Call Better Auth handler
    
    // Better Auth should match the basePath and route to the relative path
    try {
      // Check if Better Auth handler is actually a function
      if (typeof auth.handler !== 'function') {
        console.error('Better Auth handler is not a function!', { authType: typeof auth, authKeys: Object.keys(auth) })
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Better Auth handler not initialized correctly' }),
        }
      }
      
      // Use Better Auth's API directly for session endpoint to bypass routing issues
      if (relativePath === '/session' && auth.api && typeof (auth.api as any).getSession === 'function') {
        try {
          const sessionResult = await (auth.api as any).getSession({
            headers: Object.fromEntries(request.headers.entries()),
          })
          
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionResult),
          }
        } catch (apiError: any) {
          console.error('Better Auth API getSession failed:', apiError?.message)
          // Fall through to handler for other routes or if API fails
        }
      }
      
      // For other routes, use the handler
      const response = await auth.handler(request)
      
      // Read response body once (can only be read once)
      let responseBody = await response.text()
      
      // After successful Email OTP verification, update emailVerified in database
      if (relativePath === '/email-otp/check-verification-otp' && response.status === 200) {
        try {
          const responseBodyParsed = JSON.parse(responseBody)
          
          // If verification was successful, update emailVerified
          if (!responseBodyParsed.error && requestEmail) {
            const { updateEmailVerified } = await import('../../src/lib/auth')
            await updateEmailVerified(requestEmail, true)
          }
        } catch (e) {
          console.error('Error processing Email OTP verification:', e)
        }
      }
      
      // In development, include OTP code in response for email OTP endpoints
      if ((process.env.NETLIFY_DEV || process.env.NODE_ENV !== 'production') && 
          (relativePath === '/email-otp/send-verification-otp') &&
          response.status === 200 &&
          requestEmail) {
        try {
          // Get OTP code from in-memory store (set by email OTP plugin callback)
          const { getOTPCode } = await import('../../src/lib/auth')
          const otpCode = getOTPCode(requestEmail)
          
          if (otpCode) {
            // Include OTP code in response body for frontend to access
            try {
              const parsedBody = JSON.parse(responseBody)
              parsedBody.code = otpCode
              responseBody = JSON.stringify(parsedBody)
            } catch (parseError) {
              // If response is not JSON, wrap it
              responseBody = JSON.stringify({ 
                message: responseBody,
                code: otpCode 
              })
            }
          }
        } catch (error) {
          console.error('Error adding OTP code to response:', error)
        }
      }
      
      // Log verification codes for sign-up (but don't modify response)
      if ((process.env.NETLIFY_DEV || process.env.NODE_ENV !== 'production') && 
          relativePath === '/sign-up/email' &&
          response.status === 200) {
        try {
          const { db } = await import('../../src/lib/auth')
          const verificationRecords = await db.query.verification.findMany({
            orderBy: (verification, { desc }) => [desc(verification.createdAt)],
            limit: 1,
          })
          
          if (verificationRecords.length > 0) {
            const latestVerification = verificationRecords[0]
            console.log('\n📧 EMAIL VERIFICATION CODE (Development Only)')
            console.log('═══════════════════════════════════════════════════')
            console.log(`Email: ${latestVerification.identifier}`)
            console.log(`Verification Token: ${latestVerification.value}`)
            console.log(`Expires At: ${latestVerification.expiresAt}`)
            console.log('═══════════════════════════════════════════════════\n')
          }
        } catch (error) {
          console.error('Error logging verification code:', error)
        }
      }
      
      // Log error details for debugging
      if (response.status >= 400) {
        let parsedBody: any = null
        try {
          parsedBody = JSON.parse(responseBody)
        } catch {
          parsedBody = responseBody
        }
        
        const errorDetails: any = {
          requestUrl: request.url,
          relativePath,
          responseBody: parsedBody,
          responseHeaders: Object.fromEntries(response.headers.entries()),
        }
        
        // Add extra details for 404 errors
        if (response.status === 404) {
          errorDetails.urlPathname = url.pathname
          errorDetails.urlPathnameStartsWithBasePath = url.pathname.startsWith(basePath)
          errorDetails.basePath = basePath
        }
        
        // Only log errors in development or for server errors
        if (process.env.NETLIFY_DEV || response.status >= 500) {
          console.error(`Better Auth ${response.status} error:`, {
            path: relativePath,
            message: parsedBody?.message || parsedBody?.error || 'Unknown error',
        })
        }
      }
      
      // Convert Response to Netlify format
      const responseHeaders: Record<string, string> = {}
      
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      return {
        statusCode: response.status,
        headers: responseHeaders,
        body: responseBody,
      }
    } catch (error: any) {
      console.error('Better Auth handler error:', error)
      console.error('Error stack:', error?.stack)
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: 'Better Auth handler error',
          error: error?.message || String(error),
        }),
      }
    }
  } catch (error: any) {
    console.error('Auth handler error:', error)
    console.error('Error stack:', error?.stack)
    console.error('Event details:', {
      path: event.path,
      httpMethod: event.httpMethod,
      headers: Object.keys(event.headers || {}),
    })
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: 'Internal server error',
        error: error?.message || String(error),
        stack: process.env.NETLIFY_DEV ? error?.stack : undefined,
      }),
    }
  }
}

