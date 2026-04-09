import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { signIn as cognitoSignIn, signUp as cognitoSignUp, signOut as cognitoSignOut, getCurrentUser, fetchAuthSession, confirmSignUp, resendSignUpCode, updatePassword, signInWithRedirect } from 'aws-amplify/auth'
import '@/lib/cognito-config'

interface User {
  id: string
  email: string
  name: string | null
  emailVerified: boolean
  isAdmin?: boolean
  /** Synced from DB (`users.ui_theme`); default dark when unset. */
  theme?: 'light' | 'dark'
}

type AuthNotice = {
  type: 'USER_NOT_REGISTERED'
  message: string
  createdAt: number
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
  signInWithOAuth: (provider: 'Google' | 'Facebook' | 'Apple') => Promise<void>
  verifyEmail: (code: string, email: string) => Promise<void>
  resendVerificationCode: (email: string) => Promise<string>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  patchUser: (partial: Partial<Pick<User, 'theme' | 'isAdmin'>>) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const isMountedRef = useRef(true)

  const patchUser = useCallback((partial: Partial<Pick<User, 'theme' | 'isAdmin'>>) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : null))
  }, [])

  const storeAuthNotice = (notice: AuthNotice) => {
    const serializedNotice = JSON.stringify(notice)
    try {
      sessionStorage.setItem('staffcheck_auth_notice', serializedNotice)
    } catch {
      // ignore sessionStorage errors
    }
    try {
      localStorage.setItem('staffcheck_auth_notice', serializedNotice)
    } catch {
      // ignore localStorage errors
    }
  }

  // Fetch current user and session
  const fetchUser = async () => {
    try {
      const currentUser = await getCurrentUser()
      const session = await fetchAuthSession()
      
      if (!isMountedRef.current) return

      if (currentUser && session.tokens) {
        // Extract user info from ID token
        const idToken = session.tokens.idToken
        const userAttributes = idToken?.payload as any

        const userData: User = {
          id: currentUser.userId,
          email: userAttributes?.email || currentUser.username,
          name: userAttributes?.name || `${userAttributes?.['given_name'] || ''} ${userAttributes?.['family_name'] || ''}`.trim() || null,
          emailVerified: userAttributes?.email_verified || false,
          isAdmin: false, // Will be fetched from API
        }

        // Store ID token in localStorage for API calls (has user attributes like email)
        if (session.tokens.idToken) {
          const token = typeof session.tokens.idToken === 'string'
            ? session.tokens.idToken
            : session.tokens.idToken.toString()
          localStorage.setItem('cognito-id-token', token)
        }

        // Must resolve app account (Google can sign in to Cognito without a row in `users`).
        try {
          const { apiRequest } = await import('@/services/api')
          const userInfo = await apiRequest<{ isAdmin: boolean; theme?: string }>('/get-user-info')
          const resolvedTheme: 'light' | 'dark' =
            userInfo?.theme === 'light' ? 'light' : 'dark'
          if (userInfo && typeof userInfo.isAdmin === 'boolean') {
            setUser({ ...userData, isAdmin: userInfo.isAdmin, theme: resolvedTheme })
          } else {
            setUser({ ...userData, theme: resolvedTheme })
          }
        } catch (apiError: any) {
          if (apiError?.code === 'USER_NOT_REGISTERED') {
            try {
              await cognitoSignOut()
            } catch {
              // ignore
            }
            setUser(null)
            localStorage.removeItem('cognito-id-token')
            storeAuthNotice({
              type: 'USER_NOT_REGISTERED',
              message:
                apiError?.message ||
                'Det finns inget konto kopplat till den här inloggningen.',
              createdAt: Date.now(),
            })
            if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
              window.location.replace('/login?authError=USER_NOT_REGISTERED')
            }
            return
          }
          console.log('Could not fetch user profile from backend:', apiError)
          setUser(userData)
        }
      } else {
        setUser(null)
        localStorage.removeItem('cognito-id-token')
      }
    } catch (error: any) {
      // User not authenticated - this is expected when no user is logged in
      if (
        error.name === 'UserUnauthenticatedException' ||
        error.name === 'UserUnAuthenticatedException' ||
        error.message?.includes('needs to be authenticated') ||
        error.message?.includes('User needs to be authenticated')
      ) {
        setUser(null)
        localStorage.removeItem('cognito-id-token')
        // Don't log this error - it's expected when user is not logged in
      } else {
        console.error('Error fetching user:', error)
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    
    // Check if we're returning from OAuth redirect
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const state = urlParams.get('state')
    
    if (code || state) {
      // User is returning from OAuth redirect
      // Amplify will automatically exchange the code for tokens
      // Wait a bit for Amplify to process, then fetch user
      setTimeout(() => {
        fetchUser().then(() => {
          // Clean up URL by removing OAuth parameters
          const newUrl = window.location.pathname
          window.history.replaceState({}, '', newUrl)
        })
      }, 500)
    } else {
      // Normal page load, fetch user immediately
    fetchUser()
    }

    // Listen for auth state changes
    const interval = setInterval(() => {
      if (isMountedRef.current) {
        fetchUser()
      }
    }, 60000) // Check every minute

    return () => {
      isMountedRef.current = false
      clearInterval(interval)
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      const { isSignedIn } = await cognitoSignIn({
        username: email.trim(),
        password,
      })

      if (isSignedIn) {
        await fetchUser()
      } else {
        throw new Error('Inloggning misslyckades')
      }
    } catch (error: any) {
      console.error('Sign in error:', error)
      
      let errorMessage = 'Inloggning misslyckades'
      if (error.name === 'NotAuthorizedException') {
        errorMessage = 'Felaktigt e-post eller lösenord'
      } else if (error.name === 'UserNotConfirmedException') {
        errorMessage = 'E-postadressen är inte verifierad. Kontrollera din e-post.'
      } else if (error.message) {
        errorMessage = error.message
      }
      
      throw new Error(errorMessage)
    }
  }

  const signUp = async (data: {
    email: string
    firstName: string
    lastName: string
    password: string
  }): Promise<void> => {
    try {
      await cognitoSignUp({
        username: data.email.trim(),
        password: data.password,
        options: {
          userAttributes: {
            email: data.email.trim(),
            given_name: data.firstName,
            family_name: data.lastName,
            name: `${data.firstName} ${data.lastName}`,
          },
        },
      })
    } catch (error: any) {
      console.error('Sign up error:', error)
      
      let errorMessage = 'Registrering misslyckades'
      if (error.name === 'UsernameExistsException') {
        errorMessage = 'E-postadressen är redan registrerad'
      } else if (error.message) {
        errorMessage = error.message
      }
      
      throw new Error(errorMessage)
    }
  }

  const signOut = async () => {
    try {
      await cognitoSignOut()
      setUser(null)
      localStorage.removeItem('cognito-id-token')
    } catch (error: any) {
      console.error('Sign out error:', error)
      // Clear local state even if sign out fails
      setUser(null)
      localStorage.removeItem('cognito-id-token')
    }
  }

  const signInWithOAuth = async (provider: 'Google' | 'Facebook' | 'Apple' = 'Google') => {
    const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN
    
    if (!cognitoDomain) {
      throw new Error('OAuth är inte konfigurerat. VITE_COGNITO_DOMAIN saknas i miljövariablerna.')
    }

    // Clean domain - remove https:// if present
    const cleanDomain = cognitoDomain.replace(/^https?:\/\//, '')
    
    console.log('Attempting OAuth sign in with:', {
      provider,
      domain: cleanDomain,
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
    })

    try {
      await signInWithRedirect({
        provider,
        customState: window.location.pathname, // Save current path to return after OAuth
        options: {
          // Force account chooser so users can switch Google account after a failed/unregistered attempt.
          prompt: provider === 'Google' ? 'SELECT_ACCOUNT' : undefined,
        },
      })
      // signInWithRedirect will redirect the page, so execution stops here
    } catch (error: any) {
      console.error('OAuth sign in error:', error)
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
      
      let errorMessage = `Inloggning med ${provider} misslyckades`
      if (error.message) {
        errorMessage = error.message
      } else if (error.name === 'InvalidParameterException') {
        errorMessage = 'OAuth-providern är inte konfigurerad i AWS Cognito'
      } else if (error.message?.includes('scope')) {
        errorMessage = 'OAuth-scopes är inte korrekt konfigurerade. Kontrollera AWS Cognito-inställningar.'
      }
      
      throw new Error(errorMessage)
    }
  }

  const verifyEmail = async (code: string, email: string) => {
    try {
      await confirmSignUp({
        username: email.trim(),
        confirmationCode: code,
      })
    } catch (error: any) {
      console.error('Email verification error:', error)
      
      let errorMessage = 'Verifiering misslyckades'
      if (error.name === 'CodeMismatchException') {
        errorMessage = 'Felaktig verifieringskod'
      } else if (error.name === 'ExpiredCodeException') {
        errorMessage = 'Verifieringskoden har gått ut. Begär en ny kod.'
      } else if (error.message) {
        errorMessage = error.message
      }
      
      throw new Error(errorMessage)
    }
  }

  const resendVerificationCode = async (email: string): Promise<string> => {
    try {
      await resendSignUpCode({
        username: email.trim(),
      })
      return 'Verifieringskod skickad'
    } catch (error: any) {
      console.error('Resend verification code error:', error)
      throw new Error(error.message || 'Kunde inte skicka verifieringskod')
    }
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await updatePassword({
        oldPassword: currentPassword,
        newPassword,
      })
    } catch (error: any) {
      console.error('Change password error:', error)
      
      let errorMessage = 'Lösenordsändring misslyckades'
      if (error.name === 'NotAuthorizedException') {
        errorMessage = 'Nuvarande lösenord är felaktigt'
      } else if (error.message) {
        errorMessage = error.message
      }
      
      throw new Error(errorMessage)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isSignedIn: !!user,
        signIn,
        signUp,
        signOut,
        signInWithOAuth,
        verifyEmail,
        resendVerificationCode,
        changePassword,
        patchUser,
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
