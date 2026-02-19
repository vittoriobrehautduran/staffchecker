import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'
import { ArrowLeft } from 'lucide-react'

export default function Admin() {
  const { isSignedIn, user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [userEmail, setUserEmail] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [isReverting, setIsReverting] = useState(false)

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/login')
      return
    }

    // Check if user is admin, redirect if not
    if (user && user.isAdmin === false) {
      toast({
        title: 'Åtkomst nekad',
        description: 'Du har inte behörighet att komma åt denna sida',
        variant: 'destructive',
      })
      navigate('/report')
    }
  }, [isSignedIn, user, navigate, toast])

  if (!isSignedIn) {
    return null
  }

  // Show loading or redirect if not admin
  if (user && user.isAdmin === false) {
    return null
  }

  const handleRevertReport = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!userEmail || !month || !year) {
      toast({
        title: 'Fält saknas',
        description: 'Alla fält måste fyllas i',
        variant: 'destructive',
      })
      return
    }

    const monthNum = parseInt(month, 10)
    const yearNum = parseInt(year, 10)

    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      toast({
        title: 'Ogiltig månad',
        description: 'Månad måste vara mellan 1 och 12',
        variant: 'destructive',
      })
      return
    }

    if (isNaN(yearNum) || yearNum < 2020 || yearNum > 2100) {
      toast({
        title: 'Ogiltigt år',
        description: 'Ange ett giltigt år',
        variant: 'destructive',
      })
      return
    }

    setIsReverting(true)

    try {
      await apiRequest('/revert-report', {
        method: 'POST',
        body: JSON.stringify({
          userEmail: userEmail.trim().toLowerCase(),
          month: monthNum,
          year: yearNum,
        }),
      })

      toast({
        title: 'Rapport återställd',
        description: `Rapporten för ${userEmail} (${month}/${year}) har återställts till utkast`,
      })

      // Clear form
      setUserEmail('')
      setMonth('')
      setYear('')
    } catch (error: any) {
      console.error('Error reverting report:', error)
      toast({
        title: 'Kunde inte återställa rapport',
        description: error.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsReverting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-2xl">
        <div className="mb-4">
          <Button variant="ghost" onClick={() => navigate('/report')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka till kalender
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Admin - Återställ Rapport</CardTitle>
            <CardDescription>
              Återställ en skickad rapport till utkast så att användaren kan skicka den igen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRevertReport} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="userEmail">Användarens e-postadress</Label>
                <Input
                  id="userEmail"
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  disabled={isReverting}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="month">Månad (1-12)</Label>
                  <Input
                    id="month"
                    type="number"
                    min="1"
                    max="12"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    placeholder="3"
                    required
                    disabled={isReverting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="year">År</Label>
                  <Input
                    id="year"
                    type="number"
                    min="2020"
                    max="2100"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2024"
                    required
                    disabled={isReverting}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isReverting}>
                {isReverting ? 'Återställer...' : 'Återställ rapport till utkast'}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm text-amber-800">
                <strong>Obs:</strong> Detta kommer att återställa rapporten till utkast-status. 
                Användaren kommer att kunna redigera och skicka rapporten igen.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

