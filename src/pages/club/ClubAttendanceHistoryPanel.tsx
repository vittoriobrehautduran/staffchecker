import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useToast } from '@/components/ui/use-toast'
import type { AttendanceHistorySession } from '@/pages/club/clubAttendanceTypes'
import { todayDateStr } from '@/pages/club/clubAttendanceTypes'
import { exportHistoryToCsv, exportHistoryToPdf } from '@/pages/club/attendanceExport'
import { formatSessionVenue } from '@/pages/club/clubAttendanceTypes'

function defaultFromDate(): string {
  const today = todayDateStr()
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day - 30))
  return date.toISOString().slice(0, 10)
}

const STATUS_LABELS: Record<string, string> = {
  present: 'Närvarande',
  absent: 'Frånvarande',
  unknown: 'Okänd',
}

type Props = {
  clubName?: string
}

export function ClubAttendanceHistoryPanel({ clubName = 'Klubb' }: Props) {
  const { toast } = useToast()
  const [fromDate, setFromDate] = useState(defaultFromDate)
  const [toDate, setToDate] = useState(todayDateStr)
  const [sessions, setSessions] = useState<AttendanceHistorySession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  const loadHistory = useCallback(async () => {
    if (!fromDate || !toDate || fromDate > toDate) {
      toast({
        title: 'Ogiltigt datumintervall',
        description: 'Från-datum måste vara före eller samma som till-datum.',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      const result = await apiRequest<{
        fromDate: string
        toDate: string
        sessions: AttendanceHistorySession[]
      }>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'get_attendance_history',
          fromDate,
          toDate,
        }),
      })
      setSessions(result.sessions || [])
      setHasLoaded(true)
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte ladda historik',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [fromDate, toDate, toast])

  useEffect(() => {
    void loadHistory()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4" data-testid="attendance-history-panel">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Närvarohistorik</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="history-from">Från</Label>
              <Input
                id="history-from"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                data-testid="history-from-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="history-to">Till</Label>
              <Input
                id="history-to"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                data-testid="history-to-date"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => void loadHistory()}
              disabled={isLoading}
              data-testid="history-load-button"
            >
              {isLoading ? 'Laddar…' : 'Visa historik'}
            </Button>
          </div>

          {hasLoaded && sessions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => exportHistoryToCsv(sessions, fromDate, toDate)}
                data-testid="history-export-csv"
              >
                Exportera CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => exportHistoryToPdf(sessions, fromDate, toDate, clubName)}
                data-testid="history-export-pdf"
              >
                Exportera PDF
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading && !hasLoaded && (
        <div className="flex items-center gap-3 py-8">
          <LoadingSpinner />
          <span className="text-sm text-muted-foreground">Laddar historik…</span>
        </div>
      )}

      {!isLoading && hasLoaded && sessions.length === 0 && (
        <p className="text-sm text-muted-foreground">Inga lektioner i valt intervall.</p>
      )}

      <div className="space-y-3">
        {sessions.map((session) => {
          const venue = formatSessionVenue({
            resourceLabel: session.resourceLabel,
            resourceNumber: session.resourceNumber,
            resourceType: session.sport === 'tennis' ? 'court' : 'table',
          })

          return (
            <Card key={session.sessionId} data-testid="history-session-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {session.date} · {session.startTime}–{session.endTime} · {venue}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {session.className || 'Lektion'} · {session.summary.present} närvarande,{' '}
                  {session.summary.absent} frånvarande, {session.summary.unknown} okänd
                </p>
              </CardHeader>
              {session.players.length > 0 && (
                <CardContent className="pt-0">
                  <ul className="space-y-1 text-sm">
                    {session.players.map((player) => (
                      <li key={player.id} className="flex justify-between gap-2">
                        <span>{player.name}</span>
                        <span className="text-muted-foreground">
                          {STATUS_LABELS[player.status] || player.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
