/// <reference types="vite/client" />
import { createAuthClient } from 'better-auth/react'

// Better Auth requires an absolute URL to the auth endpoint
// This should point to your API Gateway URL with /auth path
// Example: https://xxxxx.execute-api.region.amazonaws.com/prod/auth
// Or custom domain: https://api.yourapp.com/auth
function getAuthBaseURL(): string {
  // Check if we have an explicit API base URL
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL
  
  if (apiBaseUrl) {
    const base = apiBaseUrl.trim()
    
    // Validate it's a proper URL
    if (!base.startsWith('http://') && !base.startsWith('https://')) {
      throw new Error(
        `VITE_API_BASE_URL måste vara en fullständig URL som börjar med http:// eller https://. ` +
        `Nuvarande värde: "${base}". ` +
        `Exempel: https://xxxxx.execute-api.region.amazonaws.com/prod`
      )
  }

    // Remove trailing slash if present
    const cleanBase = base.replace(/\/+$/, '')
    // Add /auth path if not already present
    if (cleanBase.endsWith('/auth')) {
      return cleanBase
    }
    return `${cleanBase}/auth`
  }

  // If VITE_API_BASE_URL is not set, log a warning and show helpful error
  console.error('❌ VITE_API_BASE_URL is not set!')
  console.error('This should be your API Gateway URL, e.g.:')
  console.error('  https://xxxxx.execute-api.region.amazonaws.com/prod')
  console.error('Or custom domain:')
  console.error('  https://api.yourapp.com')
  console.error('')
  console.error('Set this in:')
  console.error('  - Local: .env.local file')
  console.error('  - Amplify: Environment variables in Amplify Console')
  
  // Don't use fallback - throw error to make it obvious
  throw new Error(
    'VITE_API_BASE_URL måste vara satt för Better Auth att fungera. ' +
    'Sätt denna miljövariabel till din API Gateway URL (t.ex. https://xxxxx.execute-api.region.amazonaws.com/prod)'
  )
}

// Get the auth base URL
const authBaseURL = getAuthBaseURL()

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  // Email OTP plugin methods are automatically available when the plugin is configured on the server
  // Note: Passkeys client plugin not available in current Better Auth version
})

