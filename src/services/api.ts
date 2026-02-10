// API Gateway base URL - set via VITE_API_BASE_URL environment variable
// Example: https://xxxxx.execute-api.region.amazonaws.com/prod
// Or custom domain: https://api.yourapp.com
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

// Get auth token from cookies (Better Auth stores session in cookies)
// Extract session cookie value to use as token for API calls
function getAuthToken(): string | null {
  // First check localStorage for stored token
  const storedToken = localStorage.getItem('better-auth-session-token')
  if (storedToken) {
    return storedToken
  }
  
  // Better Auth stores session in cookies
  // Extract the session cookie value
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    // Better Auth uses cookie names like 'better-auth.session_token' or 'session_token'
    if (name && (name.includes('session') || name.includes('auth'))) {
      return decodeURIComponent(value)
    }
  }
  
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
  const url = `${API_BASE_URL.replace(/\/$/, '')}/${cleanEndpoint}`
  
  // Get auth token from localStorage
  const token = getAuthToken()
  
  // Build headers with Authorization token if available
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  
  // Add Authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'omit', // Don't use cookies, use token instead
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
