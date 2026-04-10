import { sql } from './utils/database'

// Cognito Pre Sign-up trigger
// Goal: Allow email/password signups, but block external provider (e.g. Google)
// signups unless the email already exists in our users table.
const LEGAL_VERSION = process.env.LEGAL_VERSION || '2026-04-10'

export const handler = async (event: any) => {
  const email = event.request?.userAttributes?.email
  const firstName = event.request?.userAttributes?.given_name || ''
  const lastName = event.request?.userAttributes?.family_name || ''
  const triggerSource = event.triggerSource as string | undefined

  if (!email) {
    throw new Error('Email is required for sign up')
  }

  const normalizedEmail = email.toLowerCase().trim()

  // Allow normal email/password signups from our own registration page
  if (triggerSource === 'PreSignUp_SignUp') {
    const normalizedFirstName = String(firstName).trim() || 'Okänd'
    const normalizedLastName = String(lastName).trim() || 'Användare'

    // Save legal consent metadata in our own users table for GDPR accountability.
    // If the user already exists, keep the earliest acceptance timestamp.
    await sql`
      INSERT INTO users (name, last_name, email, legal_accepted_at, legal_version)
      VALUES (${normalizedFirstName}, ${normalizedLastName}, ${normalizedEmail}, NOW(), ${LEGAL_VERSION})
      ON CONFLICT (email)
      DO UPDATE SET
        legal_accepted_at = COALESCE(users.legal_accepted_at, EXCLUDED.legal_accepted_at),
        legal_version = EXCLUDED.legal_version,
        updated_at = CURRENT_TIMESTAMP
    `
    return event
  }

  // For external providers (e.g. Google), only allow if the email already exists
  if (triggerSource === 'PreSignUp_ExternalProvider') {
    const existingUsers = await sql`
      SELECT id
      FROM users
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `

    if (existingUsers.length > 0) {
      // Auto-confirm and auto-verify email for known users
      event.response.autoConfirmUser = true
      event.response.autoVerifyEmail = true
      return event
    }

    // Email not found in our users table → block sign up
    throw new Error('Sign up is not allowed for this account. Contact admin.')
  }

  // Default: block any unexpected trigger source
  throw new Error('Sign up is not permitted for this user pool')
}

