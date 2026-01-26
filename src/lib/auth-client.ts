import { createAuthClient } from 'better-auth/react'

// Better Auth requires an absolute URL
// In development with Netlify Dev, use localhost:8888
// In production, use the actual domain
function getBaseURL(): string {
  // Check if we have an explicit API base URL
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }

  // In development, Netlify Dev runs on port 8888
  if (import.meta.env.DEV) {
    return 'http://localhost:8888/.netlify/functions'
  }

  // In production, use the current origin
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/.netlify/functions`
  }

  // Fallback (shouldn't happen in browser)
  return '/.netlify/functions'
}

// Better Auth client configuration
// The baseURL should be the full URL to the auth endpoint
// Server uses: baseURL: http://localhost:8888, basePath: /.netlify/functions/auth
// Client should use the full path: http://localhost:8888/.netlify/functions/auth
// Better Auth client will append routes like /sign-up/email to this baseURL
function getAuthBaseURL(): string {
  const base = getBaseURL() // http://localhost:8888/.netlify/functions
  // Remove trailing slash if present, then add /auth
  // Ensure no double slashes anywhere
  const cleanBase = base.replace(/\/+$/, '') // Remove one or more trailing slashes
  const authPath = '/auth'
  // If base already ends with /auth, don't add it again
  if (cleanBase.endsWith(authPath)) {
    return cleanBase
  }
  return `${cleanBase}${authPath}`
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(), // http://localhost:8888/.netlify/functions/auth
  // Email OTP plugin methods are automatically available when the plugin is configured on the server
  // Note: Passkeys client plugin not available in current Better Auth version
})

