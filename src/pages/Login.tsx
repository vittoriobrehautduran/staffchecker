import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { Eye, EyeOff, Fingerprint, Mail, Lock } from 'lucide-react'
import { LoadingSpinner, PremiumLoadingOverlay } from '@/components/ui/loading-spinner'

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
    
    // Show loading immediately
    setIsLoading(true)

    try {
      // Small delay to show the loading animation
      await new Promise(resolve => setTimeout(resolve, 300))
      
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
      navigate('/report')
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
    <>
      {isLoading && <PremiumLoadingOverlay message="Loggar in..." />}
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmMWY1ZjkiIGZpbGwtb3BhY2l0eT0iMC40Ij48Y2lyY2xlIGN4PSIzMCIgY3k9IjMwIiByPSIxLjUiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-40"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-1/2 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* Glassmorphism card */}
      <Card className="w-full max-w-md relative z-10 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-white/20 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent rounded-lg"></div>
        <CardHeader className="relative space-y-1 pb-6">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
              <Lock className="h-6 w-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Välkommen tillbaka
          </CardTitle>
          <CardDescription className="text-center text-base">
            Logga in för att fortsätta
          </CardDescription>
        </CardHeader>
        <CardContent className="relative space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                E-post
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="din@epost.se"
                  required
                  disabled={isLoading}
                  className="h-12 pl-4 pr-4 bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Lösenord
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ditt lösenord"
                  required
                  disabled={isLoading}
                  className="h-12 pl-4 pr-12 bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
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
                    <EyeOff className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Eye className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none disabled:opacity-70" 
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                  <span>Loggar in...</span>
                </div>
              ) : (
                'Logga in'
              )}
            </Button>
            
            {/* Biometric login option */}
            {hasPasskeys && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-200 dark:border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white/80 dark:bg-gray-900/80 px-2 text-muted-foreground">eller</span>
                  </div>
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 border-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200"
                  disabled={isLoading}
                  onClick={async () => {
                    try {
                      setIsLoading(true)
                      await signInWithPasskey()
                      toast({
                        title: 'Välkommen!',
                        description: 'Du är nu inloggad med biometrisk autentisering',
                      })
                      navigate('/report')
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
              </>
            )}
          </form>
          <div className="mt-6 space-y-2 text-center text-sm">
            <div>
              <span className="text-muted-foreground">Har du inget konto? </span>
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold transition-colors"
              >
                Registrera dig
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <style>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
      </div>
    </>
  )
}
