import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

// Helper function to get CORS origin from request
function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.Origin || event.headers?.origin || '*'
  const allowedOrigins = [
    'http://localhost:5173',
    'https://main.d3jub8c52hgrc6.amplifyapp.com',
  ]
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]
}

// Lazy load auth to catch initialization errors
let authInstance: any = null
async function getAuth() {
  if (!authInstance) {
    try {
      const authModule = await import('../src/lib/auth')
      authInstance = authModule.auth
      if (!authInstance) {
        throw new Error('auth export not found in auth module')
      }
    } catch (error) {
      console.error('Failed to import auth module:', error)
      throw error
    }
  }
  return authInstance
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
  
  // Handle OPTIONS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    const origin = getCorsOrigin(event)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie,X-Auth-Token',
        'Access-Control-Max-Age': '86400', // 24 hours
      },
      body: '',
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
    // Better Auth needs the actual API Gateway URL (where the request is coming from)
    const protocol = event.headers?.['X-Forwarded-Proto'] || event.headers?.['x-forwarded-proto'] || 'https'
    const host = event.headers?.Host || event.headers?.host || 'localhost'
    // Use API Gateway host for the request URL (not frontend URL)
    const apiGatewayUrl = `${protocol}://${host}`
    const fullUrl = `${apiGatewayUrl}${basePath}/${relativePath}`
    
    // Add query parameters if present
    let url: URL
    try {
      url = new URL(fullUrl)
    } catch (error) {
      console.error('Invalid URL construction:', { 
        apiGatewayUrl,
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
    
    // Get the frontend origin (Better Auth expects this, not API Gateway origin)
    const frontendOrigin = event.headers?.Origin || event.headers?.origin || process.env.BETTER_AUTH_URL || `${protocol}://${host}`
    
    // Set critical headers
    headers.set('host', host)
    // Better Auth validates origin against baseURL for CSRF protection
    // Use the actual frontend origin, not the API Gateway origin
    headers.set('origin', frontendOrigin)
    
    // Log origin for debugging
    console.log('Request origin:', frontendOrigin)
    
    // Copy all headers from API Gateway event
    Object.entries(event.headers || {}).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        const lowerKey = key.toLowerCase()
        // Don't override origin - we set it correctly above
        // Don't override host - we need API Gateway host for Better Auth
        if (lowerKey !== 'origin') {
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
      // Lazy load auth to catch initialization errors
      // Use origin-specific auth instance to handle localhost vs Amplify
      const startTime = Date.now()
      let auth
      try {
        console.log('Starting auth module import...')
        // Import getAuth function that accepts origin
        const { getAuth } = await import('../src/lib/auth')
        // Get auth instance for this specific origin (handles localhost vs Amplify)
        auth = getAuth(frontendOrigin)
        console.log(`Auth module imported in ${Date.now() - startTime}ms`)
      } catch (authInitError: any) {
        console.error('Failed to initialize Better Auth:', authInitError)
        console.error('Error stack:', authInitError?.stack)
        const origin = getCorsOrigin(event)
        return {
          statusCode: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'true',
          },
          body: JSON.stringify({ 
            message: 'Failed to initialize authentication service',
            error: authInitError?.message || String(authInitError),
            hint: 'Check Lambda environment variables (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL)'
          }),
        }
      }
      
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
          
          // Extract the session token from cookies, Authorization header, or query parameter
          // This allows the frontend to use it for cross-origin requests (mobile Safari)
          const cookies = request.headers.get('cookie') || ''
          let sessionToken = null
          
          // Try to extract session token from cookie first
          const cookieMatch = cookies.match(/(?:__Secure-)?better-auth\.session_token=([^;]+)/)
          if (cookieMatch) {
            sessionToken = decodeURIComponent(cookieMatch[1])
            console.log('Extracted token from cookie for session response')
          }
          
          // Fallback: try Authorization header (mobile Safari workaround)
          if (!sessionToken) {
            const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || ''
            if (authHeader.startsWith('Bearer ')) {
              sessionToken = authHeader.substring(7)
              console.log('Extracted token from Authorization header for session response')
            }
          }
          
          // Fallback: try query parameter (mobile Safari workaround)
          if (!sessionToken && event.queryStringParameters?._token) {
            sessionToken = event.queryStringParameters._token
            console.log('Extracted token from query parameter for session response')
          }
          
          // If we have a session result, add the token to it
          if (sessionResult && sessionToken) {
            // Add token to session object if it exists
            if (sessionResult.session) {
              sessionResult.session.token = sessionToken
            } else if (sessionResult.data?.session) {
              sessionResult.data.session.token = sessionToken
            } else {
              // Create session object with token
              sessionResult.session = { ...sessionResult.session, token: sessionToken }
            }
          }
          
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
      console.log('Calling Better Auth handler:', {
        method: request.method,
        url: url.toString(),
        path: relativePath,
        hasBody: !!event.body,
        bodyPreview: event.body ? event.body.substring(0, 200) : undefined,
      })
      
      const response = await auth.handler(request)
      
      // Read response body once
      let responseBody = await response.text()
      
      // Log response details for debugging
      console.log('Better Auth response:', {
        status: response.status,
        statusText: response.statusText,
        bodyPreview: responseBody.substring(0, 500),
      })
      
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
        // Verification code is sent via email, not logged to console
      }
      
      // Log errors for debugging
      if (response.status >= 400) {
        let parsedBody: any = null
        try {
          parsedBody = JSON.parse(responseBody)
        } catch {
          parsedBody = responseBody
        }
        
        // Always log 422 errors (validation errors) with full details
        if (response.status === 422 || process.env.NODE_ENV !== 'production' || response.status >= 500) {
          console.error(`Better Auth ${response.status} error:`, {
            path: relativePath,
            method: request.method,
            url: url.toString(),
            error: parsedBody?.error || parsedBody?.message || 'Unknown error',
            fullResponse: parsedBody,
            requestBody: event.body ? (() => {
              try {
                return JSON.parse(event.body)
              } catch {
                return event.body
              }
            })() : null,
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
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie,X-Auth-Token',
      }
      
      // Copy other headers from Better Auth response, but NEVER copy CORS headers
      // For Set-Cookie headers, ensure they work cross-origin (SameSite=None; Secure)
      response.headers.forEach((value: string, key: string) => {
        const lowerKey = key.toLowerCase()
        // Explicitly exclude ALL CORS-related headers from Better Auth response
        if (!lowerKey.startsWith('access-control-')) {
          // Fix Set-Cookie headers for cross-origin
          if (lowerKey === 'set-cookie') {
            // Ensure cookies have SameSite=None and Secure for cross-origin
            let cookieValue = value
            // Add SameSite=None if not present
            if (!cookieValue.includes('SameSite=')) {
              cookieValue += '; SameSite=None'
            } else if (!cookieValue.includes('SameSite=None')) {
              // Replace existing SameSite with None
              cookieValue = cookieValue.replace(/SameSite=[^;]+/gi, 'SameSite=None')
            }
            // Ensure Secure is present (required for SameSite=None)
            if (!cookieValue.includes('Secure')) {
              cookieValue += '; Secure'
            }
            responseHeaders[key] = cookieValue
          } else {
        responseHeaders[key] = value
          }
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

