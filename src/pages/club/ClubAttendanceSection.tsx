import { useCallback, useEffect, useRef, useState } from 'react'
import { apiConditionalGet, apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { ClubAttendanceDayView } from '@/pages/club/ClubAttendanceDayView'
import { ClubChangesPanel } from '@/pages/club/ClubChangesPanel'
import type {
  AttendanceStatus,
  AuditEntry,
  ClubNotification,
  DayPayload,
  LessonSport,
} from '@/pages/club/clubAttendanceTypes'
import { todayDateStr } from '@/pages/club/clubAttendanceTypes'
import {
  isAttendanceOnlyPatch,
  patchSessionPlayerAttendance,
} from '@/pages/club/clubAttendanceOptimistic'
import {
  mergeAttendanceDayPayload,
  readAttendanceDayCache,
  readAttendanceDayVersion,
  writeAttendanceDayCache,
} from '@/lib/clubAttendanceCache'
import {
  invalidateClubChangesCache,
  readClubChangesCache,
  writeClubChangesCache,
} from '@/lib/clubBossPanelsCache'

type BossPanel = 'day' | 'changes'

// How often we check for other coaches' changes. ETag keeps idle polls cheap.
// True push (sub-second) would need WebSocket — see plan for chat/realtime later.
const ATTENDANCE_POLL_MS = 2_000
// Batch rapid checkbox clicks into one save per lesson.
const ATTENDANCE_FLUSH_MS = 450

type Props = {
  isBoss: boolean
}

export function ClubAttendanceSection({ isBoss }: Props) {
  const { toast } = useToast()
  const [bossPanel, setBossPanel] = useState<BossPanel>('day')
  const [selectedDate, setSelectedDate] = useState(todayDateStr())
  const [dayPayload, setDayPayload] = useState<DayPayload | null>(() =>
    readAttendanceDayCache(todayDateStr())
  )
  const [isRefreshingDay, setIsRefreshingDay] = useState(false)
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [notifications, setNotifications] = useState<ClubNotification[]>([])
  const [isLoadingDay, setIsLoadingDay] = useState(() => !readAttendanceDayCache(todayDateStr()))
  const [isSavingSession, setIsSavingSession] = useState(false)
  const [isLoadingBossPanel, setIsLoadingBossPanel] = useState(false)
  const [isRefreshingBossPanel, setIsRefreshingBossPanel] = useState(false)
  const [activeSport, setActiveSport] = useState<LessonSport>('tennis')

  const pendingAttendanceRef = useRef<Map<number, Map<number, AttendanceStatus>>>(new Map())
  const attendanceFlushTimerRef = useRef<Map<number, number>>(new Map())
  const attendanceFlushInFlightRef = useRef<Set<number>>(new Set())

  const applyDayPayload = useCallback((payload: DayPayload, version?: string | null) => {
    setDayPayload((current) => {
      const resolvedVersion = version ?? payload.version ?? null
      if (!current || current.date !== payload.date) {
        writeAttendanceDayCache(payload, resolvedVersion)
        return payload
      }
      const merged = mergeAttendanceDayPayload(current, payload)
      writeAttendanceDayCache(merged, resolvedVersion ?? merged.version)
      return merged
    })
  }, [])

  const loadDay = useCallback(
    async (date: string, options?: { background?: boolean; silent?: boolean }) => {
      const cached = readAttendanceDayCache(date)
      const cachedVersion = readAttendanceDayVersion(date)
      const showBlockingLoader = !options?.background && !cached

      if (showBlockingLoader) {
        setIsLoadingDay(true)
      } else if (options?.background && !options.silent) {
        setIsRefreshingDay(true)
      }

      try {
        const result = await apiConditionalGet<DayPayload>(
          `/club-admin?date=${encodeURIComponent(date)}`,
          cachedVersion
        )

        if (result.unchanged) {
          if (result.version && cached) {
            writeAttendanceDayCache(cached, result.version)
          }
          return
        }

        if (options?.background && options.silent) {
          setIsRefreshingDay(true)
        }
        applyDayPayload(result.data, result.version)
      } catch (error: unknown) {
        const err = error as { message?: string }
        if (!options?.background || !cached) {
          toast({
            title: 'Kunde inte ladda närvaro',
            description: err?.message || 'Ett fel uppstod',
            variant: 'destructive',
          })
        }
      } finally {
        setIsLoadingDay(false)
        setIsRefreshingDay(false)
      }
    },
    [applyDayPayload, toast]
  )

  const loadChanges = useCallback(
    async (options?: { background?: boolean }) => {
      const cached = readClubChangesCache()
      const showBlockingLoader = !options?.background && !cached

      if (showBlockingLoader) {
        setIsLoadingBossPanel(true)
      } else if (options?.background) {
        setIsRefreshingBossPanel(true)
      }

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
        const entries = auditResult.entries || []
        const notifs = notificationResult.notifications || []
        setAuditEntries(entries)
        setNotifications(notifs)
        writeClubChangesCache(entries, notifs)
      } catch (error: unknown) {
        const err = error as { message?: string }
        if (!options?.background || !cached) {
          toast({
            title: 'Kunde inte ladda ändringar',
            description: err?.message || 'Ett fel uppstod',
            variant: 'destructive',
          })
        }
      } finally {
        setIsLoadingBossPanel(false)
        setIsRefreshingBossPanel(false)
      }
    },
    [toast]
  )

  useEffect(() => {
    const cached = readAttendanceDayCache(selectedDate)
    if (cached) {
      setDayPayload(cached)
      setIsLoadingDay(false)
      void loadDay(selectedDate, { background: true })
    } else {
      void loadDay(selectedDate)
    }
  }, [selectedDate, loadDay])

  const pollInFlightRef = useRef(false)

  // Poll while närvaro is open — other coaches' checkboxes update within a few seconds.
  useEffect(() => {
    const onDayPanel = !isBoss || bossPanel === 'day'
    if (!onDayPanel) return

    const poll = () => {
      if (document.visibilityState !== 'visible' || pollInFlightRef.current) return
      pollInFlightRef.current = true
      void loadDay(selectedDate, { background: true, silent: true }).finally(() => {
        pollInFlightRef.current = false
      })
    }

    const intervalId = window.setInterval(poll, ATTENDANCE_POLL_MS)
    const onVisibleAgain = () => {
      if (document.visibilityState === 'visible') poll()
    }
    window.addEventListener('focus', onVisibleAgain)
    document.addEventListener('visibilitychange', onVisibleAgain)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onVisibleAgain)
      document.removeEventListener('visibilitychange', onVisibleAgain)
    }
  }, [isBoss, bossPanel, selectedDate, loadDay])

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
    if (!isBoss || bossPanel !== 'changes') return
    const cached = readClubChangesCache()
    if (cached) {
      setAuditEntries(cached.auditEntries)
      setNotifications(cached.notifications)
      setIsLoadingBossPanel(false)
      void loadChanges({ background: true })
    } else {
      void loadChanges()
    }
  }, [isBoss, bossPanel, loadChanges])

  const flushAttendanceForSession = useCallback(
    async (sessionId: number) => {
      if (attendanceFlushInFlightRef.current.has(sessionId)) return

      const pendingForSession = pendingAttendanceRef.current.get(sessionId)
      if (!pendingForSession?.size) return

      const attendance = [...pendingForSession.entries()].map(([sessionPlayerId, status]) => ({
        sessionPlayerId,
        status,
      }))
      pendingForSession.clear()

      attendanceFlushInFlightRef.current.add(sessionId)
      try {
        const payload = await apiRequest<DayPayload>('/club-admin', {
          method: 'POST',
          body: JSON.stringify({
            operation: 'update_session',
            sessionId,
            attendance,
          }),
        })
        applyDayPayload(payload, payload.version)
        if (isBoss && bossPanel === 'changes') {
          invalidateClubChangesCache()
          void loadChanges({ background: true })
        }
      } catch (error: unknown) {
        const err = error as { message?: string }
        toast({
          title: 'Kunde inte spara närvaro',
          description: err?.message || 'Ett fel uppstod',
          variant: 'destructive',
        })
        void loadDay(selectedDate, { background: true, silent: true })
      } finally {
        attendanceFlushInFlightRef.current.delete(sessionId)

        const stillPending = pendingAttendanceRef.current.get(sessionId)
        if (stillPending?.size) {
          void flushAttendanceForSession(sessionId)
        }
      }
    },
    [applyDayPayload, bossPanel, isBoss, loadChanges, loadDay, selectedDate, toast]
  )

  const queueAttendanceSave = useCallback(
    (sessionId: number, sessionPlayerId: number, status: AttendanceStatus) => {
      setDayPayload((current) => {
        if (!current) return current
        const next = patchSessionPlayerAttendance(
          current,
          sessionId,
          sessionPlayerId,
          status
        )
        writeAttendanceDayCache(next, next.version)
        return next
      })

      let pendingForSession = pendingAttendanceRef.current.get(sessionId)
      if (!pendingForSession) {
        pendingForSession = new Map()
        pendingAttendanceRef.current.set(sessionId, pendingForSession)
      }
      pendingForSession.set(sessionPlayerId, status)

      const existingTimer = attendanceFlushTimerRef.current.get(sessionId)
      if (existingTimer) window.clearTimeout(existingTimer)

      attendanceFlushTimerRef.current.set(
        sessionId,
        window.setTimeout(() => {
          attendanceFlushTimerRef.current.delete(sessionId)
          void flushAttendanceForSession(sessionId)
        }, ATTENDANCE_FLUSH_MS)
      )
    },
    [flushAttendanceForSession]
  )

  useEffect(() => {
    return () => {
      for (const timer of attendanceFlushTimerRef.current.values()) {
        window.clearTimeout(timer)
      }
      attendanceFlushTimerRef.current.clear()
    }
  }, [])

  async function saveSession(
    sessionId: number,
    patch: {
      coachIds?: number[]
      players?: { sessionPlayerId?: number; name?: string; removed?: boolean }[]
      attendance?: { sessionPlayerId: number; status: AttendanceStatus }[]
    }
  ) {
    if (isAttendanceOnlyPatch(patch)) {
      for (const row of patch.attendance || []) {
        queueAttendanceSave(sessionId, row.sessionPlayerId, row.status)
      }
      return
    }

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
      applyDayPayload(payload, payload.version)
      if (isBoss && bossPanel === 'changes') {
        invalidateClubChangesCache()
        void loadChanges({ background: true })
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
      const notifs = result.notifications || []
      setNotifications(notifs)
      const cachedChanges = readClubChangesCache()
      if (cachedChanges) {
        writeClubChangesCache(cachedChanges.auditEntries, notifs)
      }
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
                onChange={(event) => {
                  const nextDate = event.target.value
                  setSelectedDate(nextDate)
                  const cached = readAttendanceDayCache(nextDate)
                  if (cached) {
                    setDayPayload(cached)
                    setIsLoadingDay(false)
                  } else {
                    setDayPayload(null)
                    setIsLoadingDay(true)
                  }
                }}
              />
              {isRefreshingDay && (
                <p className="text-xs text-muted-foreground">Uppdaterar i bakgrunden…</p>
              )}
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

      {isBoss && bossPanel === 'changes' && (
        <>
          {isRefreshingBossPanel && (
            <p className="text-xs text-muted-foreground">Uppdaterar i bakgrunden…</p>
          )}
          <ClubChangesPanel
            auditEntries={auditEntries}
            notifications={notifications}
            isLoading={isLoadingBossPanel}
            onMarkAllRead={() => void markAllNotificationsRead()}
          />
        </>
      )}
    </div>
  )
}
