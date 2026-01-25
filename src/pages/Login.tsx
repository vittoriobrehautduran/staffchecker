import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignIn } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'
import { Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const [personnummer, setPersonnummer] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { signIn, setActive } = useSignIn()
  const navigate = useNavigate()
  const { toast } = useToast()

  const handlePersonnummerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    
    // Simply extract all digits from input (ignoring stars and other characters)
    const cleaned = inputValue.replace(/\D/g, '')
    
    // Allow up to 12 digits (for YYYYMMDDNNNN format)
    if (cleaned.length <= 12) {
      setPersonnummer(cleaned)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    let userData: { email: string } | null = null

    try {
      const fullPersonnummer = personnummer.replace(/\D/g, '')
      
      if (fullPersonnummer.length < 10) {
        toast({
          title: 'Fel',
          description: 'Personnummer måste vara minst 10 siffror',
          variant: 'destructive',
        })
        setIsLoading(false)
        return
      }

      userData = await apiRequest<{ email: string }>('/get-user-by-personnummer', {
        method: 'POST',
        body: JSON.stringify({ personnummer: fullPersonnummer }),
      })

      if (!userData.email) {
        toast({
          title: 'Fel',
          description: 'Användare hittades inte',
          variant: 'destructive',
        })
        setIsLoading(false)
        return
      }

      // Normalize email - Clerk stores emails in lowercase
      const emailFromDb = userData.email.trim()
      const emailLowercase = emailFromDb.toLowerCase()

      console.log('Email from database:', emailFromDb)
      console.log('Attempting login with email (lowercase):', emailLowercase, 'for personnummer:', fullPersonnummer)

      if (!signIn) {
        toast({
          title: 'Fel',
          description: 'SignIn är inte tillgänglig. Försök igen.',
          variant: 'destructive',
        })
        setIsLoading(false)
        return
      }

      // Clerk stores emails in lowercase, so always use lowercase
      const result = await signIn.create({
        identifier: emailLowercase,
        password,
      })

      if (result.status === 'complete') {
        if (!setActive) {
          toast({
            title: 'Fel',
            description: 'Kunde inte aktivera session. Försök igen.',
            variant: 'destructive',
          })
          setIsLoading(false)
          return
        }
        await setActive({ session: result.createdSessionId })
        toast({
          title: 'Välkommen!',
          description: 'Du är nu inloggad',
        })
        navigate('/dashboard')
      } else if (result.status === 'needs_second_factor') {
        // 2FA is required but should be disabled in Clerk Dashboard
        toast({
          title: 'Tvåfaktorsautentisering krävs',
          description: '2FA är aktiverat i Clerk. Gå till Clerk Dashboard och inaktivera 2FA under User & Authentication → Multi-factor',
          variant: 'destructive',
        })
        console.error('2FA is enabled in Clerk. Disable it in Dashboard: User & Authentication → Multi-factor')
      } else if (result.status === 'needs_first_factor') {
        // User needs to verify email
        toast({
          title: 'E-post måste verifieras',
          description: 'Kontrollera din e-post för verifieringskod och verifiera ditt konto först',
          variant: 'destructive',
        })
        navigate('/verify-email')
      } else {
        // Other statuses
        console.log('Sign in status:', result.status)
        toast({
          title: 'Inloggning misslyckades',
          description: `Status: ${result.status}. Kontrollera att ditt konto är verifierat.`,
          variant: 'destructive',
        })
      }
    } catch (error: any) {
      console.error('Login error:', error)
      
      // If error suggests account doesn't exist or needs verification
      const errorMessage = error.message || error.errors?.[0]?.message || ''
      
      if (errorMessage.includes("Couldn't find") || errorMessage.includes("not found")) {
        toast({
          title: 'Konto hittades inte',
          description: 'Kontrollera att din e-post är verifierad. Om du precis registrerade dig, kontrollera din e-post för verifieringskod.',
          variant: 'destructive',
        })
      } else if (errorMessage.includes("Password is incorrect") || errorMessage.includes("password") || errorMessage.includes("incorrect")) {
        // Password is wrong - provide helpful message
        toast({
          title: 'Lösenordet är felaktigt',
          description: 'Kontrollera att lösenordet är korrekt. Om du glömt ditt lösenord, använd "Glömt lösenord" funktionen i Clerk.',
          variant: 'destructive',
        })
      } else if (errorMessage.includes("Identifier is invalid") || errorMessage.includes("invalid") || errorMessage.includes("Identifier")) {
        // Identifier (email) is not recognized by Clerk
        const emailToShow = userData?.email || 'okänd'
        console.error('Email mismatch - Database has:', emailToShow, 'but Clerk doesn\'t recognize it')
        toast({
          title: 'E-postadressen känns inte igen',
          description: `E-postadressen "${emailToShow}" finns inte i Clerk. Kontrollera i Clerk Dashboard att användaren finns med rätt e-post. Om e-posten skiljer sig, registrera dig igen eller uppdatera i databasen.`,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Inloggning misslyckades',
          description: errorMessage || 'Felaktigt personnummer eller lösenord. Om du precis registrerade dig, verifiera din e-post först.',
          variant: 'destructive',
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Display: progressive masking - show first 8 digits, then show typed digits after 8, mask remaining
  // Example: 
  // - "20040402" (8 digits) -> "20040402"
  // - "200404021" (9 digits) -> "200404021***" (show 1 digit after 8, mask 3)
  // - "2004040212" (10 digits) -> "2004040212**" (show 2 digits, mask 2)
  // - "20040402123" (11 digits) -> "20040402123*" (show 3 digits, mask 1)
  // - "200404021234" (12 digits) -> "20040402****" (all 4 masked when complete)
  const getDisplayValue = () => {
    if (personnummer.length <= 8) {
      return personnummer
    }
    const first8 = personnummer.slice(0, 8)
    const after8 = personnummer.slice(8)
    
    // If we have all 12 digits, mask the last 4
    if (personnummer.length === 12) {
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
            Ange ditt personnummer och lösenord
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="personnummer">Personnummer</Label>
              <Input
                id="personnummer"
                type="text"
                inputMode="numeric"
                value={displayValue}
                onChange={handlePersonnummerChange}
                placeholder="200404021234"
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
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  disabled={isLoading}
                  aria-label={showPassword ? 'Dölj lösenord' : 'Visa lösenord'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Loggar in...' : 'Logga in'}
            </Button>
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
            <div>
              <span className="text-muted-foreground">Glömt lösenord? </span>
              <span className="text-sm text-muted-foreground">
                Kontakta support eller använd Clerk Dashboard för att återställa lösenordet.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

