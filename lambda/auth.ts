import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { auth } from '../src/lib/auth'

// Helper function to get CORS origin from request
function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.Origin || event.headers?.origin || '*'
  const allowedOrigins = [
    'http://localhost:5173',
    'https://main.d3jub8c52hgrc6.amplifyapp.com',
  ]
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Check if Better Auth secret is set
  if (!process.env.BETTER_AUTH_SECRET && !process.env.SECRET) {
    console.error('BETTER_AUTH_SECRET is not set! Better Auth requires a secret.')
    const origin = getCorsOrigin(event)
    
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ 
        message: 'Server configuration error: BETTER_AUTH_SECRET is not set',
        hint: 'Add BETTER_AUTH_SECRET to your Lambda environment variables. Generate one with: openssl rand -base64 32'
      }),
    }
  }
  
  try {
    // Extract path from API Gateway event
    // API Gateway path: /auth/session or /auth/sign-up/email
    // Better Auth expects: /session or /sign-up/email (relative to basePath)
    const path = event.path || '/'
    const basePath = '/auth'
    
    // Remove basePath from path to get relative path
    let relativePath = path.startsWith(basePath) 
      ? path.slice(basePath.length) || '/'
      : path
    
    // Remove leading slash if present
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1)
    }
    
    // Build the full URL for Better Auth
    const protocol = event.headers?.['X-Forwarded-Proto'] || event.headers?.['x-forwarded-proto'] || 'https'
    const host = event.headers?.Host || event.headers?.host || 'localhost'
    const apiBaseUrl = process.env.BETTER_AUTH_URL || `${protocol}://${host}`
    const fullUrl = `${apiBaseUrl}${basePath}/${relativePath}`
    
    // Add query parameters if present
    let url: URL
    try {
      url = new URL(fullUrl)
    } catch (error) {
      console.error('Invalid URL construction:', { 
        apiBaseUrl,
        basePath,
        relativePath,
        path: event.path,
        fullUrl,
        host,
        protocol 
      })
      const origin = getCorsOrigin(event)
      
      return {
        statusCode: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
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

    // Create headers object for Better Auth
    const headers = new Headers()
    
    // Set critical headers
    headers.set('host', host)
    headers.set('origin', `${protocol}://${host}`)
    
    // Copy all headers from API Gateway event
    Object.entries(event.headers || {}).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        const lowerKey = key.toLowerCase()
        if (lowerKey !== 'host' && lowerKey !== 'origin') {
          headers.set(lowerKey, value)
        }
      }
    })

    // Parse request body early for OTP code extraction
    let requestEmail: string | undefined
    if (event.body && (relativePath === 'send-verification-email' || 
                       relativePath === 'email-otp/send-verification-otp' ||
                       relativePath === 'email-otp/check-verification-otp')) {
      try {
        const parsedBody = JSON.parse(event.body)
        requestEmail = parsedBody?.email
      } catch {
        // Ignore parse errors
      }
    }
    
    // Create Request object for Better Auth
    const request = new Request(url.toString(), {
      method: event.httpMethod || 'GET',
      headers,
      body: event.body || undefined,
    })

    // Call Better Auth handler
    try {
      if (typeof auth.handler !== 'function') {
        console.error('Better Auth handler is not a function!', { authType: typeof auth, authKeys: Object.keys(auth) })
        const origin = getCorsOrigin(event)
        
        return {
          statusCode: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
          },
          body: JSON.stringify({ message: 'Better Auth handler not initialized correctly' }),
        }
      }
      
      // Use Better Auth's API directly for session endpoint
      if (relativePath === 'session' && auth.api && typeof (auth.api as any).getSession === 'function') {
        try {
          const sessionResult = await (auth.api as any).getSession({
            headers: Object.fromEntries(request.headers.entries()),
          })
          
          const origin = getCorsOrigin(event)
          
          return {
            statusCode: 200,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': origin,
              'Access-Control-Allow-Credentials': 'true',
            },
            body: JSON.stringify(sessionResult),
          }
        } catch (apiError: any) {
          console.error('Better Auth API getSession failed:', apiError?.message)
          // Fall through to handler
        }
      }
      
      // For other routes, use the handler
      const response = await auth.handler(request)
      
      // Read response body once
      let responseBody = await response.text()
      
      // After successful Email OTP verification, update emailVerified in database
      if (relativePath === 'email-otp/check-verification-otp' && response.status === 200) {
        try {
          const responseBodyParsed = JSON.parse(responseBody)
          
          if (!responseBodyParsed.error && requestEmail) {
            const { updateEmailVerified } = await import('../src/lib/auth')
            await updateEmailVerified(requestEmail, true)
          }
        } catch (e) {
          console.error('Error processing Email OTP verification:', e)
        }
      }
      
      // In development, include OTP code in response
      if ((process.env.NODE_ENV !== 'production') && 
          (relativePath === 'email-otp/send-verification-otp') &&
          response.status === 200 &&
          requestEmail) {
        try {
          const { getOTPCode } = await import('../src/lib/auth')
          const otpCode = getOTPCode(requestEmail)
          
          if (otpCode) {
            try {
              const parsedBody = JSON.parse(responseBody)
              parsedBody.code = otpCode
              responseBody = JSON.stringify(parsedBody)
            } catch (parseError) {
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
      
      // Log verification codes for sign-up (development only)
      if ((process.env.NODE_ENV !== 'production') && 
          relativePath === 'sign-up/email' &&
          response.status === 200) {
        try {
          const { db } = await import('../src/lib/auth')
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
      
      // Log errors for debugging
      if (response.status >= 400) {
        let parsedBody: any = null
        try {
          parsedBody = JSON.parse(responseBody)
        } catch {
          parsedBody = responseBody
        }
        
        if (process.env.NODE_ENV !== 'production' || response.status >= 500) {
          console.error(`Better Auth ${response.status} error:`, {
            path: relativePath,
            message: parsedBody?.message || parsedBody?.error || 'Unknown error',
          })
        }
      }
      
      // Convert Response to API Gateway format
      // Get origin from request to allow credentials - MUST use specific origin, not *
      const origin = getCorsOrigin(event)
      
      const responseHeaders: Record<string, string> = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie',
      }
      
      // Copy other headers from Better Auth response, but NEVER copy CORS headers
      response.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase()
        // Explicitly exclude ALL CORS-related headers from Better Auth response
        if (!lowerKey.startsWith('access-control-')) {
          responseHeaders[key] = value
        }
      })

      return {
        statusCode: response.status,
        headers: responseHeaders,
        body: responseBody,
      }
    } catch (error: unknown) {
      console.error('Better Auth handler error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      const origin = getCorsOrigin(event)
      
      return {
        statusCode: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ 
          message: 'Better Auth handler error',
          error: errorMessage,
        }),
      }
    }
  } catch (error: any) {
    console.error('Auth handler error:', error)
    const origin = getCorsOrigin(event)
    
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ 
        message: 'Internal server error',
        error: error?.message || String(error),
      }),
    }
  }
}

