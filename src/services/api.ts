// API Gateway base URL - set via VITE_API_BASE_URL environment variable
// Example: https://xxxxx.execute-api.region.amazonaws.com/prod
// Or custom domain: https://api.yourapp.com
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

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
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies (Better Auth uses cookies)
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
