const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions'
const IS_DEV = import.meta.env.DEV

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  
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
      // If 404 in development, provide helpful error message
      if (response.status === 404 && IS_DEV) {
        throw new Error(
          'Netlify Functions är inte tillgängliga. För lokal utveckling, kör "npm run dev:netlify" istället för "npm run dev".'
        )
      }
      
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
    // If network error in development, provide helpful message
    if (IS_DEV && (error.message.includes('Failed to fetch') || error.message.includes('404'))) {
      throw new Error(
        'Netlify Functions är inte tillgängliga. För lokal utveckling, kör "npm run dev:netlify" istället för "npm run dev".'
      )
    }
    throw error
  }
}
