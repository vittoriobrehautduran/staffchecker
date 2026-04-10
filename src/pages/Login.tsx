import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'
import { LoadingSpinner, PremiumLoadingOverlay } from '@/components/ui/loading-spinner'
import { AuthPageShell, AuthCard, authInputClassName } from '@/components/auth/AuthLayout'
import { cn } from '@/lib/utils'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isOAuthLoading, setIsOAuthLoading] = useState<string | null>(null)
  const [oauthNotRegistered, setOauthNotRegistered] = useState<{ message: string } | null>(null)
  const { signIn, signInWithOAuth } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    const noticeMaxAgeMs = 2 * 60 * 1000
    const parseAndUseNotice = (raw: string | null): boolean => {
      if (!raw) return false
      try {
        const parsed = JSON.parse(raw) as { type?: string; message?: string; createdAt?: number }
        const createdAt = parsed.createdAt || 0
        const isFresh = createdAt > 0 && Date.now() - createdAt <= noticeMaxAgeMs
        if (parsed.type === 'USER_NOT_REGISTERED' && parsed.message && isFresh) {
          setOauthNotRegistered({ message: parsed.message })
          return true
        }
      } catch {
        return false
      }
      return false
    }

    try {
      const urlParams = new URLSearchParams(window.location.search)
      const authError = urlParams.get('authError')
      if (authError === 'USER_NOT_REGISTERED') {
        setOauthNotRegistered({
          message:
            'E-postadressen du använde med Google är inte registrerad hos oss. Registrera dig först med samma e-postadress, eller logga in med e-post och lösenord om du redan har ett konto.',
        })
      }

      const sessionNotice = sessionStorage.getItem('staffcheck_auth_notice')
      const localNotice = localStorage.getItem('staffcheck_auth_notice')
      const usedStoredNotice = parseAndUseNotice(sessionNotice) || parseAndUseNotice(localNotice)

      if (usedStoredNotice || authError === 'USER_NOT_REGISTERED') {
        // Keep the notice visible for this page load but clean storage to avoid stale repeats later.
        sessionStorage.removeItem('staffcheck_auth_notice')
        localStorage.removeItem('staffcheck_auth_notice')
      }
    } catch {
      // ignore storage/query parsing issues
    }
  }, [])

  const handleOAuthClick = async () => {
    setIsOAuthLoading('Google')
    try {
      await signInWithOAuth('Google')
      // signInWithRedirect will redirect the page, so we don't need to do anything else
    } catch (error: any) {
      console.error('OAuth Google error:', error)
      toast({
        title: 'OAuth-inloggning misslyckades',
        description: error.message || 'Kunde inte logga in med Google. Kontrollera att OAuth är konfigurerat i AWS Cognito.',
        variant: 'destructive',
      })
      setIsOAuthLoading(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Show loading immediately
    setIsLoading(true)

    try {
      // Small delay to show the loading animation
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Validate email
      if (!email.includes('@') || !email.includes('.')) {
          toast({
            title: 'Fel',
            description: 'Ange en giltig e-postadress',
            variant: 'destructive',
          })
          setIsLoading(false)
          return
        }

      await signIn(email.trim(), password)
      
      toast({
        title: 'Välkommen!',
        description: 'Du är nu inloggad',
      })
      navigate('/report')
    } catch (error: any) {
      console.error('Login error:', error)
      
      const errorMessage = error.message || ''
      
      if (errorMessage.includes('EMAIL_NOT_VERIFIED') || errorMessage.includes('E-post måste verifieras')) {
        toast({
          title: 'E-post måste verifieras',
          description: 'Verifiera din e-post först innan du kan logga in',
          variant: 'destructive',
        })
        navigate('/verify-email')
      } else if (errorMessage.includes('Felaktigt') || errorMessage.includes('incorrect')) {
        toast({
          title: 'Inloggning misslyckades',
          description: 'Felaktigt e-post eller lösenord',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Inloggning misslyckades',
          description: errorMessage || 'Ett fel uppstod vid inloggning',
          variant: 'destructive',
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {isLoading && <PremiumLoadingOverlay message="Loggar in..." variant="neutral" />}
      <AuthPageShell>
      <AuthCard className="w-full">
        <CardHeader className="space-y-1 pb-6">
          <div className="mb-4 flex items-center justify-center">
            <div className="rounded-2xl bg-stone-100 p-3.5 ring-1 ring-stone-200/80">
              <Lock className="h-6 w-6 text-stone-700" />
            </div>
          </div>
          <CardTitle className="text-center text-3xl font-semibold tracking-tight text-stone-900">
            Välkommen tillbaka
          </CardTitle>
          <CardDescription className="text-center text-base text-stone-500">
            Logga in för att fortsätta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {oauthNotRegistered && (
            <div
              className="space-y-3 rounded-xl border border-amber-200/90 bg-amber-50 p-4 text-sm text-amber-950"
              role="alert"
            >
              <p className="font-medium leading-relaxed">{oauthNotRegistered.message}</p>
              <Button
                asChild
                className="w-full bg-stone-900 text-white hover:bg-stone-800 sm:w-auto"
              >
                <Link to="/register">Skapa konto / registrera dig</Link>
              </Button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2 text-sm font-medium text-stone-700">
                <Mail className="h-4 w-4 text-stone-500" />
                E-post
              </Label>
              <div className="relative">
              <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="din@epost.se"
                required
                disabled={isLoading}
                  className={cn('h-12 pl-4 pr-4', authInputClassName)}
              />
              </div>
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
                  placeholder="Ditt lösenord"
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
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                  <span>Loggar in...</span>
                </div>
              ) : (
                'Logga in'
              )}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-stone-200" />
            </div>
            <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide text-stone-400">
              <span className="bg-white px-3">Eller fortsätt med</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-12 w-full border-stone-200 bg-white text-stone-700 shadow-sm hover:bg-stone-50"
            onClick={handleOAuthClick}
            disabled={isLoading || isOAuthLoading !== null}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Fortsätt med Google
          </Button>

          <div className="mt-6 space-y-2 text-center text-sm">
            <div>
              <span className="text-stone-500">För att registrera dig, skanna QR-koden i personalrummet.</span>
            </div>
            <div className="flex items-center justify-center gap-3 text-xs">
              <Link to="/privacy" className="text-stone-600 underline underline-offset-4 hover:text-stone-900">
                Integritetspolicy
              </Link>
              <span className="text-stone-300">|</span>
              <Link to="/terms" className="text-stone-600 underline underline-offset-4 hover:text-stone-900">
                Användarvillkor
              </Link>
            </div>
          </div>
        </CardContent>
      </AuthCard>

      </AuthPageShell>
    </>
  )
}
