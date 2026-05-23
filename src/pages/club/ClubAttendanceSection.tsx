import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { ClubAttendanceDayView } from '@/pages/club/ClubAttendanceDayView'
import { ClubAttendanceHistoryPanel } from '@/pages/club/ClubAttendanceHistoryPanel'
import { ClubChangesPanel } from '@/pages/club/ClubChangesPanel'
import type {
  AttendanceHistorySession,
  AttendanceStatus,
  AuditEntry,
  ClubNotification,
  DayPayload,
  LessonSport,
} from '@/pages/club/clubAttendanceTypes'
import { todayDateStr } from '@/pages/club/clubAttendanceTypes'

type BossPanel = 'day' | 'history' | 'changes'

type Props = {
  isBoss: boolean
}

export function ClubAttendanceSection({ isBoss }: Props) {
  const { toast } = useToast()
  const [bossPanel, setBossPanel] = useState<BossPanel>('day')
  const [selectedDate, setSelectedDate] = useState(todayDateStr())
  const [dayPayload, setDayPayload] = useState<DayPayload | null>(null)
  const [historySessions, setHistorySessions] = useState<AttendanceHistorySession[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [notifications, setNotifications] = useState<ClubNotification[]>([])
  const [isLoadingDay, setIsLoadingDay] = useState(false)
  const [isSavingSession, setIsSavingSession] = useState(false)
  const [isLoadingBossPanel, setIsLoadingBossPanel] = useState(false)
  const [activeSport, setActiveSport] = useState<LessonSport>('tennis')

  const loadDay = useCallback(
    async (date: string) => {
      setIsLoadingDay(true)
      try {
        const payload = await apiRequest<DayPayload>(`/club-admin?date=${encodeURIComponent(date)}`, {
          method: 'GET',
        })
        setDayPayload(payload)
      } catch (error: unknown) {
        const err = error as { message?: string }
        toast({
          title: 'Kunde inte ladda närvaro',
          description: err?.message || 'Ett fel uppstod',
          variant: 'destructive',
        })
      } finally {
        setIsLoadingDay(false)
      }
    },
    [toast]
  )

  const loadHistory = useCallback(async () => {
    setIsLoadingBossPanel(true)
    try {
      const result = await apiRequest<{ sessions: AttendanceHistorySession[] }>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({ operation: 'get_attendance_history' }),
      })
      setHistorySessions(result.sessions || [])
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte ladda historik',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingBossPanel(false)
    }
  }, [toast])

  const loadChanges = useCallback(async () => {
    setIsLoadingBossPanel(true)
    try {
      const [auditResult, notificationResult] = await Promise.all([
        apiRequest<{ entries: AuditEntry[] }>('/club-admin', {
          method: 'POST',
          body: JSON.stringify({ operation: 'get_audit_log' }),
        }),
        apiRequest<{ notifications: ClubNotification[] }>('/club-admin', {
          method: 'POST',
          body: JSON.stringify({ operation: 'get_notifications' }),
        }),
      ])
      setAuditEntries(auditResult.entries || [])
      setNotifications(notificationResult.notifications || [])
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte ladda ändringar',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingBossPanel(false)
    }
  }, [toast])

  useEffect(() => {
    void loadDay(selectedDate)
  }, [selectedDate, loadDay])

  useEffect(() => {
    if (!dayPayload) return
    if (activeSport === 'tennis' && dayPayload.tennisEnabled) return
    if (activeSport === 'bordtennis' && dayPayload.bordtennisEnabled) return
    if (dayPayload.tennisEnabled) {
      setActiveSport('tennis')
    } else if (dayPayload.bordtennisEnabled) {
      setActiveSport('bordtennis')
    }
  }, [dayPayload, activeSport])

  useEffect(() => {
    if (!isBoss) return
    if (bossPanel === 'history') void loadHistory()
    if (bossPanel === 'changes') void loadChanges()
  }, [isBoss, bossPanel, loadHistory, loadChanges])

  async function saveSession(
    sessionId: number,
    patch: {
      coachIds?: number[]
      players?: { sessionPlayerId?: number; name?: string; removed?: boolean }[]
      attendance?: { sessionPlayerId: number; status: AttendanceStatus }[]
    }
  ) {
    setIsSavingSession(true)
    try {
      const payload = await apiRequest<DayPayload>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'update_session',
          sessionId,
          ...patch,
        }),
      })
      setDayPayload(payload)
      if (isBoss && bossPanel === 'changes') {
        void loadChanges()
      }
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte spara',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsSavingSession(false)
    }
  }

  async function markAllNotificationsRead() {
    try {
      const result = await apiRequest<{ notifications: ClubNotification[] }>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({ operation: 'mark_notifications_read' }),
      })
      setNotifications(result.notifications || [])
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte markera som lästa',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-4">
      {isBoss && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={bossPanel === 'day' ? 'default' : 'outline'}
            onClick={() => setBossPanel('day')}
          >
            Närvaro idag
          </Button>
          <Button
            type="button"
            size="sm"
            variant={bossPanel === 'history' ? 'default' : 'outline'}
            onClick={() => setBossPanel('history')}
          >
            Historik (30 dagar)
          </Button>
          <Button
            type="button"
            size="sm"
            variant={bossPanel === 'changes' ? 'default' : 'outline'}
            onClick={() => setBossPanel('changes')}
          >
            Ändringar
          </Button>
        </div>
      )}

      {(bossPanel === 'day' || !isBoss) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Närvaro</CardTitle>
            <CardDescription>
              Markera närvaro och gör tillfälliga ändringar för en specifik dag — veckoschemat
              påverkas inte.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 border-b border-border pb-3">
              {(isLoadingDay || dayPayload?.tennisEnabled) && (
                <Button
                  type="button"
                  size="sm"
                  variant={activeSport === 'tennis' ? 'default' : 'outline'}
                  onClick={() => setActiveSport('tennis')}
                >
                  Tennis
                </Button>
              )}
              {(isLoadingDay || dayPayload?.bordtennisEnabled) && (
                <Button
                  type="button"
                  size="sm"
                  variant={activeSport === 'bordtennis' ? 'default' : 'outline'}
                  onClick={() => setActiveSport('bordtennis')}
                >
                  Bordtennis
                </Button>
              )}
            </div>

            <div className="max-w-xs space-y-2">
              <Label htmlFor="attendance-date">Datum</Label>
              <Input
                id="attendance-date"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </div>
            <ClubAttendanceDayView
              payload={dayPayload}
              activeSport={activeSport}
              isLoading={isLoadingDay}
              isSaving={isSavingSession}
              onSaveSession={saveSession}
            />
          </CardContent>
        </Card>
      )}

      {isBoss && bossPanel === 'history' && (
        <ClubAttendanceHistoryPanel sessions={historySessions} isLoading={isLoadingBossPanel} />
      )}

      {isBoss && bossPanel === 'changes' && (
        <ClubChangesPanel
          auditEntries={auditEntries}
          notifications={notifications}
          isLoading={isLoadingBossPanel}
          onMarkAllRead={() => void markAllNotificationsRead()}
        />
      )}
    </div>
  )
}
