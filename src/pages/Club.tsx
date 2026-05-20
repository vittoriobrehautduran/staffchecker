import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { apiRequest } from '@/services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'

type ResourceType = 'court' | 'table'
type SportType = 'tennis' | 'bordtennis' | 'both'

type ClubPayload = {
  club: {
    id: number
    name: string
    slug: string
    tennis_courts_count: number
    bordtennis_tables_count: number
    default_slot_duration_minutes: number
    retention_days: number
  }
  coaches: { id: number; name: string; sport: SportType; is_active: boolean }[]
  classes: { id: number; name: string; sport: Exclude<SportType, 'both'>; is_active: boolean }[]
  resources: {
    id: number
    resource_type: ResourceType
    resource_number: number
    label: string | null
    is_active: boolean
  }[]
}

export default function Club() {
  const { isSignedIn, user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [data, setData] = useState<ClubPayload | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [tennisCourts, setTennisCourts] = useState('0')
  const [tableTennisTables, setTableTennisTables] = useState('0')
  const [slotMinutes, setSlotMinutes] = useState('60')
  const [retentionDays, setRetentionDays] = useState('60')

  const [coachName, setCoachName] = useState('')
  const [coachSport, setCoachSport] = useState<SportType>('both')
  const [className, setClassName] = useState('')
  const [classSport, setClassSport] = useState<Exclude<SportType, 'both'>>('tennis')
  const [resourceType, setResourceType] = useState<ResourceType>('court')
  const [resourceNumber, setResourceNumber] = useState('1')
  const [resourceLabel, setResourceLabel] = useState('')

  const canManageClub = !!user?.hasClubBossAccess

  const resourceSummary = useMemo(() => {
    if (!data) return ''
    const courts = data.resources.filter((resource) => resource.resource_type === 'court').length
    const tables = data.resources.filter((resource) => resource.resource_type === 'table').length
    return `${courts} banor, ${tables} bord`
  }, [data])

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/login')
      return
    }

    if (user && !user.hasClubAccess) {
      navigate('/dashboard', { replace: true })
      return
    }

    if (user?.hasClubBossAccess) {
      void loadClubData()
    }
  }, [isSignedIn, user, navigate])

  async function loadClubData() {
    setIsLoading(true)
    try {
      const payload = await apiRequest<ClubPayload>('/club-admin', { method: 'GET' })
      setData(payload)
      setTennisCourts(String(payload.club.tennis_courts_count))
      setTableTennisTables(String(payload.club.bordtennis_tables_count))
      setSlotMinutes(String(payload.club.default_slot_duration_minutes))
      setRetentionDays(String(payload.club.retention_days))
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte ladda klubbinställningar',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function saveSettings() {
    setIsLoading(true)
    try {
      const payload = await apiRequest<ClubPayload>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'update_settings',
          tennisCourtsCount: Number(tennisCourts || '0'),
          bordtennisTablesCount: Number(tableTennisTables || '0'),
          defaultSlotDurationMinutes: Number(slotMinutes || '60'),
          retentionDays: Number(retentionDays || '60'),
        }),
      })
      setData(payload)
      toast({ title: 'Inställningar sparade' })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte spara inställningar',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function addCoach() {
    if (!coachName.trim()) return
    setIsLoading(true)
    try {
      const payload = await apiRequest<ClubPayload>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'add_coach',
          name: coachName,
          sport: coachSport,
        }),
      })
      setData(payload)
      setCoachName('')
      toast({ title: 'Tränare tillagd' })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({ title: 'Kunde inte lägga till tränare', description: err?.message || 'Ett fel uppstod', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  async function addClass() {
    if (!className.trim()) return
    setIsLoading(true)
    try {
      const payload = await apiRequest<ClubPayload>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'add_class',
          name: className,
          sport: classSport,
        }),
      })
      setData(payload)
      setClassName('')
      toast({ title: 'Klass tillagd' })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({ title: 'Kunde inte lägga till klass', description: err?.message || 'Ett fel uppstod', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  async function addResource() {
    setIsLoading(true)
    try {
      const payload = await apiRequest<ClubPayload>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'add_resource',
          resourceType,
          resourceNumber: Number(resourceNumber || '1'),
          label: resourceLabel,
        }),
      })
      setData(payload)
      setResourceLabel('')
      toast({ title: 'Resurs tillagd' })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({ title: 'Kunde inte lägga till resurs', description: err?.message || 'Ett fel uppstod', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  if (!isSignedIn || (user && !user.hasClubAccess)) {
    return null
  }

  if (!canManageClub) {
    return (
      <div className="min-h-screen flex-1 bg-background p-4 md:p-6">
        <div className="container mx-auto max-w-3xl space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">Klubb</h1>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tränarläge</CardTitle>
              <CardDescription>
                Du har tränarbehörighet. Bosspanelen för schema och inställningar är endast tillgänglig för klubbansvarig.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
                Till översikt
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex-1 bg-background p-4 md:p-6">
      <div className="container mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Klubbinställningar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Grunddata för närvaro-modulen. Du kan börja lägga in banor, tränare och klasser här.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Klubb</CardTitle>
            <CardDescription>
              {data ? `${data.club.name} (${data.club.slug})` : 'Laddar...'}
              {resourceSummary ? ` - ${resourceSummary}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Antal tennisbanor</Label>
              <Input value={tennisCourts} onChange={(event) => setTennisCourts(event.target.value)} type="number" min="0" />
            </div>
            <div className="space-y-2">
              <Label>Antal bordtennisbord</Label>
              <Input value={tableTennisTables} onChange={(event) => setTableTennisTables(event.target.value)} type="number" min="0" />
            </div>
            <div className="space-y-2">
              <Label>Lektionslängd (min)</Label>
              <Input value={slotMinutes} onChange={(event) => setSlotMinutes(event.target.value)} type="number" min="15" />
            </div>
            <div className="space-y-2">
              <Label>Spara data (dagar)</Label>
              <Input value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} type="number" min="1" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="button" onClick={saveSettings} disabled={isLoading}>
                Spara inställningar
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tränare</CardTitle>
              <CardDescription>{data ? `${data.coaches.length} st` : '...'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Namn" value={coachName} onChange={(event) => setCoachName(event.target.value)} />
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={coachSport}
                onChange={(event) => setCoachSport(event.target.value as SportType)}
              >
                <option value="both">Båda</option>
                <option value="tennis">Tennis</option>
                <option value="bordtennis">Bordtennis</option>
              </select>
              <Button type="button" variant="outline" onClick={addCoach} disabled={isLoading}>
                Lägg till tränare
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Klasser</CardTitle>
              <CardDescription>{data ? `${data.classes.length} st` : '...'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Klassnamn" value={className} onChange={(event) => setClassName(event.target.value)} />
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={classSport}
                onChange={(event) => setClassSport(event.target.value as Exclude<SportType, 'both'>)}
              >
                <option value="tennis">Tennis</option>
                <option value="bordtennis">Bordtennis</option>
              </select>
              <Button type="button" variant="outline" onClick={addClass} disabled={isLoading}>
                Lägg till klass
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resurser</CardTitle>
              <CardDescription>{data ? `${data.resources.length} st` : '...'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={resourceType}
                onChange={(event) => setResourceType(event.target.value as ResourceType)}
              >
                <option value="court">Bana</option>
                <option value="table">Bord</option>
              </select>
              <Input
                placeholder="Nummer"
                type="number"
                min="1"
                value={resourceNumber}
                onChange={(event) => setResourceNumber(event.target.value)}
              />
              <Input
                placeholder="Etikett (valfritt)"
                value={resourceLabel}
                onChange={(event) => setResourceLabel(event.target.value)}
              />
              <Button type="button" variant="outline" onClick={addResource} disabled={isLoading}>
                Lägg till resurs
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
