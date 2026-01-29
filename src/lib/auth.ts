import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP } from 'better-auth/plugins'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import { schema } from './auth-schema'

// Clean DATABASE_URL - remove psql prefix and quotes if present
function cleanDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  let cleaned = url.replace(/^psql\s+['"]?/, '')
  cleaned = cleaned.replace(/['"]\s*$/, '')
  cleaned = cleaned.trim().replace(/^['"]|['"]$/g, '')

  if (!cleaned.startsWith('postgresql://') && !cleaned.startsWith('postgres://')) {
    throw new Error(`Invalid DATABASE_URL format. Expected postgresql:// or postgres://, got: ${cleaned.substring(0, 20)}...`)
  }

  return cleaned
}

const databaseUrl = cleanDatabaseUrl(process.env.DATABASE_URL)

// Better Auth uses drizzle with postgres-js
// Create drizzle instance with schema
const client = postgres(databaseUrl, { max: 1 }) // Limit connections for serverless
export const db = drizzle(client, { schema })

// Get base URL from environment or infer from context
// baseURL should be just the origin (protocol + host) of the frontend
// Better Auth uses this to construct callback URLs and other absolute URLs
// basePath should be the API Gateway path to the auth endpoint (e.g., /auth)
// For local development, we need to accept localhost origins
function getBaseURL(requestOrigin?: string): string {
  // If we have a request origin (from API Gateway headers), use it for localhost
  // This allows local development to work
  if (requestOrigin) {
    const origin = requestOrigin.trim()
    // Allow localhost for local development
    if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
      return origin
    }
  }

  // Check environment variable (most reliable for production)
  // This should be your Amplify frontend URL (e.g., https://yourapp.amplifyapp.com)
  if (process.env.BETTER_AUTH_URL) {
    const url = process.env.BETTER_AUTH_URL.trim()
    // Ensure it doesn't have a trailing slash
    return url.replace(/\/$/, '')
  }

  // In Lambda, we might not have access to the frontend URL directly
  // Fallback: try to infer from API Gateway event headers
  // This will be set when the Lambda is invoked via API Gateway
  // For now, we'll require BETTER_AUTH_URL to be set in Lambda environment variables
  console.warn('BETTER_AUTH_URL not set. This should be your Amplify frontend URL.')
  return 'https://yourapp.amplifyapp.com' // This should be overridden via env var
}

// API Gateway path to the auth Lambda function
// This should match your API Gateway route (e.g., /auth)
const basePath = '/auth'

// In-memory store for OTP codes in development
// Keyed by email, stores the latest OTP code for that email
const otpCodeStore = new Map<string, { code: string, timestamp: number }>()

// Email OTP plugin configuration
// Sends 6-digit codes via email for verification
const emailOTPPlugin = emailOTP({
  sendVerificationOTP: async ({ email, otp, type: _type }) => {
    // Store OTP code for retrieval in development
    otpCodeStore.set(email, { code: otp, timestamp: Date.now() })
    
    // Clean up old codes (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000
    for (const [storedEmail, data] of otpCodeStore.entries()) {
      if (data.timestamp < tenMinutesAgo) {
        otpCodeStore.delete(storedEmail)
      }
    }


    // Send email via AWS SES
    try {
      // Dynamically import AWS SDK to avoid loading it if not needed
      const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses')
      
      // Get AWS region from environment or default to eu-north-1
      // Note: AWS_REGION is reserved by Lambda, so we use SES_REGION instead
      const awsRegion = process.env.SES_REGION || process.env.AWS_SES_REGION || 'eu-north-1'
      const fromEmail = process.env.SES_FROM_EMAIL || process.env.AWS_SES_FROM_EMAIL
      
      
      if (!fromEmail) {
        // In development, allow continuing without email
        if (process.env.NETLIFY_DEV || process.env.NODE_ENV !== 'production') {
          return Promise.resolve()
        } else {
          console.error('SES_FROM_EMAIL environment variable is required for email verification in production')
          throw new Error('SES_FROM_EMAIL environment variable is required for email verification in production')
        }
      }

      // Create SES client
      // In Lambda, credentials are automatically provided via IAM role
      // For local development, AWS SDK will use ~/.aws/credentials or environment variables
      const sesClient = new SESClient({
        region: awsRegion,
      })

      // Email content
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Verifiera din e-post</h1>
            </div>
            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none;">
              <p style="font-size: 16px; margin-bottom: 20px;">Din verifieringskod är:</p>
              <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 2px solid #667eea;">
                <h1 style="font-size: 36px; letter-spacing: 12px; margin: 0; color: #667eea; font-weight: bold;">${otp}</h1>
              </div>
              <p style="font-size: 14px; color: #666; margin-top: 20px;">
                Ange denna kod på verifieringssidan för att aktivera ditt konto.
              </p>
              <p style="font-size: 12px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                Koden är giltig i 10 minuter.<br>
                Om du inte begärde detta, kan du ignorera detta meddelande.
              </p>
            </div>
          </body>
        </html>
      `

      const textContent = `Verifiera din e-post\n\nDin verifieringskod är: ${otp}\n\nAnge denna kod på verifieringssidan för att aktivera ditt konto.\n\nKoden är giltig i 10 minuter.\n\nOm du inte begärde detta, kan du ignorera detta meddelande.`

      // Send email via SES
      const command = new SendEmailCommand({
        Source: fromEmail,
        Destination: {
          ToAddresses: [email],
        },
        Message: {
          Subject: {
            Data: 'Verifiera din e-post',
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: htmlContent,
              Charset: 'UTF-8',
            },
            Text: {
              Data: textContent,
              Charset: 'UTF-8',
            },
          },
        },
      })

      await sesClient.send(command)
      return Promise.resolve()
    } catch (error: any) {
      console.error('❌ Error sending email via AWS SES:', {
        error: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack,
        email,
        fromEmail: process.env.SES_FROM_EMAIL || process.env.AWS_SES_FROM_EMAIL || 'NOT SET',
        region: process.env.SES_REGION || process.env.AWS_SES_REGION || 'NOT SET',
      })
      
      // In development, allow continuing even if email fails
      if (process.env.NETLIFY_DEV || process.env.NODE_ENV !== 'production') {
        return Promise.resolve()
      }
      
      // In production, throw error
      throw new Error(`Failed to send verification email: ${error.message || 'Unknown error'}`)
    }
  },
})

// Cache for auth instances per origin (to avoid recreating on every request)
const authCache = new Map<string, ReturnType<typeof betterAuth>>()

// Function to get or create auth instance for a specific origin
function getAuthForOrigin(origin: string) {
  // Normalize origin
  const normalizedOrigin = origin.trim().replace(/\/$/, '')
  
  // Check cache first
  if (authCache.has(normalizedOrigin)) {
    return authCache.get(normalizedOrigin)!
  }
  
  // Determine baseURL based on origin
  let baseURL: string
  if (normalizedOrigin.startsWith('http://localhost:') || normalizedOrigin.startsWith('https://localhost:')) {
    // Use localhost origin for local development
    baseURL = normalizedOrigin
  } else {
    // Use environment variable or fallback for production
    baseURL = process.env.BETTER_AUTH_URL?.trim().replace(/\/$/, '') || normalizedOrigin
  }
  
  // Create auth instance with this baseURL
  const auth = betterAuth({
    baseURL: baseURL,
    basePath: basePath,
    secret: process.env.BETTER_AUTH_SECRET || process.env.SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    plugins: [emailOTPPlugin],
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    trustedOrigins: [
      'http://localhost:5173',
      'https://main.d3jub8c52hgrc6.amplifyapp.com',
    ],
    advanced: {
      cookiePrefix: '',
      generateId: undefined,
      useSecureCookies: true,
      sameSite: 'none' as const,
    },
  })
  
  // Cache it
  authCache.set(normalizedOrigin, auth)
  
  return auth
}

// Default auth instance (for backward compatibility)
const defaultBaseURL = getBaseURL()
export const auth = betterAuth({
  baseURL: defaultBaseURL,
  basePath: basePath,
  secret: process.env.BETTER_AUTH_SECRET || process.env.SECRET,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  plugins: [emailOTPPlugin],
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  trustedOrigins: [
    'http://localhost:5173',
    'https://main.d3jub8c52hgrc6.amplifyapp.com',
  ],
  advanced: {
    cookiePrefix: '',
    generateId: undefined,
    useSecureCookies: true,
    sameSite: 'none' as const,
  },
})


// Export function to get auth for a specific origin
export function getAuth(origin?: string) {
  if (!origin) {
    return auth
  }
  return getAuthForOrigin(origin)
}

// Export function to get OTP code by email (for development)
export function getOTPCode(email: string): string | undefined {
  return otpCodeStore.get(email)?.code
}

// Export function to manually update emailVerified status
export async function updateEmailVerified(email: string, verified: boolean) {
  try {
    const user = await db.query.user.findFirst({
      where: (user, { eq }) => eq(user.email, email),
    })
    
    if (user) {
      await db.update(schema.user)
        .set({ emailVerified: verified, updatedAt: new Date() })
        .where(eq(schema.user.id, user.id))
      return true
    }
    return false
  } catch (error) {
    console.error('Error updating emailVerified:', error)
    throw error
  }
}

