import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Fingerprint, CheckCircle2, XCircle } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { registerPasskey } = useAuth()
  const { toast } = useToast()
  const [isRegistering, setIsRegistering] = useState(false)
  const [hasPasskeys, setHasPasskeys] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(false)

  useEffect(() => {
    // Check if WebAuthn is supported
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      setIsWebAuthnSupported(true)
      
      // Check if user has registered passkeys
      const checkPasskeys = async () => {
        try {
          setIsChecking(true)
          const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
          if (!API_BASE_URL) {
            setHasPasskeys(false)
            return
          }

          // We'll check by trying to get user's email and checking if they have passkeys
          // For now, we'll assume they don't have passkeys until they register one
          // After registration, we'll set hasPasskeys to true
          setHasPasskeys(false)
        } catch (error) {
          setHasPasskeys(false)
        } finally {
          setIsChecking(false)
        }
      }
      
      checkPasskeys()
    } else {
      setIsWebAuthnSupported(false)
      setIsChecking(false)
    }
  }, [open])

  const handleRegisterPasskey = async () => {
    try {
      setIsRegistering(true)
      await registerPasskey()
      toast({
        title: 'Biometrisk autentisering registrerad!',
        description: 'Du kan nu logga in med Face ID/Touch ID',
      })
      setHasPasskeys(true)
    } catch (error: any) {
      toast({
        title: 'Kunde inte registrera',
        description: error.message || 'Ett fel uppstod vid registrering',
        variant: 'destructive',
      })
    } finally {
      setIsRegistering(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inställningar</DialogTitle>
          <DialogDescription>
            Hantera dina kontoinställningar och säkerhet
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Biometric Authentication Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Fingerprint className="h-5 w-5 text-blue-600" />
              <div>
                <h3 className="font-semibold">Biometrisk autentisering</h3>
                <p className="text-sm text-muted-foreground">
                  Logga in med Face ID, Touch ID eller Windows Hello
                </p>
              </div>
            </div>

            {!isWebAuthnSupported ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <XCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Din webbläsare eller enhet stöder inte biometrisk autentisering
                </p>
              </div>
            ) : hasPasskeys ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Biometrisk autentisering är aktiverad
                  </p>
                </div>
                <Button
                  onClick={handleRegisterPasskey}
                  disabled={isRegistering}
                  variant="outline"
                  className="w-full"
                >
                  {isRegistering ? 'Registrerar...' : 'Registrera ny enhet'}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Du har inte registrerat biometrisk autentisering ännu
                  </p>
                </div>
                <Button
                  onClick={handleRegisterPasskey}
                  disabled={isRegistering}
                  className="w-full"
                >
                  <Fingerprint className="h-4 w-4 mr-2" />
                  {isRegistering ? 'Registrerar...' : 'Registrera biometrisk autentisering'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Du kommer att bli ombedd att verifiera med Face ID, Touch ID eller din enhets biometriska säkerhet
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

