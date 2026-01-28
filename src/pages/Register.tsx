import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'

export default function Register() {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
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

      // Store email for verification page
      localStorage.setItem('pending_verification_email', email.trim().toLowerCase())
      
      // Navigate to email verification page
      navigate('/verify-email')
    } catch (error: any) {
      console.error('Registration error:', error)
      
      const errorMessage = error.message || ''
      const errorCode = error.code || ''
      
      // Check for Better Auth error codes
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Registrera dig</CardTitle>
          <CardDescription>Skapa ditt konto för att börja rapportera timmar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Förnamn</Label>
              <Input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ditt förnamn"
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
                placeholder="Ditt efternamn"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-post</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="din.epost@exempel.com"
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
