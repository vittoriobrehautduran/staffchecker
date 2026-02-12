import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
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
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const isMountedRef = useRef(true)

  // Fetch session function - accessible throughout the component
  const fetchSession = async (isInitialLoad = false, retryCount = 0) => {
      const maxRetries = isInitialLoad ? 2 : 0

      try {
        // Add a delay on initial load to ensure cookies are available
        // Mobile Safari needs more time for cookies to be set
        if (isInitialLoad && retryCount === 0) {
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
          const delay = isMobile ? 500 : 200
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        
        // On mobile Safari, cookies aren't sent cross-origin, so send token as query parameter
        const existingToken = localStorage.getItem('better-auth-session-token')
        // Construct auth URL from environment variable (same as auth-client.ts)
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || ''
        const authBaseUrl = apiBaseUrl.endsWith('/auth') ? apiBaseUrl : `${apiBaseUrl.replace(/\/+$/, '')}/auth`
        const sessionUrl = existingToken 
          ? `${authBaseUrl}/session?_token=${encodeURIComponent(existingToken)}`
          : `${authBaseUrl}/session`
        
        const sessionResponse = await fetch(sessionUrl, {
          method: 'GET',
          credentials: 'include', // Still try cookies
          headers: existingToken ? {
            'Authorization': `Bearer ${existingToken}`,
            'X-Auth-Token': existingToken,
          } : {},
        })
        
        if (!sessionResponse.ok) {
          throw new Error(`Session fetch failed: ${sessionResponse.status}`)
        }
        
        const sessionData = await sessionResponse.json()
        
        if (!isMountedRef.current) return
        
        // Check for error in response
        if ((sessionData as any)?.error) {
          throw new Error((sessionData as any).error.message || 'Session check failed')
        }
        
        // Better Auth $fetch wraps responses in {data, error}
        // But sometimes it returns the data directly
        let userData = (sessionData as any)?.data || sessionData
        
        // Extract session token from session response (preferred - works even if cookies are HttpOnly)
        // Better Auth session response structure: {session: {id, userId, expiresAt, token}, user: {...}}
        // CRITICAL: We MUST store the full token (77 chars), NEVER the session ID (32 chars)
        const session = userData?.session || (sessionData as any)?.session || (sessionData as any)?.data?.session
        if (session?.token && session.token.length > 50) {
          // Only store if it's the full token (should be ~77 chars)
          localStorage.setItem('better-auth-session-token', session.token)
          console.log('✅ Stored FULL session token from session response, length:', session.token.length)
        } else if (session?.token && session.token.length === 32) {
          // This is a session ID, not the token - log warning but don't store it
          console.warn('⚠️ Session response contains session ID (32 chars) instead of token. Token not stored.')
        } else {
          // Last resort: try to extract from cookies (may not work on mobile Safari if HttpOnly)
          const cookies = document.cookie.split(';')
          console.log('🔍 Attempting to extract token from cookies. Available cookies:', cookies.length)
          for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=')
            const cookieName = name?.substring(0, 50) || 'unnamed'
            console.log('🔍 Cookie name:', cookieName, 'value length:', value?.length || 0)
            // Better Auth uses __Secure-better-auth.session_token or better-auth.session_token
            if (name && (name.includes('better-auth.session_token') || name.includes('session_token'))) {
              const token = decodeURIComponent(value)
              // Only store if it's the full token (should be ~77 chars)
              if (token.length > 50) {
                localStorage.setItem('better-auth-session-token', token)
                console.log('✅ Stored FULL session token from cookie, length:', token.length)
                break
              } else {
                console.warn('⚠️ Cookie contains session ID (32 chars) instead of token. Token not stored.')
              }
            }
          }
        }
        
        // Handle different response formats
        if (userData && typeof userData === 'object') {
          // Format 1: {user: {...}}
          if ('user' in userData && userData.user) {
            setUser(userData.user)
            if (isInitialLoad) setIsLoading(false)
            return // Success - exit early
          }
          // Format 2: User object directly with email/id
          if ('email' in userData && (userData.id || userData.email)) {
            setUser(userData)
            if (isInitialLoad) setIsLoading(false)
            return // Success - exit early
          }
          // Format 3: {data: {user: {...}}}
          if ('data' in userData && userData.data?.user) {
            setUser(userData.data.user)
            if (isInitialLoad) setIsLoading(false)
            return // Success - exit early
          }
        }
        
        // No user found
        if (isInitialLoad) {
          // Retry if we haven't exceeded max retries
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 500))
            return fetchSession(isInitialLoad, retryCount + 1)
          }
          // Only clear user after all retries failed
          setUser(null)
        }
      } catch (error: any) {
        console.error('Error fetching session:', error)
        
        // Retry on network errors during initial load
        if (isInitialLoad && retryCount < maxRetries) {
          const isNetworkError = error?.message?.includes('Failed to fetch') || 
                                 error?.message?.includes('NetworkError') ||
                                 !error?.response
          
          if (isNetworkError) {
            await new Promise(resolve => setTimeout(resolve, 500))
            return fetchSession(isInitialLoad, retryCount + 1)
          }
        }
        
        // On initial load, only clear user if it's a clear authentication error (not network)
        if (isInitialLoad && retryCount >= maxRetries) {
          const isNetworkError = error?.message?.includes('Failed to fetch') || 
                                 error?.message?.includes('NetworkError') ||
                                 !error?.response
          
          if (!isNetworkError) {
            // Clear user only on clear auth errors after all retries
        setUser(null)
          }
          // If it's a network error, keep existing user state (might be temporary)
        }
        // On subsequent checks, always keep existing user state
      } finally {
        // Always set loading to false after initial load attempt (and all retries)
        if (isInitialLoad && retryCount >= maxRetries) {
        setIsLoading(false)
      }
    }
    }

  // Fetch session on mount and when auth state changes
  useEffect(() => {
    isMountedRef.current = true
    let focusTimeout: NodeJS.Timeout | null = null

    // Initial session fetch - wait for it to complete before allowing navigation
    // On mobile Safari, add extra delay to ensure cookies are available after page load
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const initialDelay = isMobile ? 800 : 200
    
    setTimeout(() => {
      fetchSession(true).catch(() => {
        // Error already handled in fetchSession
        if (isMountedRef.current) {
          setIsLoading(false)
        }
      })
    }, initialDelay)

    // Set up a listener for auth state changes
    // Better Auth might have a way to listen to session changes
    // For now, we'll refetch periodically or on focus
    // On mobile, check more frequently to catch cookie issues
    const isMobileCheck = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const checkInterval = isMobileCheck ? 30000 : 60000 // Every 30s on mobile, 60s on desktop
    const interval = setInterval(() => {
      if (isMountedRef.current) {
        fetchSession(false)
      }
    }, checkInterval)
    
    // Debounce focus handler to avoid rapid successive calls
    // On mobile Safari, add extra delay after focus to ensure cookies are available
    const handleFocus = () => {
      if (focusTimeout) {
        clearTimeout(focusTimeout)
      }
      const focusDelay = isMobileCheck ? 500 : 300
      focusTimeout = setTimeout(() => {
        if (isMountedRef.current) {
          fetchSession(false)
        }
      }, focusDelay)
    }
    
    window.addEventListener('focus', handleFocus)

    return () => {
      isMountedRef.current = false
      clearInterval(interval)
      if (focusTimeout) {
        clearTimeout(focusTimeout)
      }
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    // Sign in with Better Auth using email and password
    let result
    try {
      result = await authClient.signIn.email({
        email: email.trim(),
        password,
      })
    } catch (networkError: any) {
      console.error('❌ Network error during signIn:', networkError)
      // Check if it's a CORS or network error
      if (networkError?.message?.includes('CORS') || networkError?.message?.includes('Failed to fetch')) {
        throw new Error('Nätverksfel: Kunde inte ansluta till servern. Kontrollera din internetanslutning.')
      }
      throw new Error(networkError?.message || 'Inloggning misslyckades: Nätverksfel')
    }

    if (result.error) {
      console.error('❌ Better Auth signIn error:', result.error)
      throw new Error(result.error.message || 'Inloggning misslyckades')
    }
    
    // Log the full result structure for debugging
    console.log('📥 SignIn result structure:', {
      hasData: !!(result as any)?.data,
      hasError: !!result.error,
      resultKeys: Object.keys(result || {}),
      dataKeys: Object.keys((result as any)?.data || {}),
    })

    // CRITICAL: Better Auth's signIn response includes a 'token' field directly!
    // Extract it immediately - this works on both desktop and mobile Safari
    // Response structure can be: { data: { token, user, redirect } } or { token, user, redirect }
    const signInData = (result as any)?.data || result
    console.log('📥 SignIn response structure:', {
      hasData: !!(result as any)?.data,
      signInDataKeys: Object.keys(signInData || {}),
      hasToken: !!signInData?.token,
      tokenLength: signInData?.token?.length,
      fullResultKeys: Object.keys(result || {}),
    })
    
    let sessionToken = null
    let userData = null
    
    // Try multiple ways to extract the token from signIn response
    // Better Auth can return token in different places depending on configuration
    if (signInData?.token && signInData.token.length > 50) {
      sessionToken = signInData.token
      console.log('✅ Found token in signInData.token')
    } else if ((result as any)?.token && (result as any).token.length > 50) {
      sessionToken = (result as any).token
      console.log('✅ Found token in result.token')
    } else if (signInData?.session?.token && signInData.session.token.length > 50) {
      sessionToken = signInData.session.token
      console.log('✅ Found token in signInData.session.token')
    }
    
    // If we found a token, store it immediately
    if (sessionToken) {
      localStorage.setItem('better-auth-session-token', sessionToken)
      console.log('✅ Stored FULL session token directly from signIn response, length:', sessionToken.length)
      userData = signInData?.user || (result as any)?.user || null
    } else {
      console.warn('⚠️ No token found in signIn response. Will try fallback methods.')
      console.warn('⚠️ This usually means mobile Safari blocked cookies and Better Auth returned a different response structure.')
    }
    
    // Wait a moment for cookies to be set after login (for Better Auth's internal state)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const cookieDelay = isMobile ? 500 : 100
    await new Promise(resolve => setTimeout(resolve, cookieDelay))

    // Fallback: If token not in signIn response, try Better Auth's $fetch
    // This works on desktop but may fail on mobile Safari due to cookie blocking
    if (!sessionToken) {
      try {
        const sessionData = await authClient.$fetch('/session', {
          method: 'GET',
        })
        
        const data = (sessionData as any)?.data || sessionData
        
        if (data && typeof data === 'object') {
          if ('user' in data) {
            userData = data.user
          } else if ('email' in data) {
            userData = data
          }
        }
        
        const session = data?.session || (sessionData as any)?.session
        
        if (session?.token && session.token.length > 50) {
          sessionToken = session.token
          localStorage.setItem('better-auth-session-token', sessionToken)
          console.log('✅ Stored FULL session token from Better Auth $fetch, length:', sessionToken.length)
        }
      } catch (error: any) {
        console.warn('⚠️ Better Auth $fetch failed (expected on mobile Safari):', error?.message)
      }
    }
    
    // Last resort: Try manual fetch to session endpoint
    // This should work if cookies are blocked but we have the token from signIn
    if (!sessionToken) {
      try {
        const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || ''
        const authBaseUrl = apiBaseUrl.endsWith('/auth') ? apiBaseUrl : `${apiBaseUrl.replace(/\/+$/, '')}/auth`
        const sessionUrl = `${authBaseUrl}/session`
        
        console.log(`📡 Last resort: Calling session endpoint: ${sessionUrl}`)
        
        const sessionResponse = await fetch(sessionUrl, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        console.log(`📡 Last resort response status: ${sessionResponse.status}`)
        
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json()
          const data = (sessionData as any)?.data || sessionData
          const session = data?.session || (sessionData as any)?.session
          
          if (session?.token && session.token.length > 50) {
            sessionToken = session.token
            localStorage.setItem('better-auth-session-token', sessionToken)
            console.log('✅ Stored FULL session token from last resort fetch, length:', sessionToken.length)
          }
        } else {
          const errorText = await sessionResponse.text()
          console.error(`❌ Last resort fetch failed: ${sessionResponse.status}`, errorText.substring(0, 200))
        }
      } catch (fallbackError: any) {
        console.error('❌ Last resort fetch error:', fallbackError?.message)
      }
    }
    
    // Last resort: Try extracting from cookies (won't work on mobile Safari if HttpOnly)
    if (!sessionToken) {
      const cookies = document.cookie.split(';')
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=')
        if (name && (name.includes('better-auth.session_token') || name.includes('session_token'))) {
          const token = decodeURIComponent(value)
          if (token.length > 50) {
            sessionToken = token
            localStorage.setItem('better-auth-session-token', sessionToken)
            console.log('✅ Stored FULL session token from cookie, length:', sessionToken.length)
            break
          }
        }
      }
    }
    
    // If we still don't have the full token, this is a critical error
    if (!sessionToken) {
      console.error('❌ CRITICAL: Could not retrieve full session token after login')
      console.error('This usually happens on mobile Safari when cookies are blocked')
      console.error('SignIn response structure:', JSON.stringify({
        resultKeys: Object.keys(result || {}),
        resultDataKeys: Object.keys((result as any)?.data || {}),
        hasToken: !!(result as any)?.data?.token || !!(result as any)?.token,
        tokenLength: (result as any)?.data?.token?.length || (result as any)?.token?.length,
      }, null, 2))
      
      // Try one more time to extract from result directly (in case structure is different)
      const directToken = (result as any)?.data?.token || (result as any)?.token
      if (directToken && directToken.length > 50) {
        sessionToken = directToken
        localStorage.setItem('better-auth-session-token', sessionToken)
        console.log('✅ Found token on final attempt, length:', sessionToken.length)
      } else {
        throw new Error('Kunde inte hämta sessions-token efter inloggning. Vänligen försök igen.')
      }
    }

    // Extract session token from cookies and store in localStorage for cross-origin requests
    // This is needed for mobile Safari which blocks cross-origin cookies
    // Try multiple times as cookies might take a moment to be set
    for (let i = 0; i < 5; i++) {
      const cookies = document.cookie.split(';')
      console.log(`🔍 Attempt ${i + 1}: Checking ${cookies.length} cookies for session token`)
      
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=')
        // Better Auth uses __Secure-better-auth.session_token or better-auth.session_token
        if (name && (name.includes('better-auth.session_token') || name.includes('session_token'))) {
          const token = decodeURIComponent(value)
          localStorage.setItem('better-auth-session-token', token)
          console.log('✅ Stored session token in localStorage after login from cookie:', name)
          break
        }
      }
      
      // If we found a token, break
      if (localStorage.getItem('better-auth-session-token')) {
        break
      }
      
      // Wait a bit before retrying
      if (i < 4) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
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
    // Before registering, check if there's an unverified account for this email
    // If it exists and is older than 2 minutes, delete it so user can register again
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
    if (API_BASE_URL) {
      try {
        // Try to delete unverified account (will fail silently if it doesn't exist or is verified)
        await fetch(`${API_BASE_URL.replace(/\/$/, '')}/delete-unverified-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ email: data.email.trim().toLowerCase() }),
        })
        // Don't wait or throw - just attempt cleanup, continue with registration
      } catch (error) {
        // Ignore errors - continue with registration attempt
      }
    }

    // First, sign up with Better Auth
    let result = await authClient.signUp.email({
      email: data.email,
      password: data.password,
      name: `${data.firstName} ${data.lastName}`,
    })

    // Check for errors from Better Auth
    if (result.error) {
      const errorMessage = result.error.message || result.error.code || 'Kunde inte skapa användare i Better Auth'
      const errorCode = result.error.code || ''
      
      // If user already exists, try to delete unverified account and retry once
      if (errorCode === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' || 
          errorMessage.includes('already exists') || 
          errorMessage.includes('User already exists')) {
        
        // Try to delete unverified account
        if (API_BASE_URL) {
          try {
            const deleteResponse = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/delete-unverified-user`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({ email: data.email.trim().toLowerCase() }),
            })
            
            const deleteResult = await deleteResponse.json()
            
            // If deletion was successful (or account was too new), retry registration
            if (deleteResponse.ok && (deleteResult.deleted || deleteResult.canDelete === false)) {
              // Wait a moment, then retry
              await new Promise(resolve => setTimeout(resolve, 500))
              
              const retryResult = await authClient.signUp.email({
                email: data.email,
                password: data.password,
                name: `${data.firstName} ${data.lastName}`,
              })
              
              if (retryResult.error) {
                // Still failed after retry - might be verified user
                throw new Error('E-postadressen är redan registrerad och verifierad. Logga in istället.')
              }
              
              // Retry succeeded - continue with the retry result
              result = retryResult
            } else {
              // Couldn't delete - probably verified user
              throw new Error('E-postadressen är redan registrerad. Logga in istället.')
            }
          } catch (deleteError) {
            // Deletion failed - probably verified user
            throw new Error('E-postadressen är redan registrerad. Logga in istället.')
          }
        } else {
          throw new Error(errorMessage)
        }
      } else {
        throw new Error(errorMessage)
      }
    }

    if (!result.data?.user?.id) {
      throw new Error('Kunde inte skapa användare i Better Auth')
    }

    // Then, create user record in our users table
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

    // Automatically send verification email after successful registration
    try {
      const emailToVerify = data.email.trim().toLowerCase()
      const sendCodeResult = await authClient.$fetch('/email-otp/send-verification-otp', {
        method: 'POST',
        body: {
          email: emailToVerify,
          type: 'email-verification',
        },
      })
      
      if ((sendCodeResult as any)?.error) {
        // Don't throw - registration was successful, user can resend code
      }
    } catch (error: any) {
      // Don't throw - registration was successful, user can resend code manually
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
    
    // Better Auth $fetch wraps responses in {data, error}
    const userData = (sessionData as any)?.data
    if (userData && typeof userData === 'object' && 'user' in userData) {
      const user = userData.user
      setUser(user || null)
    } else if (userData && typeof userData === 'object' && 'email' in userData) {
      // Sometimes the user data is returned directly
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
    return code
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      // Use Better Auth's built-in password change endpoint
      const result = await authClient.$fetch('/change-password', {
        method: 'POST',
        body: {
          currentPassword,
          newPassword,
        },
      })

      if ((result as any)?.error) {
        throw new Error((result as any).error.message || 'Kunde inte ändra lösenord')
      }
    } catch (error: any) {
      // Better Auth might return specific error messages
      if (error.message?.includes('current password') || error.message?.includes('nuvarande lösenord')) {
        throw new Error('Felaktigt nuvarande lösenord')
      }
      if (error.message?.includes('same') || error.message?.includes('samma')) {
        throw new Error('Nytt lösenord måste skilja sig från det nuvarande')
      }
      throw error
    }
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
        changePassword,
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
