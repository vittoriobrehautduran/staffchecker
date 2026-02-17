// API Gateway base URL - set via VITE_API_BASE_URL environment variable
// Example: https://xxxxx.execute-api.region.amazonaws.com/prod
// Or custom domain: https://api.yourapp.com
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

// Get Cognito ID token from localStorage
// We use ID token instead of access token because it contains user attributes (email, name, etc.)
// which are needed for user creation in Lambda functions
async function getAccessToken(): Promise<string | null> {
  try {
    // Check localStorage first (set after login)
    const storedToken = localStorage.getItem('cognito-id-token')
    if (storedToken) {
      return storedToken
    }
    
    // Try to get fresh token from Amplify
    const { fetchAuthSession } = await import('aws-amplify/auth')
    const session = await fetchAuthSession()
    
    // Use ID token instead of access token - it has user attributes
    if (session.tokens?.idToken) {
      const token = typeof session.tokens.idToken === 'string' 
        ? session.tokens.idToken 
        : session.tokens.idToken.toString()
      localStorage.setItem('cognito-id-token', token)
      return token
    }
    
    return null
  } catch (error) {
    console.error('Error getting ID token:', error)
    return null
  }
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

  // Remove leading slash from endpoint if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  
  // Get Cognito access token for Authorization header
  const accessToken = await getAccessToken()
  
  // Build URL
  let url = `${API_BASE_URL.replace(/\/$/, '')}/${cleanEndpoint}`
  
  // Add token as query parameter as fallback (for API Gateway REST API)
  if (accessToken) {
    const separator = url.includes('?') ? '&' : '?'
    url += `${separator}_token=${encodeURIComponent(accessToken)}`
  }
  
  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  
  // Add Authorization header with Cognito access token
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'omit', // Cognito uses tokens, not cookies
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
      
      // Handle 401 Unauthorized - token might be expired
      if (response.status === 401) {
        // Clear stored token and try to refresh
        localStorage.removeItem('cognito-id-token')
        const { fetchAuthSession } = await import('aws-amplify/auth')
        const session = await fetchAuthSession()
        if (session.tokens?.idToken) {
          // Retry with new ID token
          const newToken = typeof session.tokens.idToken === 'string'
            ? session.tokens.idToken
            : session.tokens.idToken.toString()
          localStorage.setItem('cognito-id-token', newToken)
          headers['Authorization'] = `Bearer ${newToken}`
          url = url.replace(/_token=[^&]*/, `_token=${encodeURIComponent(newToken)}`)
          const retryResponse = await fetch(url, { ...options, headers, credentials: 'omit' })
          if (retryResponse.ok) {
            return retryResponse.json()
          }
        }
        throw new Error('Sessionen har gått ut. Logga in igen.')
      }
      
      throw new Error(error.message || `API-förfrågan misslyckades: ${response.statusText}`)
    }

    return response.json()
  } catch (error: any) {
    throw error
  }
}
