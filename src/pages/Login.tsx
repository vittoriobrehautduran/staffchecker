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
  const [identifier, setIdentifier] = useState('') // Can be personnummer or email
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

  // Detect if input is email or personnummer
  const isEmail = (value: string): boolean => {
    return value.includes('@') && value.includes('.')
  }

  const handleIdentifierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    
    // If it looks like an email, allow it as-is
    if (isEmail(inputValue)) {
      setIdentifier(inputValue)
      return
    }
    
    // Otherwise, treat as personnummer - extract digits only
    const cleaned = inputValue.replace(/\D/g, '')
    
    // Allow up to 12 digits (for YYYYMMDDNNNN format)
    if (cleaned.length <= 12) {
      setIdentifier(cleaned)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Validate input
      if (isEmail(identifier)) {
        // Email validation
        if (!identifier.includes('@') || !identifier.includes('.')) {
          toast({
            title: 'Fel',
            description: 'Ange en giltig e-postadress',
            variant: 'destructive',
          })
          setIsLoading(false)
          return
        }
      } else {
        // Personnummer validation
        const fullPersonnummer = identifier.replace(/\D/g, '')
      if (fullPersonnummer.length < 10) {
        toast({
          title: 'Fel',
          description: 'Personnummer måste vara minst 10 siffror',
          variant: 'destructive',
        })
        setIsLoading(false)
        return
        }
      }

      await signIn(identifier, password)
      
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
          description: 'Felaktigt personnummer/e-post eller lösenord',
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

  // Display: progressive masking for personnummer only
  const getDisplayValue = () => {
    // If it's an email, show as-is
    if (isEmail(identifier)) {
      return identifier
    }
    
    // For personnummer, apply progressive masking
    if (identifier.length <= 8) {
      return identifier
    }
    const first8 = identifier.slice(0, 8)
    const after8 = identifier.slice(8)
    
    // If we have all 12 digits, mask the last 4
    if (identifier.length === 12) {
      return first8 + '****'
    }
    
    // Otherwise show progressive: typed digits + mask remaining
    const remaining = 4 - after8.length
    return first8 + after8 + '*'.repeat(remaining)
  }
  
  const displayValue = getDisplayValue()

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Logga in</CardTitle>
          <CardDescription>
            Ange ditt personnummer eller e-post och lösenord
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Personnummer eller e-post</Label>
              <Input
                id="identifier"
                type="text"
                inputMode={isEmail(identifier) ? 'email' : 'numeric'}
                value={displayValue}
                onChange={handleIdentifierChange}
                placeholder="200404021234 eller din@epost.se"
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
