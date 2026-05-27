import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useToast } from '@/components/ui/use-toast'
import { clearAttendanceDayCache } from '@/lib/clubAttendanceCache'
import type { ClubClosuresPayload } from '@/pages/club/clubAttendanceTypes'
import { todayDateStr } from '@/pages/club/clubAttendanceTypes'

type Props = {
  onClosuresChanged?: () => void
}

function formatSvDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  if (!year || !month || !day) return dateStr
  return new Date(year, month - 1, day).toLocaleDateString('sv-SE')
}

export function ClubClosuresPanel({ onClosuresChanged }: Props) {
  const { toast } = useToast()
  const [closures, setClosures] = useState<ClubClosuresPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [lovFrom, setLovFrom] = useState('')
  const [lovTo, setLovTo] = useState('')
  const [lovLabel, setLovLabel] = useState('Lov')

  const [rodDate, setRodDate] = useState(todayDateStr())
  const [rodLabel, setRodLabel] = useState('Röd dag')

  const loadClosures = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await apiRequest<ClubClosuresPayload>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({ operation: 'get_closures' }),
      })
      setClosures(result)
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte ladda lov och röda dagar',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadClosures()
  }, [loadClosures])

  const afterChange = (next: ClubClosuresPayload) => {
    setClosures(next)
    clearAttendanceDayCache()
    onClosuresChanged?.()
  }

  const addLov = async () => {
    if (!lovFrom || !lovTo) {
      toast({
        title: 'Välj datum',
        description: 'Ange både start- och slutdatum för lov.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      const result = await apiRequest<ClubClosuresPayload>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'add_lov_range',
          fromDate: lovFrom,
          toDate: lovTo,
          label: lovLabel.trim() || 'Lov',
        }),
      })
      afterChange(result)
      toast({ title: 'Lov sparat', description: `${formatSvDate(lovFrom)} – ${formatSvDate(lovTo)}` })
      setLovFrom('')
      setLovTo('')
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte spara lov',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const addRodDag = async () => {
    if (!rodDate) {
      toast({
        title: 'Välj datum',
        description: 'Ange datum för röd dag.',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      const result = await apiRequest<ClubClosuresPayload>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'add_rod_dag',
          date: rodDate,
          label: rodLabel.trim() || 'Röd dag',
        }),
      })
      afterChange(result)
      toast({ title: 'Röd dag sparad', description: formatSvDate(rodDate) })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte spara röd dag',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const removeLov = async (rangeId: number) => {
    setIsSaving(true)
    try {
      const result = await apiRequest<ClubClosuresPayload>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({ operation: 'remove_lov_range', rangeId }),
      })
      afterChange(result)
      toast({ title: 'Lov borttaget' })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte ta bort lov',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const removeRod = async (date: string) => {
    setIsSaving(true)
    try {
      const result = await apiRequest<ClubClosuresPayload>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({ operation: 'remove_rod_dag', date }),
      })
      afterChange(result)
      toast({ title: 'Röd dag borttagen' })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte ta bort röd dag',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-8">
        <LoadingSpinner />
        <span className="text-sm text-muted-foreground">Laddar lov och röda dagar…</span>
      </div>
    )
  }

  const lovRanges = closures?.lovRanges ?? []
  const rodDays = closures?.rodDays ?? []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lov</CardTitle>
          <CardDescription>
            Markera en period utan skola. Tränare ser inga lektioner i närvaro under dessa datum.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="lov-from">Från</Label>
              <Input
                id="lov-from"
                type="date"
                value={lovFrom}
                onChange={(event) => setLovFrom(event.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lov-to">Till</Label>
              <Input
                id="lov-to"
                type="date"
                value={lovTo}
                onChange={(event) => setLovTo(event.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="lov-label">Benämning (valfritt)</Label>
              <Input
                id="lov-label"
                value={lovLabel}
                onChange={(event) => setLovLabel(event.target.value)}
                placeholder="t.ex. Sommarlov"
                disabled={isSaving}
              />
            </div>
          </div>
          <Button type="button" onClick={() => void addLov()} disabled={isSaving}>
            Spara lov
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Röd dag</CardTitle>
          <CardDescription>
            Stäng en enskild dag, t.ex. helgdag. Samma effekt som lov men för ett datum i taget.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="rod-date">Datum</Label>
              <Input
                id="rod-date"
                type="date"
                value={rodDate}
                onChange={(event) => setRodDate(event.target.value)}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rod-label">Benämning (valfritt)</Label>
              <Input
                id="rod-label"
                value={rodLabel}
                onChange={(event) => setRodLabel(event.target.value)}
                placeholder="Röd dag"
                disabled={isSaving}
              />
            </div>
          </div>
          <Button type="button" variant="secondary" onClick={() => void addRodDag()} disabled={isSaving}>
            Spara röd dag
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Planerade lov</h2>
        {lovRanges.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga lovperioder registrerade.</p>
        ) : (
          <div className="space-y-2">
            {lovRanges.map((range) => (
              <Card key={range.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
                  <div>
                    <p className="text-sm font-medium">
                      {range.label || 'Lov'} — {formatSvDate(range.fromDate)} –{' '}
                      {formatSvDate(range.toDate)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => void removeLov(range.id)}
                  >
                    Ta bort
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Röda dagar</h2>
        {rodDays.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga röda dagar registrerade.</p>
        ) : (
          <div className="space-y-2">
            {rodDays.map((day) => (
              <Card key={day.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
                  <p className="text-sm font-medium">
                    {day.label || 'Röd dag'} — {formatSvDate(day.date)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => void removeRod(day.date)}
                  >
                    Ta bort
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
