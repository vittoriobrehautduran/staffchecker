import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import { signIn as cognitoSignIn, signUp as cognitoSignUp, signOut as cognitoSignOut, getCurrentUser, fetchAuthSession, confirmSignUp, resendSignUpCode, updatePassword } from 'aws-amplify/auth'
import '@/lib/cognito-config'

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
        }

        setUser(userData)
        
        // Store access token in localStorage for API calls
        if (session.tokens.accessToken) {
          localStorage.setItem('cognito-access-token', session.tokens.accessToken.toString())
        }
      } else {
        setUser(null)
        localStorage.removeItem('cognito-access-token')
      }
    } catch (error: any) {
      // User not authenticated
      if (error.name === 'UserUnauthenticatedException') {
        setUser(null)
        localStorage.removeItem('cognito-access-token')
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
    fetchUser()

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
      localStorage.removeItem('cognito-access-token')
    } catch (error: any) {
      console.error('Sign out error:', error)
      // Clear local state even if sign out fails
      setUser(null)
      localStorage.removeItem('cognito-access-token')
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
