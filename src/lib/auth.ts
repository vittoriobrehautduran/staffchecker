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
function getBaseURL(): string {
  // Check environment variable first (most reliable)
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

const baseURL = getBaseURL()
// API Gateway path to the auth Lambda function
// This should match your API Gateway route (e.g., /auth)
const basePath = '/auth'
console.log('Better Auth baseURL (frontend origin):', baseURL)
console.log('Better Auth basePath (API Gateway path):', basePath)
console.log('BETTER_AUTH_URL env var:', process.env.BETTER_AUTH_URL)

// In-memory store for OTP codes in development
// Keyed by email, stores the latest OTP code for that email
const otpCodeStore = new Map<string, { code: string, timestamp: number }>()

// Email OTP plugin configuration
// Sends 6-digit codes via email for verification
const emailOTPPlugin = emailOTP({
  sendVerificationOTP: async ({ email, otp, type }) => {
    // Store OTP code for retrieval in development
    otpCodeStore.set(email, { code: otp, timestamp: Date.now() })
    
    // Clean up old codes (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000
    for (const [storedEmail, data] of otpCodeStore.entries()) {
      if (data.timestamp < tenMinutesAgo) {
        otpCodeStore.delete(storedEmail)
      }
    }

    // In development, log to console
    if (process.env.NETLIFY_DEV || process.env.NODE_ENV !== 'production') {
      console.log('\n📧 EMAIL VERIFICATION CODE (Development)')
      console.log('═══════════════════════════════════════════════════')
      console.log(`Email: ${email}`)
      console.log(`Verification Code: ${otp}`)
      console.log(`Type: ${type}`)
      console.log('═══════════════════════════════════════════════════\n')
    }

    // Send email via Resend if API key is configured
    const resendApiKey = process.env.RESEND_API_KEY
    if (resendApiKey) {
      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@example.com',
            to: email,
            subject: 'Verifiera din e-post',
            html: `
              <h2>Verifiera din e-post</h2>
              <p>Din verifieringskod är:</p>
              <h1 style="font-size: 32px; letter-spacing: 8px; text-align: center; margin: 20px 0;">${otp}</h1>
              <p>Ange denna kod på verifieringssidan för att aktivera ditt konto.</p>
              <p>Koden är giltig i 10 minuter.</p>
              <p>Om du inte begärde detta, kan du ignorera detta meddelande.</p>
            `,
            text: `Din verifieringskod är: ${otp}\n\nAnge denna kod på verifieringssidan för att aktivera ditt konto.\n\nKoden är giltig i 10 minuter.`,
          }),
        })

        if (!resendResponse.ok) {
          const errorData = await resendResponse.text()
          console.error('Resend API error:', errorData)
          throw new Error(`Failed to send email: ${resendResponse.status}`)
        }

        const result = await resendResponse.json() as { id?: string }
        console.log('Email sent via Resend:', result.id)
        return Promise.resolve()
      } catch (error) {
        console.error('Error sending email via Resend:', error)
        // In development, still allow the flow to continue even if email fails
        if (process.env.NETLIFY_DEV || process.env.NODE_ENV !== 'production') {
          console.warn('Continuing in development mode despite email error')
          return Promise.resolve()
        }
        throw error
      }
    } else {
      // No Resend API key - in development, just log to console
      if (process.env.NETLIFY_DEV || process.env.NODE_ENV !== 'production') {
        console.warn('RESEND_API_KEY not set - email not sent. Check console for verification code.')
        return Promise.resolve()
      } else {
        throw new Error('RESEND_API_KEY environment variable is required for email verification in production')
      }
    }
  },
})

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
      console.log(`Updated emailVerified for ${email} to ${verified}`)
      return true
    }
    return false
  } catch (error) {
    console.error('Error updating emailVerified:', error)
    throw error
  }
}

// Better Auth configuration
// Use baseURL as origin only (frontend URL), and basePath separately (API Gateway path)
// This is the recommended approach for serverless environments
export const auth = betterAuth({
  baseURL: baseURL, // Frontend origin: https://yourapp.amplifyapp.com
  basePath: basePath, // API Gateway path: /auth
  secret: process.env.BETTER_AUTH_SECRET || process.env.SECRET, // Required for encryption and hashing
  database: drizzleAdapter(db, {
    provider: 'pg', // PostgreSQL provider
    schema, // Pass the schema to Better Auth's Drizzle adapter
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  // Email OTP plugin for 6-digit code verification
  // This replaces the standard token-based email verification
  // Note: Passkeys/WebAuthn support may require a newer version of Better Auth
  // or a separate package. For now, we'll keep the structure ready for when it's available.
  plugins: [emailOTPPlugin],
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day
  },
})

