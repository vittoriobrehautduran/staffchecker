import { useCallback, useEffect, useRef, useState } from 'react'
import { apiConditionalGet, apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { ClubAttendanceDayView } from '@/pages/club/ClubAttendanceDayView'
import { ClubChangesPanel } from '@/pages/club/ClubChangesPanel'
import { ClubAttendanceHistoryPanel } from '@/pages/club/ClubAttendanceHistoryPanel'
import type {
  AttendanceStatus,
  AttendanceHistorySession,
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
import { attendanceErrorMessage } from '@/lib/apiErrors'
import { exportDayToCsv } from '@/pages/club/attendanceExport'
import { ClubSegmentedControl, ClubSoftPanel } from '@/pages/club/clubUi'

type BossPanel = 'day' | 'changes' | 'history'

// How often we check for other coaches' changes. ETag keeps idle polls cheap.
// True push (sub-second) would need WebSocket — see plan for chat/realtime later.
const ATTENDANCE_POLL_MS = 2_000
// Batch rapid checkbox clicks into one save per lesson.
const ATTENDANCE_FLUSH_MS = 450

type Props = {
  isBoss: boolean
  clubName?: string
}

export function ClubAttendanceSection({ isBoss, clubName }: Props) {
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

  const [isExportingDay, setIsExportingDay] = useState(false)

  const pendingAttendanceRef = useRef<Map<number, Map<number, AttendanceStatus>>>(new Map())
  // Keeps optimistic marks visible while the save request is in flight (pending is cleared at send).
  const attendanceInFlightRef = useRef<Map<number, Map<number, AttendanceStatus>>>(new Map())
  const attendanceFlushTimerRef = useRef<Map<number, number>>(new Map())
  const attendanceFlushInFlightRef = useRef<Set<number>>(new Set())
  const selectedDateRef = useRef(selectedDate)
  const loadDayRequestRef = useRef(0)

  useEffect(() => {
    selectedDateRef.current = selectedDate
  }, [selectedDate])

  // Re-apply local clicks on top of any server/cached payload so polls can't flash the old status.
  const overlayLocalAttendance = useCallback((payload: DayPayload): DayPayload => {
    let next = payload
    const applyMap = (outer: Map<number, Map<number, AttendanceStatus>>) => {
      for (const [sessionId, players] of outer) {
        for (const [sessionPlayerId, status] of players) {
          next = patchSessionPlayerAttendance(next, sessionId, sessionPlayerId, status)
        }
      }
    }
    applyMap(pendingAttendanceRef.current)
    applyMap(attendanceInFlightRef.current)
    return next
  }, [])

  const hasLocalAttendanceEdits = useCallback(() => {
    if (attendanceFlushInFlightRef.current.size > 0) return true
    if (attendanceFlushTimerRef.current.size > 0) return true
    for (const players of pendingAttendanceRef.current.values()) {
      if (players.size > 0) return true
    }
    for (const players of attendanceInFlightRef.current.values()) {
      if (players.size > 0) return true
    }
    return false
  }, [])

  const applyDayPayload = useCallback(
    (payload: DayPayload, version?: string | null) => {
      const withLocal = overlayLocalAttendance(payload)
      const resolvedVersion = version ?? withLocal.version ?? null
      writeAttendanceDayCache(withLocal, resolvedVersion)

      if (withLocal.date !== selectedDateRef.current) {
        return
      }

      setDayPayload((current) => {
        if (!current || current.date !== withLocal.date) {
          return withLocal
        }
        return mergeAttendanceDayPayload(current, withLocal)
      })
    },
    [overlayLocalAttendance]
  )

  const loadDay = useCallback(
    async (date: string, options?: { background?: boolean; silent?: boolean }) => {
      const requestId = ++loadDayRequestRef.current
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

        if (requestId !== loadDayRequestRef.current) return

        if (result.unchanged) {
          if (result.version && cached) {
            writeAttendanceDayCache(overlayLocalAttendance(cached), result.version)
          }
          // Keep current React state — rewriting from cache can fight an in-progress click.
          return
        }

        if (options?.background && options.silent) {
          setIsRefreshingDay(true)
        }
        applyDayPayload(result.data, result.version)
      } catch (error: unknown) {
        if (requestId !== loadDayRequestRef.current) return
        if (!options?.background || !cached) {
          const { title, description } = attendanceErrorMessage(error, 'load')
          toast({
            title,
            description,
            variant: 'destructive',
          })
        }
      } finally {
        if (requestId === loadDayRequestRef.current) {
          setIsLoadingDay(false)
          setIsRefreshingDay(false)
        }
      }
    },
    [applyDayPayload, overlayLocalAttendance, toast]
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
      // Don't pull server state over marks that haven't finished saving yet.
      if (hasLocalAttendanceEdits()) return
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
  }, [isBoss, bossPanel, selectedDate, loadDay, hasLocalAttendanceEdits])

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

      // Move to in-flight so polls keep showing the clicked status until the server catches up.
      let inFlight = attendanceInFlightRef.current.get(sessionId)
      if (!inFlight) {
        inFlight = new Map()
        attendanceInFlightRef.current.set(sessionId, inFlight)
      }
      for (const row of attendance) {
        inFlight.set(row.sessionPlayerId, row.status)
      }
      pendingForSession.clear()

      const saveForDate = selectedDateRef.current

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

        for (const row of attendance) {
          if (inFlight.get(row.sessionPlayerId) === row.status) {
            inFlight.delete(row.sessionPlayerId)
          }
        }
        if (inFlight.size === 0) {
          attendanceInFlightRef.current.delete(sessionId)
        }

        applyDayPayload(payload, payload.version)
        if (isBoss && bossPanel === 'changes') {
          invalidateClubChangesCache()
          void loadChanges({ background: true })
        }
      } catch (error: unknown) {
        for (const row of attendance) {
          if (inFlight.get(row.sessionPlayerId) === row.status) {
            inFlight.delete(row.sessionPlayerId)
          }
        }
        if (inFlight.size === 0) {
          attendanceInFlightRef.current.delete(sessionId)
        }

        if (saveForDate !== selectedDateRef.current) return
        const { title, description } = attendanceErrorMessage(error, 'save')
        toast({
          title,
          description,
          variant: 'destructive',
        })
        void loadDay(saveForDate, { background: true, silent: true })
      } finally {
        attendanceFlushInFlightRef.current.delete(sessionId)

        const stillPending = pendingAttendanceRef.current.get(sessionId)
        if (stillPending?.size) {
          void flushAttendanceForSession(sessionId)
        }
      }
    },
    [applyDayPayload, bossPanel, isBoss, loadChanges, loadDay, toast]
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

  const flushAllPendingAttendance = useCallback(() => {
    for (const timer of attendanceFlushTimerRef.current.values()) {
      window.clearTimeout(timer)
    }
    attendanceFlushTimerRef.current.clear()

    for (const sessionId of [...pendingAttendanceRef.current.keys()]) {
      void flushAttendanceForSession(sessionId)
    }
  }, [flushAttendanceForSession])

  const selectAttendanceDate = useCallback(
    (nextDate: string) => {
      if (!nextDate || nextDate === selectedDateRef.current) return

      flushAllPendingAttendance()
      loadDayRequestRef.current += 1
      selectedDateRef.current = nextDate
      setSelectedDate(nextDate)

      const cached = readAttendanceDayCache(nextDate)
      if (cached) {
        setDayPayload(cached)
        setIsLoadingDay(false)
      } else {
        setDayPayload(null)
        setIsLoadingDay(true)
      }
    },
    [flushAllPendingAttendance]
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
      const { title, description } = attendanceErrorMessage(error, 'save')
      toast({
        title,
        description,
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

  async function exportCurrentDayCsv() {
    setIsExportingDay(true)
    try {
      const result = await apiRequest<{
        fromDate: string
        toDate: string
        sessions: AttendanceHistorySession[]
      }>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'get_attendance_history',
          fromDate: selectedDate,
          toDate: selectedDate,
        }),
      })
      exportDayToCsv(result.sessions || [], selectedDate)
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte exportera',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsExportingDay(false)
    }
  }

  return (
    <div className="space-y-5">
      {isBoss && (
        <ClubSegmentedControl
          aria-label="Närvarovyer"
          fullWidth
          value={bossPanel}
          onChange={setBossPanel}
          options={[
            { value: 'day', label: 'Idag' },
            { value: 'changes', label: 'Ändringar' },
            { value: 'history', label: 'Historik', testId: 'attendance-history-tab' },
          ]}
        />
      )}

      {(bossPanel === 'day' || !isBoss) && (
        <ClubSoftPanel
          title="Närvaro"
          description="Markera närvaro och gör tillfälliga ändringar för en specifik dag — veckoschemat påverkas inte."
          actions={
            isBoss ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => void exportCurrentDayCsv()}
                disabled={isExportingDay || isLoadingDay}
                data-testid="attendance-export-day-csv"
              >
                {isExportingDay ? 'Exporterar…' : 'Exportera CSV'}
              </Button>
            ) : undefined
          }
        >
          <div className="space-y-5">
            {(isLoadingDay ||
              dayPayload?.tennisEnabled ||
              dayPayload?.bordtennisEnabled) && (
              <ClubSegmentedControl
                aria-label="Sport"
                fullWidth
                value={activeSport}
                onChange={setActiveSport}
                options={[
                  ...((isLoadingDay || dayPayload?.tennisEnabled)
                    ? [{ value: 'tennis' as const, label: 'Tennis' }]
                    : []),
                  ...((isLoadingDay || dayPayload?.bordtennisEnabled)
                    ? [{ value: 'bordtennis' as const, label: 'Bordtennis' }]
                    : []),
                ]}
              />
            )}

            <div className="max-w-xs space-y-2">
              <Label htmlFor="attendance-date">Datum</Label>
              <Input
                id="attendance-date"
                type="date"
                value={selectedDate}
                onChange={(event) => selectAttendanceDate(event.target.value)}
                data-testid="attendance-date-input"
                className="min-h-11"
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
          </div>
        </ClubSoftPanel>
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

      {isBoss && bossPanel === 'history' && (
        <ClubAttendanceHistoryPanel clubName={clubName} />
      )}
    </div>
  )
}
