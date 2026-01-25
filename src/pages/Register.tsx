import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignUp } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'

export default function Register() {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [personnummer, setPersonnummer] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { signUp } = useSignUp()
  const navigate = useNavigate()
  const { toast } = useToast()

  const handlePersonnummerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '')
    if (value.length <= 12) {
      setPersonnummer(value)
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

      if (!signUp) {
        throw new Error('SignUp är inte tillgänglig. Försök igen.')
      }

      // Normalize email to lowercase before creating in Clerk (Clerk stores emails in lowercase)
      const normalizedEmail = email.trim().toLowerCase()
      
      await signUp.create({
        emailAddress: normalizedEmail,
        password,
        firstName,
        lastName,
      })

      // Get the user ID from Clerk signUp object
      // In Clerk v5, the signUp object has an 'id' property after creation
      const clerkUserId = signUp.id
      
      if (!clerkUserId) {
        console.error('Clerk signUp object:', signUp)
        throw new Error('Kunde inte hämta användar-ID från Clerk. Försök igen.')
      }

      // Get the actual email from Clerk (it might have been normalized)
      const clerkEmail = signUp.emailAddress || normalizedEmail
      console.log('Email stored in Clerk:', clerkEmail, 'Original email:', email)

      // Create user in database - use the email from Clerk to ensure exact match
      const userData = {
        email: clerkEmail, // Use Clerk's normalized email
        firstName,
        lastName,
        personnummer: fullPersonnummer,
        clerkUserId,
      }

      console.log('Sending user data:', { ...userData, personnummer: '***' }) // Log without sensitive data

      await apiRequest('/create-user', {
        method: 'POST',
        body: JSON.stringify(userData),
      })

      // Don't prepare email verification here - let VerifyEmail page handle it
      // This avoids the strategy parameter issue in Clerk v5
      // The verify page will prepare verification when the user arrives

      toast({
        title: 'Registrering lyckades',
        description: 'Du kommer att få en verifieringslänk via e-post',
      })

      // Navigate to email verification page
      navigate('/verify-email')
    } catch (error: any) {
      console.error('Registration error:', error)
      
      // Handle specific error codes from API
      const errorMessage = error.message || ''
      const errorCode = error.code || ''
      
      if (errorCode === 'PERSONNUMMER_EXISTS' || errorMessage.includes('personnummer') || errorMessage.includes('redan registrerat')) {
        toast({
          title: 'Personnummer redan registrerat',
          description: 'Detta personnummer är redan kopplat till ett konto. Logga in istället eller kontakta support.',
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Registrera dig</CardTitle>
          <CardDescription>
            Skapa ett konto för att börja rapportera timmar
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
              <Label htmlFor="firstName">Förnamn</Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Förnamn"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Efternamn</Label>
              <Input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Efternamn"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personnummer">Personnummer</Label>
              <Input
                id="personnummer"
                type="text"
                inputMode="numeric"
                value={personnummer}
                onChange={handlePersonnummerChange}
                placeholder="199001011234"
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
                placeholder="Minst 8 tecken"
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Registrerar...' : 'Registrera'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

