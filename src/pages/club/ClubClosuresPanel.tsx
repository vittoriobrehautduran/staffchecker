import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useToast } from '@/components/ui/use-toast'
import { clearAttendanceDayCache } from '@/lib/clubAttendanceCache'
import { LOV_CLOSURE_DEFAULT_LABEL, ROD_CLOSURE_DEFAULT_LABEL } from '@/lib/clubClosuresCalendar'
import { invalidateClubClosuresCache } from '@/lib/clubClosuresCache'
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

function ClosureListItem({
  label,
  onRemove,
  disabled,
}: {
  label: string
  onRemove: () => void
  disabled: boolean
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
      <span>{label}</span>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onRemove}>
        Ta bort
      </Button>
    </li>
  )
}

export function ClubClosuresPanel({ onClosuresChanged }: Props) {
  const { toast } = useToast()
  const [closures, setClosures] = useState<ClubClosuresPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [lovFrom, setLovFrom] = useState('')
  const [lovTo, setLovTo] = useState('')
  const [lovLabel, setLovLabel] = useState('')

  const [rodDate, setRodDate] = useState(todayDateStr())
  const [rodLabel, setRodLabel] = useState('')

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
        title: 'Kunde inte ladda stängda dagar',
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
    invalidateClubClosuresCache()
    onClosuresChanged?.()
  }

  const addLov = async () => {
    if (!lovFrom || !lovTo) {
      toast({
        title: 'Välj datum',
        description: 'Ange både start- och slutdatum.',
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
          label: lovLabel.trim() || LOV_CLOSURE_DEFAULT_LABEL,
        }),
      })
      afterChange(result)
      toast({ title: 'Lov sparat' })
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
        description: 'Ange ett datum för röd dag.',
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
          label: rodLabel.trim() || ROD_CLOSURE_DEFAULT_LABEL,
        }),
      })
      afterChange(result)
      toast({ title: 'Röd dag sparad' })
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
      <div className="flex items-center gap-2 py-4">
        <LoadingSpinner size="sm" />
        <span className="text-sm text-muted-foreground">Laddar…</span>
      </div>
    )
  }

  const lovRanges = closures?.lovRanges ?? []
  const rodDays = closures?.rodDays ?? []

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Lov/tävling
        </p>
        <p className="text-sm text-muted-foreground">
          Period utan skola — tränare ser inga lektioner i närvaro.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="lov-from" className="text-xs">
              Från
            </Label>
            <Input
              id="lov-from"
              type="date"
              value={lovFrom}
              onChange={(event) => setLovFrom(event.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lov-to" className="text-xs">
              Till
            </Label>
            <Input
              id="lov-to"
              type="date"
              value={lovTo}
              onChange={(event) => setLovTo(event.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="lov-label" className="text-xs">
              Namn
            </Label>
            <Input
              id="lov-label"
              value={lovLabel}
              onChange={(event) => setLovLabel(event.target.value)}
              placeholder="t.ex. Sommarlov, Klubbmästerskap 2026"
              disabled={isSaving}
            />
          </div>
        </div>
        <Button type="button" size="sm" onClick={() => void addLov()} disabled={isSaving}>
          Lägg till lov
        </Button>
        {lovRanges.length > 0 && (
          <ul className="space-y-2 pt-1">
            {lovRanges.map((range) => (
              <ClosureListItem
                key={range.id}
                label={`${range.label || LOV_CLOSURE_DEFAULT_LABEL} · ${formatSvDate(range.fromDate)} – ${formatSvDate(range.toDate)}`}
                disabled={isSaving}
                onRemove={() => void removeLov(range.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-border/60 pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Röd dag</p>
        <p className="text-sm text-muted-foreground">Enstaka dag utan skola, t.ex. helgdag.</p>
        <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="rod-date" className="text-xs">
              Datum
            </Label>
            <Input
              id="rod-date"
              type="date"
              value={rodDate}
              onChange={(event) => setRodDate(event.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rod-label" className="text-xs">
              Namn
            </Label>
            <Input
              id="rod-label"
              value={rodLabel}
              onChange={(event) => setRodLabel(event.target.value)}
              placeholder="t.ex. Klubbmästerskap 2026, Julafton"
              disabled={isSaving}
            />
          </div>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => void addRodDag()} disabled={isSaving}>
          Lägg till röd dag
        </Button>
        {rodDays.length > 0 && (
          <ul className="space-y-2 pt-1">
            {rodDays.map((day) => (
              <ClosureListItem
                key={day.id}
                label={`${day.label || ROD_CLOSURE_DEFAULT_LABEL} · ${formatSvDate(day.date)}`}
                disabled={isSaving}
                onRemove={() => void removeRod(day.date)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
