import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {session.startTime}–{session.endTime} · {venue}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {session.className || 'Lektion'} · {session.sport === 'tennis' ? 'Tennis' : 'Bordtennis'}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
          <Label className="text-sm font-medium">Tränare</Label>
          <div className="flex flex-wrap gap-2">
            {activeCoaches(session).map((coach) => (
              <span
                key={coach.id}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
                  coach.isDayAddition ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : ''
                }`}
              >
                {coach.name}
                {coach.isDayAddition && (
                  <span className="text-xs text-amber-700 dark:text-amber-300">(dag)</span>
                )}
                <button
                  type="button"
                  className="ml-1 text-muted-foreground hover:text-foreground"
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
              <Select value={selectedCoachId} onValueChange={setSelectedCoachId}>
                <SelectTrigger className="w-[12rem]">
                  <SelectValue placeholder="Lägg till tränare" />
                </SelectTrigger>
                <SelectContent>
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
                  className={`flex items-center gap-3 rounded-md border p-2 ${
                    player.isDayAddition
                      ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
                      : ''
                  }`}
                  data-testid={`player-row-${player.id}`}
                >
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {player.name}
                    {player.isDayAddition && (
                      <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
                        Ny för dagen
                      </span>
                    )}
                  </span>
                  <div
                    className="flex shrink-0 gap-1"
                    role="group"
                    aria-label={`Närvaro för ${player.name}`}
                  >
                    {(
                      [
                        ['present', 'Närvarande', 'bg-green-600 text-white'],
                        ['absent', 'Frånvarande', 'bg-red-600 text-white'],
                        ['unknown', 'Okänd', 'bg-muted text-muted-foreground'],
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
                          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                            isActive
                              ? activeClass
                              : 'border border-border bg-background hover:bg-muted/60'
                          }`}
                          onClick={() => {
                            if (status !== value) setAttendance(player.id, value)
                          }}
                        >
                          {value === 'present' ? '✓' : value === 'absent' ? '✗' : '?'}
                        </button>
                      )
                    })}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        disabled={isSaving}
                        aria-label={`Alternativ för ${player.name}`}
                      >
                        <MoreVertical className="h-4 w-4" />
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
      </CardContent>
    </Card>
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
    return (
      <div className="flex items-center gap-3 py-8">
        <LoadingSpinner />
        <span className="text-sm text-muted-foreground">Laddar dagens lektioner…</span>
      </div>
    )
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
      <Card>
        <CardContent className="py-6 space-y-1">
          <p className="text-sm font-medium">{heading}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </CardContent>
      </Card>
    )
  }

  if (sortedSessions.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            Inga {sportLabel}-lektioner schemalagda den här dagen.
          </p>
        </CardContent>
      </Card>
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
