import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSignUp } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'

export default function VerifyEmail() {
  const [isLoading, setIsLoading] = useState(false)
  const [verificationPrepared, setVerificationPrepared] = useState(false)
  const { signUp, setActive, isLoaded } = useSignUp()
  const navigate = useNavigate()
  const { toast } = useToast()

  // Prepare email verification when component mounts - use email_link strategy
  useEffect(() => {
    if (signUp && isLoaded && !verificationPrepared) {
      const prepareVerification = async () => {
        try {
          // Check if verification is already prepared
          const unverifiedFields = signUp.unverifiedFields || []
          if (unverifiedFields.includes('email_address')) {
            // Use email_link strategy for verification links
            const strategies = signUp.supportedFirstFactors || []
            const emailStrategy = strategies.find((f: any) => 
              f.strategy === 'email_link' || 
              (f.emailAddressId && signUp.emailAddresses?.[0]?.id === f.emailAddressId)
            )

            if (emailStrategy && emailStrategy.strategy === 'email_link') {
              await signUp.prepareEmailAddressVerification({
                strategy: 'email_link',
              })
              setVerificationPrepared(true)
            } else if (emailStrategy && emailStrategy.strategy) {
              await signUp.prepareEmailAddressVerification({
                strategy: emailStrategy.strategy as any,
              })
              setVerificationPrepared(true)
            } else {
              // Try email_link as default
              try {
                await signUp.prepareEmailAddressVerification({
                  strategy: 'email_link',
                })
                setVerificationPrepared(true)
              } catch {
                // Fallback: try without explicit strategy
                await signUp.prepareEmailAddressVerification()
                setVerificationPrepared(true)
              }
            }
          } else {
            // Email already verified or not needed
            setVerificationPrepared(true)
          }
        } catch (error: any) {
          console.warn('Could not prepare email verification:', error)
          // Check if it's a rate limit error
          if (error.status === 429 || error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
            toast({
              title: 'För många förfrågningar',
              description: 'Vänta en stund innan du försöker igen. Development-nycklar har begränsningar.',
              variant: 'destructive',
            })
          }
          // Don't show other errors to user - they can use resend button
        }
      }
      prepareVerification()
    }
  }, [signUp, isLoaded, verificationPrepared, toast])

  if (!isLoaded) {
    return <div>Laddar...</div>
  }

  if (!signUp) {
    navigate('/register')
    return null
  }

  const handleResend = async () => {
    setIsLoading(true)
    try {
      // Resend verification link using email_link strategy
      await signUp.prepareEmailAddressVerification({
        strategy: 'email_link',
      })
      setVerificationPrepared(true)
      toast({
        title: 'Verifieringslänk skickad',
        description: 'En ny verifieringslänk har skickats till din e-post',
      })
    } catch (error: any) {
      console.error('Resend error:', error)
      
      // Handle rate limit errors specifically
      if (error.status === 429 || error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
        toast({
          title: 'För många förfrågningar',
          description: 'Du har skickat för många e-postmeddelanden. Vänta några minuter innan du försöker igen. Development-nycklar har begränsningar.',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Kunde inte skicka länk',
          description: error.message || 'Ett fel uppstod. Försök igen om en stund.',
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
          <CardTitle>Verifiera din e-post</CardTitle>
          <CardDescription>
            Vi har skickat en verifieringslänk till din e-post. Klicka på länken i e-postmeddelandet för att verifiera ditt konto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-lg border p-4 bg-muted/50">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Steg för att verifiera:</strong>
              </p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Öppna din e-post</li>
                <li>Hitta e-postmeddelandet från oss</li>
                <li>Klicka på verifieringslänken i e-postmeddelandet</li>
                <li>Du kommer automatiskt att loggas in</li>
              </ol>
            </div>
            <div className="text-center text-sm">
              <p className="text-muted-foreground mb-2">
                Har du inte fått e-postmeddelandet?
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={handleResend}
                disabled={isLoading}
              >
                {isLoading ? 'Skickar...' : 'Skicka ny verifieringslänk'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

