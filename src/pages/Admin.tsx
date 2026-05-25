import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'
import { ArrowLeft } from 'lucide-react'

const CLEANUP_CONFIRM_PHRASE = 'RADERA GAMMAL NARVARO'

type CleanupPreview = {
  clubName: string
  clubSlug: string
  retentionDays: number
  cutoffDate: string
  sessions: number
  auditLogEntries: number
  notifications: number
}

export default function Admin() {
  const { isSignedIn, user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [userEmail, setUserEmail] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [isReverting, setIsReverting] = useState(false)
  const [deleteUserEmail, setDeleteUserEmail] = useState('')
  const [isDeletingUser, setIsDeletingUser] = useState(false)
  const [cleanupRetentionDays, setCleanupRetentionDays] = useState('60')
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(null)
  const [cleanupConfirmPhrase, setCleanupConfirmPhrase] = useState('')
  const [isLoadingCleanupPreview, setIsLoadingCleanupPreview] = useState(false)
  const [isRunningCleanup, setIsRunningCleanup] = useState(false)

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
      navigate('/dashboard')
    }
  }, [isSignedIn, user, navigate, toast])

  const loadCleanupPreview = useCallback(async () => {
    const retentionDays = Number(cleanupRetentionDays)
    if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
      toast({
        title: 'Ogiltigt antal dagar',
        description: 'Ange mellan 1 och 3650 dagar.',
        variant: 'destructive',
      })
      return
    }

    setIsLoadingCleanupPreview(true)
    try {
      const preview = await apiRequest<CleanupPreview>('/admin-club-cleanup', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'preview',
          clubSlug: 'spanga',
          retentionDays,
        }),
      })
      setCleanupPreview(preview)
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte förhandsgranska',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingCleanupPreview(false)
    }
  }, [cleanupRetentionDays, toast])

  useEffect(() => {
    if (user?.isAdmin) {
      void loadCleanupPreview()
    }
  }, [user?.isAdmin, loadCleanupPreview])

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

  const handleDeleteUserData = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!deleteUserEmail.trim()) {
      toast({
        title: 'Fält saknas',
        description: 'Användarens e-postadress måste fyllas i',
        variant: 'destructive',
      })
      return
    }

    const confirmed = window.confirm(
      `Detta tar bort användaren ${deleteUserEmail.trim()} och alla rapporter/entries permanent. Vill du fortsätta?`
    )
    if (!confirmed) {
      return
    }

    setIsDeletingUser(true)
    try {
      await apiRequest('/revert-report', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'delete_user_data',
          userEmail: deleteUserEmail.trim().toLowerCase(),
        }),
      })

      toast({
        title: 'Användare borttagen',
        description: 'Användaren och all kopplad data har tagits bort permanent',
      })
      setDeleteUserEmail('')
    } catch (error: any) {
      console.error('Error deleting user data:', error)
      toast({
        title: 'Kunde inte ta bort användare',
        description: error.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsDeletingUser(false)
    }
  }

  async function handleRunCleanup(e: React.FormEvent) {
    e.preventDefault()

    if (!cleanupPreview) {
      toast({
        title: 'Förhandsgranska först',
        description: 'Klicka på "Uppdatera förhandsgranskning" innan du raderar.',
        variant: 'destructive',
      })
      return
    }

    const totalToDelete =
      cleanupPreview.sessions +
      cleanupPreview.auditLogEntries +
      cleanupPreview.notifications

    if (totalToDelete === 0) {
      toast({
        title: 'Inget att radera',
        description: 'Det finns ingen gammal närvarodata enligt valt antal dagar.',
      })
      return
    }

    if (cleanupConfirmPhrase.trim().toUpperCase() !== CLEANUP_CONFIRM_PHRASE) {
      toast({
        title: 'Bekräftelse saknas',
        description: `Skriv exakt "${CLEANUP_CONFIRM_PHRASE}" i fältet.`,
        variant: 'destructive',
      })
      return
    }

    setIsRunningCleanup(true)
    try {
      await apiRequest('/admin-club-cleanup', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'execute',
          clubSlug: 'spanga',
          retentionDays: cleanupPreview.retentionDays,
          confirmPhrase: cleanupConfirmPhrase.trim(),
        }),
      })

      toast({
        title: 'Rensning klar',
        description: `Tog bort data äldre än ${cleanupPreview.cutoffDate}.`,
      })
      setCleanupConfirmPhrase('')
      await loadCleanupPreview()
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte rensa',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsRunningCleanup(false)
    }
  }

  return (
    <div className="min-h-screen flex-1 bg-background p-4 md:p-6">
      <div className="container mx-auto max-w-2xl">
        <div className="mb-4">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Till översikt
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

            <div className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-950 dark:text-amber-100">
                <strong>Obs:</strong> Detta kommer att återställa rapporten till utkast-status. 
                Användaren kommer att kunna redigera och skicka rapporten igen.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6 border-destructive/40">
          <CardHeader>
            <CardTitle>Admin - Radera användare och all data</CardTitle>
            <CardDescription>
              Tar bort användarens konto i appens databas samt alla rapporter och entries permanent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleDeleteUserData} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="deleteUserEmail">Användarens e-postadress</Label>
                <Input
                  id="deleteUserEmail"
                  type="email"
                  value={deleteUserEmail}
                  onChange={(e) => setDeleteUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  required
                  disabled={isDeletingUser}
                />
              </div>

              <Button
                type="submit"
                variant="destructive"
                className="w-full"
                disabled={isDeletingUser}
              >
                {isDeletingUser ? 'Raderar användare...' : 'Radera användare och all data'}
              </Button>
            </form>

            <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">
                <strong>Varning:</strong> Denna åtgärd går inte att ångra. Användaren, rapporter och entries
                tas bort permanent i appens databas.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6 border-destructive/40">
          <CardHeader>
            <CardTitle>Admin - Rensa gammal klubbnärvaro</CardTitle>
            <CardDescription>
              Tar bort dagliga lektioner, närvaro, ändringslogg och notifieringar äldre än valt antal
              dagar. Veckoschemat (mallen) påverkas inte.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cleanup-retention-days">Behåll data (dagar)</Label>
              <Input
                id="cleanup-retention-days"
                type="number"
                min={1}
                max={3650}
                value={cleanupRetentionDays}
                onChange={(event) => setCleanupRetentionDays(event.target.value)}
                disabled={isLoadingCleanupPreview || isRunningCleanup}
              />
              <p className="text-xs text-muted-foreground">
                Allt med datum före gränsdatumet raderas. Standard från klubbens inställning är ofta
                60 dagar.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => void loadCleanupPreview()}
              disabled={isLoadingCleanupPreview || isRunningCleanup}
            >
              {isLoadingCleanupPreview ? 'Laddar…' : 'Uppdatera förhandsgranskning'}
            </Button>

            {cleanupPreview && (
              <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-1">
                <p>
                  <strong>{cleanupPreview.clubName}</strong> — raderar data före{' '}
                  <strong>{cleanupPreview.cutoffDate}</strong>
                </p>
                <p>Lektioner (dagar): {cleanupPreview.sessions}</p>
                <p>Ändringslogg: {cleanupPreview.auditLogEntries}</p>
                <p>Notifieringar: {cleanupPreview.notifications}</p>
                <p className="text-muted-foreground pt-1">
                  Närvarorader följer lektionerna och tas bort automatiskt.
                </p>
              </div>
            )}

            <form onSubmit={(event) => void handleRunCleanup(event)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cleanup-confirm">
                  Bekräfta ({CLEANUP_CONFIRM_PHRASE})
                </Label>
                <Input
                  id="cleanup-confirm"
                  value={cleanupConfirmPhrase}
                  onChange={(event) => setCleanupConfirmPhrase(event.target.value)}
                  placeholder={CLEANUP_CONFIRM_PHRASE}
                  disabled={isRunningCleanup}
                  autoComplete="off"
                />
              </div>
              <Button
                type="submit"
                variant="destructive"
                className="w-full"
                disabled={isRunningCleanup || isLoadingCleanupPreview}
              >
                {isRunningCleanup ? 'Rensar…' : 'Radera gammal närvarodata'}
              </Button>
            </form>

            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">
                <strong>Varning:</strong> Detta går inte att ångra. Boss-historik för raderade dagar
                försvinner. Timrapporter påverkas inte.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

