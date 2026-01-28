import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { Eye, EyeOff, Fingerprint } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasPasskeys, setHasPasskeys] = useState(false)
  const { signIn, signInWithPasskey } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Check if user has registered passkeys
  // Note: Disabled until Better Auth passkey plugin is available
  useEffect(() => {
    // Passkeys not available in current Better Auth version
    setHasPasskeys(false)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
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
      navigate('/dashboard')
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Logga in</CardTitle>
          <CardDescription>
            Ange din e-post och lösenord
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-post</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="din@epost.se"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Lösenord</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ditt lösenord"
                  required
                  disabled={isLoading}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Loggar in...' : 'Logga in'}
            </Button>
            
            {/* Biometric login option */}
            {hasPasskeys && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">eller</span>
                </div>
              </div>
            )}
            
            {hasPasskeys && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading}
                onClick={async () => {
                  try {
                    setIsLoading(true)
                    await signInWithPasskey()
                    toast({
                      title: 'Välkommen!',
                      description: 'Du är nu inloggad med biometrisk autentisering',
                    })
                    navigate('/dashboard')
                  } catch (error: any) {
                    toast({
                      title: 'Biometrisk inloggning misslyckades',
                      description: error.message || 'Ett fel uppstod',
                      variant: 'destructive',
                    })
                  } finally {
                    setIsLoading(false)
                  }
                }}
              >
                <Fingerprint className="mr-2 h-4 w-4" />
                Logga in med fingeravtryck/ansikte
              </Button>
            )}
          </form>
          <div className="mt-4 space-y-2 text-center text-sm">
            <div>
              <span className="text-muted-foreground">Har du inget konto? </span>
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="text-primary hover:underline font-medium"
              >
                Registrera dig
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
