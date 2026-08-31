import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ClubCoach, LessonSport } from './clubTypes'

type Props = {
  label?: string
  sport: LessonSport
  coaches: ClubCoach[]
  coachIds: number[]
  onChange: (coachIds: number[]) => void
  disabled?: boolean
}

export function DefaultCoachesEditor({
  label = 'Förvalda tränare',
  sport,
  coaches,
  coachIds,
  onChange,
  disabled = false,
}: Props) {
  const [selectedCoachId, setSelectedCoachId] = useState('')

  const sportCoaches = coaches.filter(
    (coach) => coach.sport === sport || coach.sport === 'both'
  )

  const selectedCoaches = coachIds
    .map((id) => sportCoaches.find((coach) => coach.id === id))
    .filter((coach): coach is ClubCoach => !!coach)

  const availableCoaches = sportCoaches.filter((coach) => !coachIds.includes(coach.id))

  function addCoach() {
    const coachId = Number(selectedCoachId)
    if (!coachId || coachIds.includes(coachId)) return
    onChange([...coachIds, coachId])
    setSelectedCoachId('')
  }

  function removeCoach(coachId: number) {
    onChange(coachIds.filter((id) => id !== coachId))
  }

  if (sportCoaches.length === 0) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <p className="text-sm text-muted-foreground">Lägg till tränare under Inställningar.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {selectedCoaches.map((coach) => (
          <span
            key={coach.id}
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-2 text-sm"
          >
            {coach.name}
            <button
              type="button"
              className="ml-1 min-h-8 min-w-8 touch-manipulation text-muted-foreground hover:text-foreground"
              onClick={() => removeCoach(coach.id)}
              disabled={disabled}
              aria-label={`Ta bort ${coach.name} som förvald tränare`}
            >
              ×
            </button>
          </span>
        ))}
        {selectedCoaches.length === 0 && (
          <span className="text-sm text-muted-foreground">Ingen tränare vald</span>
        )}
      </div>

      {availableCoaches.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <Select
            value={selectedCoachId || '__none__'}
            onValueChange={(value) => setSelectedCoachId(value === '__none__' ? '' : value)}
            disabled={disabled}
          >
            <SelectTrigger className="w-[12rem]">
              <SelectValue placeholder="Lägg till tränare" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" disabled>
                Lägg till tränare
              </SelectItem>
              {availableCoaches.map((coach) => (
                <SelectItem key={coach.id} value={String(coach.id)}>
                  {coach.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCoach}
            disabled={disabled || !selectedCoachId}
          >
            Lägg till
          </Button>
        </div>
      )}
    </div>
  )
}
