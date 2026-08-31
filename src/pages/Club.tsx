import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { ChevronDown, ChevronUp, FileUp, Settings2, UserCog } from 'lucide-react'
import { ClubAttendanceSection } from '@/pages/club/ClubAttendanceSection'
import { ClubDayPanel } from '@/pages/club/ClubDayPanel'
import { ClubPdfImportPanel } from '@/pages/club/ClubPdfImportPanel'
import { ClubSettingsPanel } from '@/pages/club/ClubSettingsPanel'
import { ClubPermissionsPanel } from '@/pages/club/ClubPermissionsPanel'
import {
  ClubWeekDateNav,
  todayDateStrLocal,
  weekdayFromDateStr,
  addDaysToDateStr,
  mondayOfWeek,
} from '@/pages/club/ClubWeekDateNav'
import type { ClubLesson, ClubPayload, LessonSport, LocalLessonDraft } from '@/pages/club/clubTypes'
import { normalizeClubPayload, WEEKDAYS } from '@/pages/club/clubTypes'
import {
  invalidateClubScheduleCache,
  readClubScheduleCache,
  writeClubScheduleCache,
} from '@/lib/clubScheduleCache'
import {
  ClubEmptyState,
  ClubPageHeader,
  ClubPageShell,
  ClubSegmentedControl,
  ClubSoftPanel,
  ClubToolbarButton,
} from '@/pages/club/clubUi'
import { ClubSchedulePanelSkeleton } from '@/components/ui/page-skeletons'

function newLocalId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function ClubScheduleLoading({ showSlowMessage }: { showSlowMessage: boolean }) {
  return (
    <div className="space-y-4" role="status" aria-label="Laddar klubben">
      <ClubSchedulePanelSkeleton />
      {showSlowMessage && (
        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Hämtar veckoschema, tränare, banor och lektioner. Det kan ta några sekunder om schemat
          är stort.
        </p>
      )}
    </div>
  )
}

export default function Club() {
  const { isSignedIn, user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [data, setData] = useState<ClubPayload | null>(() => readClubScheduleCache())
  const [hasLoadedClub, setHasLoadedClub] = useState(() => !!readClubScheduleCache())
  const [showSlowLoadHint, setShowSlowLoadHint] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSavingLesson, setIsSavingLesson] = useState(false)
  const [activeWeekday, setActiveWeekday] = useState(() => weekdayFromDateStr(todayDateStrLocal()))
  const [scheduleDate, setScheduleDate] = useState(todayDateStrLocal)
  const [activeSport, setActiveSport] = useState<LessonSport>('tennis')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [clubMainTab, setClubMainTab] = useState<'schedule' | 'attendance'>('schedule')
  const [draftsByWeekday, setDraftsByWeekday] = useState<Record<number, LocalLessonDraft[]>>({})

  const [tennisEnabled, setTennisEnabled] = useState(false)
  const [bordtennisEnabled, setBordtennisEnabled] = useState(false)
  const [newCourtName, setNewCourtName] = useState('')
  const [newTableName, setNewTableName] = useState('')
  const [newCoachName, setNewCoachName] = useState('')
  const [newCoachSport, setNewCoachSport] = useState<'tennis' | 'bordtennis'>('tennis')

  const saveLessonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canManageClub = !!user?.hasClubBossAccess

  const applyPayload = useCallback((raw: ClubPayload) => {
    const payload = normalizeClubPayload(raw)
    setData(payload)
    writeClubScheduleCache(payload)
    setTennisEnabled(!!payload.club.tennis_enabled)
    setBordtennisEnabled(!!payload.club.bordtennis_enabled)
    setActiveSport((current) => {
      if (current === 'tennis' && payload.club.tennis_enabled) return 'tennis'
      if (current === 'bordtennis' && payload.club.bordtennis_enabled) return 'bordtennis'
      if (payload.club.tennis_enabled) return 'tennis'
      if (payload.club.bordtennis_enabled) return 'bordtennis'
      return current
    })
  }, [])

  useEffect(() => {
    if (activeSport === 'tennis' && !tennisEnabled && bordtennisEnabled) {
      setActiveSport('bordtennis')
    } else if (activeSport === 'bordtennis' && !bordtennisEnabled && tennisEnabled) {
      setActiveSport('tennis')
    }
  }, [tennisEnabled, bordtennisEnabled, activeSport])

  const loadClubData = useCallback(
    async (options?: { background?: boolean }) => {
      const hasCache = !!readClubScheduleCache()
      if (!options?.background && !hasCache) {
        setIsLoading(true)
      }
      try {
        const payload = await apiRequest<ClubPayload>('/club-admin', { method: 'GET' })
        applyPayload(payload)
      } catch (error: unknown) {
        const err = error as { message?: string }
        if (!options?.background || !hasCache) {
          toast({
            title: 'Kunde inte ladda klubb',
            description: err?.message || 'Ett fel uppstod',
            variant: 'destructive',
          })
        }
      } finally {
        setIsLoading(false)
        setHasLoadedClub(true)
      }
    },
    [applyPayload, toast]
  )

  const isInitialClubLoad = canManageClub && !hasLoadedClub && !readClubScheduleCache()

  useEffect(() => {
    if (!isInitialClubLoad) {
      setShowSlowLoadHint(false)
      return
    }
    const timer = window.setTimeout(() => setShowSlowLoadHint(true), 3000)
    return () => window.clearTimeout(timer)
  }, [isInitialClubLoad])

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/login')
      return
    }
    if (user && !user.hasClubAccess) {
      navigate('/dashboard', { replace: true })
      return
    }
    if (user?.hasClubBossAccess) {
      const cached = readClubScheduleCache()
      if (cached) {
        applyPayload(cached)
        setHasLoadedClub(true)
        void loadClubData({ background: true })
      } else {
        void loadClubData()
      }
    }
  }, [isSignedIn, user, navigate, loadClubData])

  async function postClubAdmin(
    body: Record<string, unknown>,
    options?: { background?: boolean }
  ) {
    if (!options?.background) {
      setIsLoading(true)
    }
    try {
      const payload = await apiRequest<ClubPayload>('/club-admin', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      applyPayload(payload)
      return payload
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte spara',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
      throw error
    } finally {
      if (!options?.background) {
        setIsLoading(false)
      }
    }
  }

  async function saveSettings() {
    await postClubAdmin({
      operation: 'update_club_settings',
      tennisEnabled,
      bordtennisEnabled,
    })
    toast({ title: 'Inställningar sparade' })
  }

  async function addCourt() {
    if (!newCourtName.trim()) return
    await postClubAdmin({
      operation: 'add_resource',
      resourceType: 'court',
      label: newCourtName.trim(),
    })
    setNewCourtName('')
    toast({ title: 'Bana tillagd' })
  }

  async function addTable() {
    if (!newTableName.trim()) return
    await postClubAdmin({
      operation: 'add_resource',
      resourceType: 'table',
      label: newTableName.trim(),
    })
    setNewTableName('')
    toast({ title: 'Bord tillagt' })
  }

  async function addCoach() {
    if (!newCoachName.trim()) return
    await postClubAdmin({
      operation: 'add_coach',
      name: newCoachName.trim(),
      sport: newCoachSport,
    })
    setNewCoachName('')
    toast({ title: 'Tränare tillagd' })
  }

  async function removeCoach(coachId: number) {
    await postClubAdmin({
      operation: 'delete_coach',
      coachId,
    })
    toast({ title: 'Tränare borttagen' })
  }

  async function clearClubSchedule(confirmPhrase: string) {
    try {
      invalidateClubScheduleCache()
      const result = await apiRequest<ClubPayload & { deletedCount?: number }>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'clear_schedule',
          confirmPhrase,
        }),
      })
      applyPayload(result)
      setDraftsByWeekday({})
      toast({
        title: 'Veckoschema rensat',
        description:
          result.deletedCount != null && result.deletedCount > 0
            ? `${result.deletedCount} lektioner togs bort.`
            : 'Schemat var redan tomt.',
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte rensa schema',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
      throw error
    }
  }

  const lessonsForDay = useMemo(() => {
    if (!data?.lessonsByWeekday) return []
    const dayLessons = data.lessonsByWeekday[String(activeWeekday)] ?? []
    return dayLessons.filter((lesson) => lesson.sport === activeSport)
  }, [data, activeWeekday, activeSport])

  const draftsForDay = useMemo(() => {
    return (draftsByWeekday[activeWeekday] || []).filter((draft) => draft.sport === activeSport)
  }, [draftsByWeekday, activeWeekday, activeSport])

  const activeSportLabel = activeSport === 'tennis' ? 'Tennis' : 'Bordtennis'
  const canPlanSchedule = activeSport === 'tennis' ? tennisEnabled : bordtennisEnabled

  function addLocalLesson() {
    const sport = activeSport
    const draft: LocalLessonDraft = {
      localId: newLocalId(),
      sport,
      startTime: '10:00',
      durationMinutes: 60,
      resourceId: 0,
      coachIds: [],
      playerNames: [''],
      className: '',
    }
    setDraftsByWeekday((prev) => ({
      ...prev,
      [activeWeekday]: [...(prev[activeWeekday] || []), draft],
    }))
  }

  async function saveDraftById(localId: string) {
    const draft = (draftsByWeekday[activeWeekday] || []).find((item) => item.localId === localId)
    if (!draft || draft.resourceId <= 0) return

    setIsSavingLesson(true)
    try {
      await postClubAdmin(
        {
          operation: 'add_lesson',
          weekday: activeWeekday,
          sport: draft.sport,
          startTime: draft.startTime,
          durationMinutes: draft.durationMinutes,
          resourceId: draft.resourceId,
          coachIds: draft.coachIds,
          playerNames: draft.playerNames.filter((name) => name.trim()),
          className: draft.className.trim() || undefined,
        },
        { background: true }
      )

      setDraftsByWeekday((prev) => ({
        ...prev,
        [activeWeekday]: (prev[activeWeekday] || []).filter((item) => item.localId !== localId),
      }))
      toast({ title: 'Klass sparad' })
    } finally {
      setIsSavingLesson(false)
    }
  }

  function patchLessonInState(
    lessonId: number,
    weekday: number,
    patch: Partial<ClubLesson> & { playerNames?: string[]; className?: string }
  ) {
    setData((prev) => {
      if (!prev) return prev
      const key = String(weekday)
      const list = prev.lessonsByWeekday[key] ?? []
      return {
        ...prev,
        lessonsByWeekday: {
          ...prev.lessonsByWeekday,
          [key]: list.map((lesson) => {
            if (lesson.id !== lessonId) return lesson
            return {
              ...lesson,
              ...patch,
              className:
                patch.className !== undefined ? patch.className : lesson.className,
              players: patch.playerNames
                ? patch.playerNames.map((name, index) => ({
                    id: lesson.players[index]?.id ?? 0,
                    name,
                  }))
                : lesson.players,
            }
          }),
        },
      }
    })
  }

  function updateDraft(localId: string, patch: Partial<LocalLessonDraft>) {
    setDraftsByWeekday((prev) => ({
      ...prev,
      [activeWeekday]: (prev[activeWeekday] || []).map((draft) =>
        draft.localId === localId ? { ...draft, ...patch } : draft
      ),
    }))
  }

  function removeDraft(localId: string) {
    setDraftsByWeekday((prev) => ({
      ...prev,
      [activeWeekday]: (prev[activeWeekday] || []).filter((draft) => draft.localId !== localId),
    }))
  }

  function scheduleLessonSave(
    lesson: ClubLesson,
    patch: Partial<ClubLesson> & { playerNames?: string[]; className?: string }
  ) {
    if (saveLessonTimeoutRef.current) {
      clearTimeout(saveLessonTimeoutRef.current)
    }

    const nextStart = patch.startTime ?? lesson.startTime
    const nextDuration = patch.durationMinutes ?? lesson.durationMinutes
    const nextResource = patch.resourceId ?? lesson.resourceId
    const nextCoachIds = patch.coachIds ?? lesson.coachIds
    const nextPlayers =
      patch.playerNames ?? lesson.players.map((player) => player.name)
    const nextClassName =
      patch.className !== undefined ? patch.className : lesson.className || ''

    // Always update local UI immediately (so empty "new player" fields stay visible).
    patchLessonInState(lesson.id, lesson.weekday, {
      startTime: nextStart,
      durationMinutes: nextDuration,
      resourceId: nextResource,
      coachIds: nextCoachIds,
      playerNames: nextPlayers,
      className: nextClassName,
    })

    // Don't hit the server just for adding/removing blank player slots — empty names
    // would be stripped on save and the reload would wipe the input.
    {
      const nextTrimmed = nextPlayers.map((name) => name.trim()).filter(Boolean)
      const prevTrimmed = lesson.players.map((player) => player.name.trim()).filter(Boolean)
      const sameNamedPlayers =
        nextTrimmed.length === prevTrimmed.length &&
        nextTrimmed.every((name, index) => name === prevTrimmed[index])
      const sameClassName = (nextClassName || '') === (lesson.className || '')
      const onlyEmptyPlayerSlotsChanged =
        sameNamedPlayers &&
        sameClassName &&
        nextStart === lesson.startTime &&
        nextDuration === lesson.durationMinutes &&
        nextResource === lesson.resourceId &&
        JSON.stringify(nextCoachIds) === JSON.stringify(lesson.coachIds)

      if (onlyEmptyPlayerSlotsChanged) {
        return
      }
    }

    saveLessonTimeoutRef.current = setTimeout(() => {
      void (async () => {
        setIsSavingLesson(true)
        try {
          const payload = await postClubAdmin(
            {
              operation: 'update_lesson',
              lessonId: lesson.id,
              weekday: lesson.weekday,
              sport: lesson.sport,
              startTime: nextStart,
              durationMinutes: nextDuration,
              resourceId: nextResource,
              coachIds: nextCoachIds,
              playerNames: nextPlayers.filter((name) => name.trim()),
              className: nextClassName.trim() || undefined,
            },
            { background: true }
          )

          // Keep any trailing empty input slots the user still has open after server reload.
          const emptySlots = nextPlayers.filter((name) => !name.trim()).length
          if (emptySlots > 0 && payload) {
            const saved = payload.lessonsByWeekday?.[String(lesson.weekday)]?.find(
              (row) => row.id === lesson.id
            )
            if (saved) {
              patchLessonInState(lesson.id, lesson.weekday, {
                playerNames: [
                  ...saved.players.map((player) => player.name),
                  ...Array.from({ length: emptySlots }, () => ''),
                ],
                className: saved.className || nextClassName,
              })
            }
          }
        } catch {
          void loadClubData()
        } finally {
          setIsSavingLesson(false)
        }
      })()
    }, 500)
  }

  async function deleteLesson(lessonId: number) {
    await postClubAdmin({ operation: 'delete_lesson', lessonId }, { background: true })
    toast({ title: 'Klass borttagen' })
  }

  if (!isSignedIn || (user && !user.hasClubAccess)) {
    return null
  }

  if (!canManageClub) {
    return (
      <ClubPageShell>
        <ClubPageHeader
          eyebrow="Klubb"
          title="Närvaro"
          description="Markera närvaro för dagens lektioner. Veckoschema och inställningar sköts av klubbens boss."
        />
        <ClubAttendanceSection isBoss={false} clubName={data?.club.name} />
      </ClubPageShell>
    )
  }

  const activeDayLabel = WEEKDAYS.find((day) => day.value === activeWeekday)?.label || ''
  const clubTitle = data?.club.name?.trim() || 'Klubbschema'

  if (isInitialClubLoad) {
    return (
      <ClubPageShell>
        <ClubPageHeader
          eyebrow="Klubb"
          title={clubTitle}
          description="Veckoschema, närvaro och behörigheter."
        />
        <ClubSoftPanel>
          <ClubScheduleLoading showSlowMessage={showSlowLoadHint} />
        </ClubSoftPanel>
      </ClubPageShell>
    )
  }

  return (
    <ClubPageShell>
      <ClubPageHeader
        eyebrow="Klubb"
        title={clubTitle}
        description={
          clubMainTab === 'schedule'
            ? `Planera ${activeSportLabel.toLowerCase()} per veckodag — samma lektioner varje vecka.`
            : 'Närvaro, historik och ändringar för en specifik dag.'
        }
        actions={
          <>
            {clubMainTab === 'schedule' && (
              <ClubToolbarButton
                active={importOpen}
                aria-expanded={importOpen}
                onClick={() => setImportOpen((open) => !open)}
              >
                <FileUp className="h-4 w-4" />
                Importera PDF
                {importOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </ClubToolbarButton>
            )}
            <ClubToolbarButton
              active={permissionsOpen}
              aria-expanded={permissionsOpen}
              testId="club-permissions-button"
              onClick={() => {
                setPermissionsOpen((open) => !open)
                if (!permissionsOpen) setSettingsOpen(false)
              }}
            >
              <UserCog className="h-4 w-4" />
              Behörigheter
              {permissionsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </ClubToolbarButton>
            <ClubToolbarButton
              active={settingsOpen}
              aria-expanded={settingsOpen}
              onClick={() => {
                setSettingsOpen((open) => !open)
                if (!settingsOpen) setPermissionsOpen(false)
              }}
            >
              <Settings2 className="h-4 w-4" />
              Inställningar
              {settingsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </ClubToolbarButton>
          </>
        }
      />

      <ClubSegmentedControl
        aria-label="Klubbvy"
        fullWidth
        value={clubMainTab}
        onChange={setClubMainTab}
        options={[
          { value: 'schedule', label: 'Veckoschema' },
          { value: 'attendance', label: 'Närvaro', testId: 'club-tab-attendance' },
        ]}
      />

      {clubMainTab === 'schedule' && importOpen && data && (
        <ClubSoftPanel
          title="Importera PDF"
          description="Läs in tennisskole-schema och granska innan du sparar."
        >
          <ClubPdfImportPanel
            data={data}
            isBusy={isLoading || isSavingLesson}
            onImport={async (body) => {
              return apiRequest<{ importedCount?: number; skippedCount?: number }>('/club-admin', {
                method: 'POST',
                body: JSON.stringify(body),
              })
            }}
            onImportComplete={loadClubData}
          />
        </ClubSoftPanel>
      )}

      {permissionsOpen && (
        <ClubSoftPanel
          title="Behörigheter"
          description="Ge appkonton tillgång till närvaro (tränare) eller hela klubben (boss)."
        >
          <ClubPermissionsPanel />
        </ClubSoftPanel>
      )}

      {settingsOpen && data && (
        <ClubSettingsPanel
          data={data}
          tennisEnabled={tennisEnabled}
          bordtennisEnabled={bordtennisEnabled}
          newCourtName={newCourtName}
          newTableName={newTableName}
          newCoachName={newCoachName}
          newCoachSport={newCoachSport}
          isSaving={isLoading}
          onTennisEnabledChange={setTennisEnabled}
          onBordtennisEnabledChange={setBordtennisEnabled}
          onNewCourtNameChange={setNewCourtName}
          onNewTableNameChange={setNewTableName}
          onNewCoachNameChange={setNewCoachName}
          onNewCoachSportChange={setNewCoachSport}
          onSaveSettings={saveSettings}
          onAddCourt={addCourt}
          onAddTable={addTable}
          onAddCoach={addCoach}
          onRemoveCoach={(coachId) => void removeCoach(coachId)}
          onClearSchedule={clearClubSchedule}
        />
      )}

      {clubMainTab === 'attendance' && (
        <ClubAttendanceSection isBoss clubName={data?.club.name} />
      )}

      {clubMainTab === 'schedule' && (
        <ClubSoftPanel
          title="Veckoschema"
          description="Välj sport och dag — du ser bara lektioner för vald sport."
        >
          {(tennisEnabled || bordtennisEnabled) && (
            <div className="mb-5">
              <ClubSegmentedControl
                aria-label="Sport"
                fullWidth
                value={
                  activeSport === 'bordtennis' && bordtennisEnabled
                    ? 'bordtennis'
                    : tennisEnabled
                      ? 'tennis'
                      : activeSport
                }
                onChange={setActiveSport}
                options={[
                  ...(tennisEnabled
                    ? [{ value: 'tennis' as const, label: 'Tennis' }]
                    : []),
                  ...(bordtennisEnabled
                    ? [{ value: 'bordtennis' as const, label: 'Bordtennis' }]
                    : []),
                ]}
              />
            </div>
          )}

          {!tennisEnabled && !bordtennisEnabled ? (
            <ClubEmptyState
              title="Ingen sport är aktiv"
              description="Öppna Inställningar och aktivera tennis eller bordtennis för att börja planera."
              action={
                <Button type="button" onClick={() => setSettingsOpen(true)}>
                  Öppna inställningar
                </Button>
              }
            />
          ) : (
            <div className="space-y-5">
              <ClubWeekDateNav
                selectedDate={scheduleDate}
                activeWeekday={activeWeekday}
                onSelectDate={(dateStr) => {
                  setScheduleDate(dateStr)
                  setActiveWeekday(weekdayFromDateStr(dateStr))
                }}
                onSelectWeekday={(weekday) => {
                  setActiveWeekday(weekday)
                  const weekMonday = mondayOfWeek(scheduleDate)
                  setScheduleDate(addDaysToDateStr(weekMonday, weekday - 1))
                }}
              />

              <p className="text-xs leading-relaxed text-muted-foreground">
                Du redigerar veckomallen för {activeDayLabel.toLowerCase()} — samma lektioner varje
                vecka. Använd kalendern för att hoppa mellan datum.
              </p>

              {data && canPlanSchedule ? (
                <ClubDayPanel
                  weekdayLabel={activeDayLabel}
                  sportLabel={activeSportLabel}
                  data={data}
                  lessons={lessonsForDay}
                  drafts={draftsForDay}
                  isLoading={isLoading}
                  isSavingLesson={isSavingLesson}
                  onAddLesson={addLocalLesson}
                  onUpdateLesson={(lesson, patch) => scheduleLessonSave(lesson, patch)}
                  onDeleteLesson={deleteLesson}
                  onUpdateDraft={updateDraft}
                  onSaveDraft={saveDraftById}
                  onRemoveDraft={removeDraft}
                />
              ) : (
                <ClubEmptyState
                  title={`${activeSportLabel} är avstängt`}
                  description="Slå på sporten under Inställningar för att planera klasser."
                  action={
                    <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
                      Öppna inställningar
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </ClubSoftPanel>
      )}
    </ClubPageShell>
  )
}
