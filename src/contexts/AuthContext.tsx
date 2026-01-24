import { createContext, useContext, ReactNode } from 'react'
import { useUser, useAuth } from '@clerk/clerk-react'

interface AuthContextType {
  user: ReturnType<typeof useUser>['user']
  isLoaded: boolean
  isSignedIn: boolean
  userId: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser()
  const { isSignedIn, userId } = useAuth()

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoaded,
        isSignedIn: isSignedIn ?? false,
        userId: userId ?? null,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider')
  }
  return context
}

