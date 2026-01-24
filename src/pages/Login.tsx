import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignIn } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'

export default function Login() {
  const [personnummer, setPersonnummer] = useState('')
  const [password, setPassword] = useState('')
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

      const userData = await apiRequest<{ email: string }>('/get-user-by-personnummer', {
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

      if (!signIn) {
        toast({
          title: 'Fel',
          description: 'SignIn är inte tillgänglig. Försök igen.',
          variant: 'destructive',
        })
        setIsLoading(false)
        return
      }

      const result = await signIn.create({
        identifier: userData.email,
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
        // Handle 2FA if needed
        toast({
          title: 'Tvåfaktorsautentisering krävs',
          description: 'Vänligen slutför tvåfaktorsautentisering',
        })
      } else if (result.status === 'needs_first_factor') {
        // User needs to verify email
        toast({
          title: 'E-post måste verifieras',
          description: 'Kontrollera din e-post för verifieringslänk',
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
      } else {
        toast({
          title: 'Inloggning misslyckades',
          description: errorMessage || 'Felaktigt personnummer eller lösenord',
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
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ditt lösenord"
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Loggar in...' : 'Logga in'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <span className="text-muted-foreground">Har du inget konto? </span>
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="text-primary hover:underline font-medium"
            >
              Registrera dig
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

