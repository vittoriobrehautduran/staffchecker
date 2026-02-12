// API Gateway base URL - set via VITE_API_BASE_URL environment variable
// Example: https://xxxxx.execute-api.region.amazonaws.com/prod
// Or custom domain: https://api.yourapp.com
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

// Get session token from localStorage or cookies
// This is needed for mobile Safari which blocks cross-origin cookies
function getSessionToken(): string | null {
  // First check localStorage (set after login)
  const storedToken = localStorage.getItem('better-auth-session-token')
  if (storedToken) {
    console.log('✅ Found session token in localStorage')
    return storedToken
  }
  
  // Fallback: try to extract from cookies (works on same-origin)
  const cookies = document.cookie.split(';')
  console.log('🔍 Checking cookies for session token. Available cookies:', cookies.length)
  
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    const cookieName = name?.substring(0, 50) || 'unnamed'
    console.log('🔍 Checking cookie:', cookieName)
    
    // Better Auth uses __Secure-better-auth.session_token or better-auth.session_token
    if (name && (name.includes('better-auth.session_token') || name.includes('session_token'))) {
      const token = decodeURIComponent(value)
      console.log('✅ Found session token in cookie:', cookieName, '- storing in localStorage')
      localStorage.setItem('better-auth-session-token', token)
      return token
    }
  }
  
  console.warn('⚠️ No session token found in localStorage or cookies')
  console.warn('⚠️ This will cause authentication to fail on mobile Safari')
  return null
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error(
      'VITE_API_BASE_URL är inte konfigurerad. Sätt denna miljövariabel till din API Gateway URL.'
    )
  }

  // Remove leading slash from endpoint if present, API_BASE_URL should include trailing slash or not
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  
  // Get session token for Authorization header (works better for cross-origin)
  const sessionToken = getSessionToken()
  
  // Build URL with query parameters as fallback (API Gateway REST API strips headers)
  let url = `${API_BASE_URL.replace(/\/$/, '')}/${cleanEndpoint}`
  
  // Add token as query parameter if we have it (workaround for API Gateway REST API header stripping)
  // This is less secure but necessary since headers don't pass through
  if (sessionToken) {
    const separator = url.includes('?') ? '&' : '?'
    url += `${separator}_token=${encodeURIComponent(sessionToken)}`
  }
  
  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  
  // Still try headers (might work on desktop with cookies)
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`
    headers['X-Auth-Token'] = sessionToken
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Still try cookies first (works on desktop)
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: 'Ett fel uppstod' 
      }))
      
      // If we have detailed error info, include it
      if (error.received) {
        const missing = Object.entries(error.received)
          .filter(([_, present]) => !present)
          .map(([field]) => field)
          .join(', ')
        throw new Error(`${error.message}. Saknade fält: ${missing}`)
      }
      
      throw new Error(error.message || `API-förfrågan misslyckades: ${response.statusText}`)
    }

    return response.json()
  } catch (error: any) {
    throw error
  }
}
