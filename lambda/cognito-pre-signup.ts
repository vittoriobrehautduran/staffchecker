import { sql } from './utils/database'

// Cognito Pre Sign-up trigger
// Goal: Allow email/password signups, but block external provider (e.g. Google)
// signups unless the email already exists in our users table.
export const handler = async (event: any) => {
  const email = event.request?.userAttributes?.email
  const triggerSource = event.triggerSource as string | undefined

  if (!email) {
    throw new Error('Email is required for sign up')
  }

  const normalizedEmail = email.toLowerCase().trim()

  // Allow normal email/password signups from our own registration page
  if (triggerSource === 'PreSignUp_SignUp') {
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

