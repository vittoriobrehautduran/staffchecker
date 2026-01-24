import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignUp } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'

export default function VerifyEmail() {
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { signUp, setActive, isLoaded } = useSignUp()
  const navigate = useNavigate()
  const { toast } = useToast()

  if (!isLoaded) {
    return <div>Laddar...</div>
  }

  if (!signUp) {
    navigate('/register')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code,
      })

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        toast({
          title: 'E-post verifierad!',
          description: 'Ditt konto är nu aktiverat',
        })
        navigate('/dashboard')
      }
    } catch (error: any) {
      console.error('Verification error:', error)
      toast({
        title: 'Verifiering misslyckades',
        description: error.errors?.[0]?.message || 'Ogiltig verifieringskod. Försök igen.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      toast({
        title: 'Kod skickad',
        description: 'En ny verifieringskod har skickats till din e-post',
      })
    } catch (error: any) {
      toast({
        title: 'Kunde inte skicka kod',
        description: error.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verifiera din e-post</CardTitle>
          <CardDescription>
            Vi har skickat en verifieringskod till din e-post. Ange koden nedan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Verifieringskod</Label>
              <Input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="123456"
                required
                disabled={isLoading}
                maxLength={6}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Verifierar...' : 'Verifiera'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={handleResend}
              className="text-primary hover:underline font-medium"
              disabled={isLoading}
            >
              Skicka ny kod
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

