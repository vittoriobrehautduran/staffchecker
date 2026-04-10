import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { Mail, User, Lock, UserPlus, Eye, EyeOff } from 'lucide-react'
import { LoadingSpinner, PremiumLoadingOverlay } from '@/components/ui/loading-spinner'
import { AuthPageShell, AuthCard, authInputClassName } from '@/components/auth/AuthLayout'
import { cn } from '@/lib/utils'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export default function Register() {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isValidatingToken, setIsValidatingToken] = useState(true)
  const [searchParams] = useSearchParams()
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Validate registration token on mount
  useEffect(() => {
    const validateToken = async () => {
      const token = searchParams.get('token')
      
      if (!token) {
        toast({
          title: 'Registrering inte tillgänglig',
          description: 'Du måste skanna QR-koden i personalrummet för att registrera dig.',
          variant: 'destructive',
        })
        navigate('/login')
        return
      }

      try {
        if (!API_BASE_URL) {
          throw new Error('API URL not configured')
        }

        // Simple GET without custom headers to avoid CORS preflight
        const response = await fetch(
          `${API_BASE_URL}/validate-registration-token?token=${encodeURIComponent(token)}`
        )

        if (!response.ok) {
          throw new Error('Token validation failed')
        }

        const data = await response.json()

        if (!data.valid) {
          toast({
            title: 'Ogiltig registreringslänk',
            description: 'Länken är ogiltig eller har gått ut. Skanna QR-koden igen i personalrummet.',
            variant: 'destructive',
          })
          navigate('/login')
          return
        }

        setIsValidatingToken(false)
      } catch (error) {
        console.error('Error validating token:', error)
        toast({
          title: 'Fel vid validering',
          description: 'Kunde inte verifiera registreringslänken. Försök igen.',
          variant: 'destructive',
        })
        navigate('/login')
      }
    }

    validateToken()
  }, [searchParams, navigate, toast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!hasAcceptedLegal) {
      toast({
        title: 'Acceptera villkoren',
        description: 'Du behöver acceptera användarvillkor och integritetspolicy för att registrera konto.',
        variant: 'destructive',
      })
      return
    }
    
    // Show loading immediately
    setIsLoading(true)

    try {
      // Small delay to show the loading animation
      await new Promise(resolve => setTimeout(resolve, 300))

      await signUp({
        email: email.trim(),
        firstName,
        lastName,
        password,
      })

      toast({
        title: 'Registrering lyckades',
        description: 'Du kommer att få en verifieringskod via e-post',
      })

      // Store email and registration timestamp for verification page
      localStorage.setItem('pending_verification_email', email.trim().toLowerCase())
      localStorage.setItem('registration_timestamp', Date.now().toString())
      
      // Navigate to email verification page
      navigate('/verify-email')
    } catch (error: any) {
      console.error('Registration error:', error)
      
      const errorMessage = error.message || ''
      const errorCode = error.code || ''
      
      // Check known registration error codes
      if (errorCode === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' || 
          errorMessage.includes('already exists') || 
          errorMessage.includes('User already exists')) {
        toast({
          title: 'E-postadressen är redan registrerad',
          description: 'Denna e-postadress är redan kopplad till ett konto. Logga in istället eller använd en annan e-postadress.',
          variant: 'destructive',
        })
      } else if (errorCode === 'EMAIL_EXISTS' || errorMessage.includes('e-post') || errorMessage.includes('email')) {
        toast({
          title: 'E-postadressen är redan registrerad',
          description: 'Denna e-postadress är redan kopplad till ett konto. Logga in istället.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Registrering misslyckades',
          description: errorMessage || 'Ett fel uppstod vid registrering',
          variant: 'destructive',
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Show loading while validating token
  if (isValidatingToken) {
    return (
      <AuthPageShell>
        <div className="text-center">
          <LoadingSpinner size="lg" variant="neutral" />
          <p className="mt-4 text-sm text-stone-600">Verifierar registreringslänk...</p>
        </div>
      </AuthPageShell>
    )
  }

  return (
    <>
      {isLoading && <PremiumLoadingOverlay message="Registrerar..." variant="neutral" />}
      <AuthPageShell>
      <AuthCard className="w-full">
        <CardHeader className="space-y-1 pb-6">
          <div className="mb-4 flex items-center justify-center">
            <div className="rounded-2xl bg-stone-100 p-3.5 ring-1 ring-stone-200/80">
              <UserPlus className="h-6 w-6 text-stone-700" />
            </div>
          </div>
          <CardTitle className="text-center text-3xl font-semibold tracking-tight text-stone-900">
            Skapa konto
          </CardTitle>
          <CardDescription className="text-center text-base text-stone-500">
            Börja rapportera dina timmar idag
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="firstName" className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <User className="h-4 w-4 text-stone-500" />
                  Förnamn
                </Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ditt förnamn"
                required
                disabled={isLoading}
                  className={cn('h-12', authInputClassName)}
              />
            </div>
            <div className="space-y-2">
                <Label htmlFor="lastName" className="flex items-center gap-2 text-sm font-medium text-stone-700">
                  <User className="h-4 w-4 text-stone-500" />
                  Efternamn
                </Label>
              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Ditt efternamn"
                required
                disabled={isLoading}
                  className={cn('h-12', authInputClassName)}
              />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <Mail className="h-4 w-4 text-stone-500" />
                E-post
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="din.epost@exempel.com"
                required
                disabled={isLoading}
                className={cn('h-12', authInputClassName)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <Lock className="h-4 w-4 text-stone-500" />
                Lösenord
              </Label>
              <div className="relative">
              <Input
                id="password"
                  type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minst 8 tecken"
                required
                disabled={isLoading}
                  className={cn('h-12 pl-4 pr-12', authInputClassName)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>
            <Button
              type="submit"
              className="h-12 w-full bg-stone-900 font-semibold text-white shadow-md transition-all hover:bg-stone-800 hover:shadow-lg"
              disabled={isLoading || !hasAcceptedLegal}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                  <span>Registrerar...</span>
                </div>
              ) : (
                'Registrera'
              )}
            </Button>

            <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-4 text-sm text-stone-700">
              <label className="flex items-start gap-5 sm:gap-6">
                <span className="flex shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white p-2 shadow-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5 cursor-pointer rounded border-stone-400 text-stone-900 accent-stone-900"
                    checked={hasAcceptedLegal}
                    onChange={(event) => setHasAcceptedLegal(event.target.checked)}
                    disabled={isLoading}
                    aria-label="Acceptera användarvillkor och integritetspolicy"
                  />
                </span>
                <span className="min-w-0 flex-1 pt-0.5 leading-relaxed">
                  Jag har läst och accepterar{' '}
                  <Link
                    to="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-stone-900 underline underline-offset-4 hover:text-stone-700"
                  >
                    användarvillkor
                  </Link>{' '}
                  samt{' '}
                  <Link
                    to="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-stone-900 underline underline-offset-4 hover:text-stone-700"
                  >
                    integritetspolicy
                  </Link>
                  .
                </span>
              </label>
            </div>
          </form>
          <div className="mt-6 space-y-2 text-center text-sm">
            <div>
              <span className="text-stone-500">Har du redan ett konto? </span>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="font-semibold text-stone-900 underline-offset-4 hover:underline"
              >
                Logga in
              </button>
            </div>
          </div>
        </CardContent>
      </AuthCard>

      </AuthPageShell>
    </>
  )
}
