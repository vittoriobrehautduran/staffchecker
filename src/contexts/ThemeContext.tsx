import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'staffcheck-theme'

type ThemeContextValue = {
  theme: ThemeMode
  setTheme: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
  } catch {
    // ignore
  }
  return 'dark'
}

function applyDomTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', mode === 'dark')
}

type ThemeProviderProps = {
  children: React.ReactNode
}

// Logged-in users: theme from DB via AuthContext + PUT on change. Guests: localStorage only.
export function ThemeProvider({ children }: ThemeProviderProps) {
  const { user, isSignedIn, isLoading, patchUser } = useAuth()
  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredTheme())

  useEffect(() => {
    if (isLoading) return

    if (!isSignedIn || !user) {
      const t = readStoredTheme()
      setThemeState(t)
      applyDomTheme(t)
      return
    }

    const t = user.theme === 'light' ? 'light' : 'dark'
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // ignore
    }
    applyDomTheme(t)
  }, [isLoading, isSignedIn, user, user?.theme])

  const setTheme = useCallback(
    (mode: ThemeMode) => {
      setThemeState(mode)
      applyDomTheme(mode)
      try {
        localStorage.setItem(STORAGE_KEY, mode)
      } catch {
        // ignore
      }

      if (!isSignedIn) return

      void (async () => {
        try {
          const { apiRequest } = await import('@/services/api')
          await apiRequest<{ theme: ThemeMode }>('/update-user-preferences', {
            method: 'PUT',
            body: JSON.stringify({ theme: mode }),
          })
          patchUser({ theme: mode })
        } catch (e) {
          console.error('Could not save theme to server:', e)
        }
      })()
    },
    [isSignedIn, patchUser]
  )

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
