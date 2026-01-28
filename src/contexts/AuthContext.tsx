import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { authClient } from '@/lib/auth-client'

interface User {
  id: string
  email: string
  name: string | null
  emailVerified: boolean
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isSignedIn: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (data: {
    email: string
    firstName: string
    lastName: string
    password: string
  }) => Promise<void>
  signOut: () => Promise<void>
  verifyEmail: (code: string, email: string) => Promise<void>
  resendVerificationCode: (email: string) => Promise<string>
  registerPasskey: () => Promise<void>
  signInWithPasskey: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch session on mount and when auth state changes
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const sessionData = await authClient.$fetch('/session', {
          method: 'GET',
        })
        // Better Auth $fetch wraps responses in {data, error}
        const userData = (sessionData as any)?.data
        if (userData && typeof userData === 'object' && 'user' in userData) {
          setUser(userData.user || null)
        } else if (userData && typeof userData === 'object' && 'email' in userData) {
          // Sometimes user data is returned directly
          setUser(userData || null)
        } else {
          setUser(null)
        }
      } catch (error) {
        console.error('Error fetching session:', error)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSession()

    // Set up a listener for auth state changes
    // Better Auth might have a way to listen to session changes
    // For now, we'll refetch periodically or on focus
    const interval = setInterval(fetchSession, 60000) // Check every minute
    const handleFocus = () => fetchSession()
    window.addEventListener('focus', handleFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    // Sign in with Better Auth using email and password
    const result = await authClient.signIn.email({
      email: email.trim(),
      password,
    })

    if (result.error) {
      throw new Error(result.error.message || 'Inloggning misslyckades')
    }

    // Wait a moment for cookies to be set
    await new Promise(resolve => setTimeout(resolve, 100))

    // Refresh session after login - try multiple times if needed
    let attempts = 0
    let userData = null
    
    while (attempts < 3 && !userData) {
      try {
        const sessionData = await authClient.$fetch('/session', {
          method: 'GET',
        })
        // Better Auth $fetch wraps responses in {data, error}
        const data = (sessionData as any)?.data
        if (data && typeof data === 'object') {
          if ('user' in data) {
            userData = data.user
          } else if ('email' in data) {
            userData = data
          }
        }
      } catch (error) {
        console.warn('Session fetch attempt', attempts + 1, 'failed:', error)
      }
      
      if (!userData && attempts < 2) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      attempts++
    }

    if (userData) {
      setUser(userData)
    } else {
      // If we can't get session, still set user from signIn result if available
      if (result.data?.user) {
        setUser(result.data.user)
      } else {
        throw new Error('Kunde inte hämta användarsession efter inloggning')
      }
    }
  }

  const signUp = async (data: {
    email: string
    firstName: string
    lastName: string
    password: string
  }) => {
    // First, sign up with Better Auth
    const result = await authClient.signUp.email({
      email: data.email,
      password: data.password,
      name: `${data.firstName} ${data.lastName}`,
    })

    // Check for errors from Better Auth
    if (result.error) {
      const errorMessage = result.error.message || result.error.code || 'Kunde inte skapa användare i Better Auth'
      throw new Error(errorMessage)
    }

    if (!result.data?.user?.id) {
      throw new Error('Kunde inte skapa användare i Better Auth')
    }

    // Then, create user record in our users table
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
    if (!API_BASE_URL) {
      throw new Error('VITE_API_BASE_URL är inte konfigurerad')
    }

    const createUserResponse = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/create-user-better-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        betterAuthUserId: result.data.user.id,
      }),
      credentials: 'include',
    })

    if (!createUserResponse.ok) {
      const error = await createUserResponse.json()
      throw new Error(error.message || 'Kunde inte skapa användare')
    }
  }

  const signOut = async () => {
    await authClient.signOut()
    setUser(null)
  }

  const verifyEmail = async (code: string, email: string) => {
    // Use Email OTP API endpoint to verify the 6-digit code
    const result = await authClient.$fetch('/email-otp/check-verification-otp', {
      method: 'POST',
      body: {
        email,
        otp: code,
        type: 'email-verification',
      },
    })
    
    console.log('Email OTP verification result:', result)
    
    if ((result as any)?.error) {
      throw new Error((result as any).error.message || 'Ogiltig verifieringskod')
    }
    
    // The handler will automatically update emailVerified in the database after successful OTP verification
    // Wait a moment for the database update to complete
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Refresh session after verification
    const sessionData = await authClient.$fetch('/session', {
      method: 'GET',
    })
    console.log('Session data after verification:', sessionData)
    
    // Better Auth $fetch wraps responses in {data, error}
    const userData = (sessionData as any)?.data
    if (userData && typeof userData === 'object' && 'user' in userData) {
      const user = userData.user
      console.log('User emailVerified status:', user?.emailVerified)
      setUser(user || null)
    } else if (userData && typeof userData === 'object' && 'email' in userData) {
      // Sometimes the user data is returned directly
      console.log('User emailVerified status:', userData?.emailVerified)
      setUser(userData || null)
    } else {
      setUser(null)
    }
  }

  const resendVerificationCode = async (email: string): Promise<string> => {
    // Use Email OTP API endpoint to send verification code
    const result = await authClient.$fetch('/email-otp/send-verification-otp', {
      method: 'POST',
      body: {
      email,
        type: 'email-verification',
      },
    })
    
    if ((result as any)?.error) {
      throw new Error((result as any).error.message || 'Kunde inte skicka verifieringskod')
    }
    
    // In development, the server includes the OTP code in the response
    // In production, the code is sent via email
    const code = (result as any)?.data?.code || (result as any)?.data?.otp || (result as any)?.code || ''
    if (code) {
      console.log('Verification code (for testing):', code)
    }
    return code
  }

  // Register passkey for biometric authentication
  // Note: Passkeys require Better Auth passkey plugin which may not be available in current version
  const registerPasskey = async () => {
    throw new Error('Biometrisk autentisering är inte tillgänglig i denna version. Uppdatera Better Auth för stöd.')
  }

  // Sign in with passkey (biometric)
  // Note: Passkeys require Better Auth passkey plugin which may not be available in current version
  const signInWithPasskey = async () => {
    throw new Error('Biometrisk inloggning är inte tillgänglig i denna version. Uppdatera Better Auth för stöd.')
  }

  return (
    <AuthContext.Provider
      value={{
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
              emailVerified: user.emailVerified || false,
            }
          : null,
        isLoading,
        isSignedIn: !!user,
        signIn,
        signUp,
        signOut,
        verifyEmail,
        resendVerificationCode,
        registerPasskey,
        signInWithPasskey,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
