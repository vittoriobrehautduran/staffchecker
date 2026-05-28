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

export type ConditionalGetResult<T> =
  | { unchanged: true; version: string }
  | { unchanged: false; data: T; version: string }

type ApiErrorBody = {
  message?: string
  code?: string
  received?: Record<string, boolean>
}

async function readApiError(response: Response): Promise<ApiErrorBody> {
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object') {
      return body as ApiErrorBody
    }
  } catch {
    // Response body was not JSON.
  }
  return { message: 'Ett fel uppstod' }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

function normalizeEtagHeader(value: string | null): string {
  if (!value) return ''
  return value.trim().replace(/^W\//, '').replace(/^"|"$/g, '')
}

export async function apiConditionalGet<T>(
  endpoint: string,
  ifNoneMatch?: string | null
): Promise<ConditionalGetResult<T>> {
  if (!API_BASE_URL) {
    throw new Error(
      'VITE_API_BASE_URL är inte konfigurerad. Sätt denna miljövariabel till din API Gateway URL.'
    )
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  const accessToken = await getAccessToken()
  let url = `${API_BASE_URL.replace(/\/$/, '')}/${cleanEndpoint}`

  if (accessToken) {
    const separator = url.includes('?') ? '&' : '?'
    url += `${separator}_token=${encodeURIComponent(accessToken)}`
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const etag = ifNoneMatch?.trim()
  if (etag) {
    headers['If-None-Match'] = `"${etag.replace(/^"|"$/g, '')}"`
  } else {
    const separator = url.includes('?') ? '&' : '?'
    url += `${separator}_ts=${Date.now()}`
  }

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers,
    credentials: 'omit',
  })

  if (!response.ok) {
    const error = await readApiError(response)
    throw new Error(error.message || `API-förfrågan misslyckades: ${response.statusText}`)
  }

  const data = await readJsonResponse<T & { unchanged?: boolean; version?: string }>(response)
  const headerVersion = normalizeEtagHeader(response.headers.get('ETag'))

  if (data?.unchanged === true) {
    return {
      unchanged: true,
      version: data.version || headerVersion || etag || '',
    }
  }

  return {
    unchanged: false,
    data: data as T,
    version: data.version || headerVersion || '',
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
  const requestMethod = (options.method || 'GET').toUpperCase()
  const isGetRequest = requestMethod === 'GET'
  
  // Add token as query parameter as fallback (for API Gateway REST API)
  if (accessToken) {
    const separator = url.includes('?') ? '&' : '?'
    url += `${separator}_token=${encodeURIComponent(accessToken)}`
  }

  // Add cache-busting query for GET requests.
  // get-report currently has max-age caching, which can show stale entries right after save.
  if (isGetRequest) {
    const separator = url.includes('?') ? '&' : '?'
    url += `${separator}_ts=${Date.now()}`
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
      cache: isGetRequest ? 'no-store' : options.cache,
      headers,
      credentials: 'omit', // Cognito uses tokens, not cookies
    })

    if (!response.ok) {
      const error = await readApiError(response)

      if (error.received) {
        const missing = Object.entries(error.received)
          .filter(([_, present]) => !present)
          .map(([field]) => field)
          .join(', ')
        throw new Error(`${error.message ?? 'Ett fel uppstod'}. Saknade fält: ${missing}`)
      }

      if (response.status === 403 && error.code === 'USER_NOT_REGISTERED') {
        const err = new Error(
          error.message || 'Det finns inget konto kopplat till den här inloggningen.'
        ) as Error & { code?: string }
        err.code = 'USER_NOT_REGISTERED'
        throw err
      }

      if (response.status === 401) {
        localStorage.removeItem('cognito-id-token')
        const { fetchAuthSession } = await import('aws-amplify/auth')
        const session = await fetchAuthSession()
        if (session.tokens?.idToken) {
          const newToken = typeof session.tokens.idToken === 'string'
            ? session.tokens.idToken
            : session.tokens.idToken.toString()
          localStorage.setItem('cognito-id-token', newToken)
          headers['Authorization'] = `Bearer ${newToken}`
          url = url.replace(/_token=[^&]*/, `_token=${encodeURIComponent(newToken)}`)
          const retryResponse = await fetch(url, { ...options, headers, credentials: 'omit' })
          if (retryResponse.ok) {
            return readJsonResponse<T>(retryResponse)
          }
        }
        throw new Error('Sessionen har gått ut. Logga in igen.')
      }

      throw new Error(error.message || `API-förfrågan misslyckades: ${response.statusText}`)
    }

    return readJsonResponse<T>(response)
  } catch (error: unknown) {
    throw error
  }
}
