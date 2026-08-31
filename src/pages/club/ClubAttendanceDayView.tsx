import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical } from 'lucide-react'
import type {
  AttendanceStatus,
  DayPayload,
  DaySession,
  LessonSport,
} from '@/pages/club/clubAttendanceTypes'
import { formatSessionVenue } from '@/pages/club/clubAttendanceTypes'
import { ClubEmptyState } from '@/pages/club/clubUi'
import { AttendanceDaySkeleton } from '@/components/ui/page-skeletons'

type Props = {
  payload: DayPayload | null
  activeSport: LessonSport
  isLoading: boolean
  isSaving: boolean
  onSaveSession: (
    sessionId: number,
    patch: {
      coachIds?: number[]
      players?: { sessionPlayerId?: number; name?: string; removed?: boolean }[]
      attendance?: { sessionPlayerId: number; status: AttendanceStatus }[]
    }
  ) => Promise<void>
}

function activeCoaches(session: DaySession) {
  return session.coaches.filter((coach) => !coach.isRemoved)
}

function activePlayers(session: DaySession) {
  return session.players.filter((player) => !player.isRemoved)
}

function SessionCard({
  session,
  payload,
  isSaving,
  onSaveSession,
}: {
  session: DaySession
  payload: DayPayload
  isSaving: boolean
  onSaveSession: Props['onSaveSession']
}) {
  const [newPlayerName, setNewPlayerName] = useState('')
  const [selectedCoachId, setSelectedCoachId] = useState('')

  const coachIds = activeCoaches(session).map((coach) => coach.coachId)
  const venue = formatSessionVenue(session)

  async function saveCoachIds(nextCoachIds: number[]) {
    await onSaveSession(session.id, { coachIds: nextCoachIds })
  }

  function setAttendance(sessionPlayerId: number, status: AttendanceStatus) {
    void onSaveSession(session.id, {
      attendance: [{ sessionPlayerId, status }],
    })
  }

  async function removePlayer(sessionPlayerId: number) {
    await onSaveSession(session.id, {
      players: [{ sessionPlayerId, removed: true }],
    })
  }

  async function addPlayer() {
    const name = newPlayerName.trim()
    if (!name) return
    await onSaveSession(session.id, { players: [{ name }] })
    setNewPlayerName('')
  }

  async function addCoach() {
    const coachId = Number(selectedCoachId)
    if (!coachId || coachIds.includes(coachId)) return
    await saveCoachIds([...coachIds, coachId])
    setSelectedCoachId('')
  }

  async function removeCoach(coachId: number) {
    await saveCoachIds(coachIds.filter((id) => id !== coachId))
  }

  const availableCoaches = payload.coachesCatalog.filter(
    (coach) =>
      !coachIds.includes(coach.id) &&
      (coach.sport === session.sport || coach.sport === 'both')
  )

  return (
    <div className="rounded-2xl border border-border/80 bg-background/60 p-4 md:p-5">
      <div className="mb-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {session.startTime}–{session.endTime} · {venue}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {session.className || 'Lektion'} · {session.sport === 'tennis' ? 'Tennis' : 'Bordtennis'}
        </p>
      </div>
      <div className="space-y-5">
        <section className="space-y-2">
          <Label className="text-sm font-medium">Tränare</Label>
          <div className="flex flex-wrap gap-2">
            {activeCoaches(session).map((coach) => (
              <span
                key={coach.id}
                className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-3 py-2 text-sm ${
                  coach.isDayAddition ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : ''
                }`}
              >
                {coach.name}
                {coach.isDayAddition && (
                  <span className="text-xs text-amber-700 dark:text-amber-300">(dag)</span>
                )}
                <button
                  type="button"
                  className="ml-1 min-h-8 min-w-8 touch-manipulation text-muted-foreground hover:text-foreground"
                  onClick={() => void removeCoach(coach.coachId)}
                  disabled={isSaving}
                  aria-label={`Ta bort ${coach.name} för dagen`}
                >
                  ×
                </button>
              </span>
            ))}
            {activeCoaches(session).length === 0 && (
              <span className="text-sm text-muted-foreground">Ingen tränare vald</span>
            )}
          </div>

          {availableCoaches.length > 0 && (
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <Select
                value={selectedCoachId || '__none__'}
                onValueChange={(value) =>
                  setSelectedCoachId(value === '__none__' ? '' : value)
                }
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
                onClick={() => void addCoach()}
                disabled={isSaving || !selectedCoachId}
              >
                Lägg till
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <Label className="text-sm font-medium">Elever och närvaro</Label>
          <div className="space-y-2">
            {activePlayers(session).map((player) => {
              const status = player.attendanceStatus

              return (
                <div
                  key={player.id}
                  className={`rounded-md border p-3 ${
                    player.isDayAddition
                      ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
                      : ''
                  }`}
                  data-testid={`player-row-${player.id}`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 text-base font-medium leading-snug">
                      {player.name}
                      {player.isDayAddition && (
                        <span className="mt-0.5 block text-xs font-normal text-amber-700 dark:text-amber-300">
                          Ny för dagen
                        </span>
                      )}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 shrink-0"
                          disabled={isSaving}
                          aria-label={`Alternativ för ${player.name}`}
                        >
                          <MoreVertical className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={isSaving}
                          onClick={() => void removePlayer(player.id)}
                        >
                          Ta bort för idag
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div
                    className="grid grid-cols-3 gap-2"
                    role="group"
                    aria-label={`Närvaro för ${player.name}`}
                  >
                    {(
                      [
                        ['present', 'Närvarande', 'bg-green-600 text-white border-green-700'],
                        ['absent', 'Frånvarande', 'bg-red-600 text-white border-red-700'],
                        ['unknown', 'Okänd', 'bg-muted text-foreground border-border'],
                      ] as const
                    ).map(([value, label, activeClass]) => {
                      const isActive = status === value
                      return (
                        <button
                          key={value}
                          type="button"
                          title={label}
                          aria-label={`${player.name}: ${label}`}
                          aria-pressed={isActive}
                          disabled={isSaving}
                          data-testid={`attendance-${player.id}-${value}`}
                          className={`flex min-h-12 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 text-base font-semibold transition-colors active:scale-[0.98] ${
                            isActive
                              ? activeClass
                              : 'border-border bg-background text-muted-foreground hover:bg-muted/60'
                          }`}
                          onClick={() => {
                            if (status !== value) setAttendance(player.id, value)
                          }}
                        >
                          <span className="text-xl leading-none" aria-hidden>
                            {value === 'present' ? '✓' : value === 'absent' ? '✗' : '?'}
                          </span>
                          <span className="text-[10px] font-medium leading-tight sm:text-xs">
                            {value === 'present'
                              ? 'Här'
                              : value === 'absent'
                                ? 'Borta'
                                : 'Okänd'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          {activePlayers(session).length === 0 && (
            <p className="text-sm text-muted-foreground">Inga elever på lektionen</p>
          )}

          <div className="flex flex-wrap items-end gap-2 pt-1">
            <Input
              value={newPlayerName}
              onChange={(event) => setNewPlayerName(event.target.value)}
              placeholder="Ny elev för dagen"
              className="max-w-xs"
              disabled={isSaving}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void addPlayer()}
              disabled={isSaving || !newPlayerName.trim()}
            >
              Lägg till elev
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}

export function ClubAttendanceDayView({
  payload,
  activeSport,
  isLoading,
  isSaving,
  onSaveSession,
}: Props) {
  const sortedSessions = useMemo(() => {
    if (!payload) return []
    return [...payload.sessions]
      .filter((session) => session.sport === activeSport)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [payload, activeSport])

  const sportLabel = activeSport === 'tennis' ? 'tennis' : 'bordtennis'

  if (isLoading && !payload) {
    return <AttendanceDaySkeleton />
  }

  if (!payload) {
    return <p className="text-sm text-muted-foreground">Välj ett datum för att se lektioner.</p>
  }

  if (payload.cancelled) {
    const heading =
      payload.closureType === 'lov'
        ? payload.closureLabel || 'lov/tävling'
        : payload.closureType === 'rod_dag'
          ? payload.closureLabel || 'Röd dag'
          : 'Dagen är stängd'
    const detail =
      payload.closureType === 'lov'
        ? 'Ingen skola denna dag — lektioner visas inte i närvaro.'
        : payload.closureType === 'rod_dag'
          ? 'Röd dag — lektioner visas inte i närvaro.'
          : 'Lektioner visas inte i närvaro.'

    return (
      <ClubEmptyState title={heading} description={detail} />
    )
  }

  if (sortedSessions.length === 0) {
    return (
      <ClubEmptyState
        title={`Inga ${sportLabel}-lektioner`}
        description="Inget schemalagt den här dagen för vald sport."
      />
    )
  }

  return (
    <div className="space-y-4">
      {sortedSessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          payload={payload}
          isSaving={isSaving}
          onSaveSession={onSaveSession}
        />
      ))}
    </div>
  )
}
