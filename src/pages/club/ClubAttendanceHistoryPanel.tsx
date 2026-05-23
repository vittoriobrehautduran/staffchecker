import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import type { AttendanceHistorySession } from '@/pages/club/clubAttendanceTypes'
import { formatSessionVenue } from '@/pages/club/clubAttendanceTypes'

type Props = {
  sessions: AttendanceHistorySession[]
  isLoading: boolean
}

const STATUS_LABELS = {
  present: 'Närvarande',
  absent: 'Frånvarande',
  unknown: 'Ej markerad',
} as const

export function ClubAttendanceHistoryPanel({ sessions, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-8">
        <LoadingSpinner />
        <span className="text-sm text-muted-foreground">Laddar närvarohistorik…</span>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Ingen närvarodata de senaste 30 dagarna.</p>
        </CardContent>
      </Card>
    )
  }

  const byDate = new Map<string, AttendanceHistorySession[]>()
  for (const session of sessions) {
    const list = byDate.get(session.date) || []
    list.push(session)
    byDate.set(session.date, list)
  }

  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a))

  return (
    <div className="space-y-4">
      {dates.map((date) => (
        <Card key={date}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{date}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(byDate.get(date) || []).map((session) => (
              <div key={session.sessionId} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {session.startTime}–{session.endTime} ·{' '}
                    {formatSessionVenue({
                      resourceLabel: session.resourceLabel,
                      resourceNumber: session.resourceNumber,
                      resourceType: session.sport === 'tennis' ? 'court' : 'table',
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.summary.present} närvarande · {session.summary.absent} frånvarande ·{' '}
                    {session.summary.unknown} ej markerade
                  </p>
                </div>
                <ul className="mt-2 space-y-1">
                  {session.players.map((player) => (
                    <li key={player.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={player.isDayAddition ? 'text-amber-700 dark:text-amber-300' : ''}>
                        {player.name}
                        {player.isDayAddition ? ' (dag)' : ''}
                      </span>
                      <span className="text-muted-foreground">
                        {STATUS_LABELS[player.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}