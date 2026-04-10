import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { AuthPageShell, AuthCard, authInputClassName } from '@/components/auth/AuthLayout'
import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

export default function VerifyEmail() {
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState(600) // 10 minutes in seconds
  const { verifyEmail, resendVerificationCode } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    // Get email from localStorage (set during registration)
    const pendingEmail = localStorage.getItem('pending_verification_email')
    if (pendingEmail) {
      setEmail(pendingEmail)
      
      // Get registration timestamp from localStorage
      const registrationTime = localStorage.getItem('registration_timestamp')
      const now = Date.now()
      const tenMinutes = 10 * 60 * 1000 // 10 minutes in milliseconds
      
      if (registrationTime) {
        const elapsed = now - parseInt(registrationTime, 10)
        const remaining = Math.max(0, tenMinutes - elapsed)
        setTimeLeft(Math.floor(remaining / 1000))
      } else {
        // If no timestamp, set it now and start from 10 minutes
        localStorage.setItem('registration_timestamp', now.toString())
        setTimeLeft(600)
      }
    } else {
      // If no pending email, redirect to register
      navigate('/register')
    }
  }, [navigate])

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) {
      // Time's up - Cognito handles unverified users automatically
      // Just clear local storage and redirect
      localStorage.removeItem('pending_verification_email')
      localStorage.removeItem('registration_timestamp')
      toast({
        title: 'Tiden gick ut',
        description: 'Din verifieringstid har gått ut. Du kan registrera igen.',
        variant: 'destructive',
      })
      navigate('/register')
      return
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, email, navigate, toast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await verifyEmail(code, email)
      
      toast({
        title: 'E-post verifierad!',
        description: 'Ditt konto är nu aktiverat',
      })
      
      // Clear pending email and timestamp immediately after successful verification
      localStorage.removeItem('pending_verification_email')
      localStorage.removeItem('registration_timestamp')
      
      // Session will be updated automatically by Cognito
      navigate('/report')
    } catch (error: any) {
      console.error('Verification error:', error)
      toast({
        title: 'Verifiering misslyckades',
        description: error.message || 'Ogiltig verifieringskod. Försök igen.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    setIsLoading(true)
    try {
      await resendVerificationCode(email)
      toast({
        title: 'Kod skickad',
        description: 'En ny verifieringskod har skickats till din e-post',
      })
    } catch (error: any) {
      console.error('Resend error:', error)
      toast({
        title: 'Kunde inte skicka kod',
        description: error.message || 'Ett fel uppstod. Försök igen om en stund.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (!email) {
    return (
      <AuthPageShell>
        <div className="text-center">
          <LoadingSpinner size="lg" variant="neutral" />
          <p className="mt-4 text-sm text-stone-600">Laddar...</p>
        </div>
      </AuthPageShell>
    )
  }

  return (
    <AuthPageShell>
      <AuthCard className="w-full">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-2xl font-semibold tracking-tight text-stone-900">
            Verifiera din e-post
          </CardTitle>
          <CardDescription className="text-base text-stone-500">
            Vi har skickat en verifieringskod till din e-post. Ange koden nedan.
          </CardDescription>
          {timeLeft > 0 && (
            <div className="mt-3 text-sm">
              <span className="text-stone-500">Tid kvar: </span>
              <span className={`font-semibold ${timeLeft <= 30 ? 'text-red-600' : 'text-orange-600'}`}>
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
              {timeLeft <= 30 && (
                <span className="mt-1 block text-xs text-red-600">
                  Du har {timeLeft} sekunder kvar innan kontot raderas
                </span>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code" className="text-stone-700">
                Verifieringskod
              </Label>
              <Input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
                disabled={isLoading}
                maxLength={6}
                autoFocus
                className={cn(
                  'text-center font-mono text-2xl tracking-widest',
                  authInputClassName
                )}
              />
              <p className="text-xs text-stone-500">
                Ange den 6-siffriga koden som skickades till din e-post.
              </p>
            </div>
            <Button
              type="submit"
              className="w-full bg-stone-900 font-semibold text-white hover:bg-stone-800"
              disabled={isLoading}
            >
              {isLoading ? 'Verifierar...' : 'Verifiera'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <p className="mb-2 text-stone-500">Har du inte fått koden?</p>
            <button
              type="button"
              onClick={handleResend}
              className="font-medium text-stone-900 underline-offset-4 hover:underline"
              disabled={isLoading}
            >
              Skicka ny kod
            </button>
            <div className="mt-3 flex items-center justify-center gap-3 text-xs">
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
  )
}
