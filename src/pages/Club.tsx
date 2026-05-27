import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { ChevronDown, ChevronUp, FileUp, Settings2 } from 'lucide-react'
import { ClubAttendanceSection } from '@/pages/club/ClubAttendanceSection'
import { ClubDayPanel } from '@/pages/club/ClubDayPanel'
import { ClubPdfImportPanel } from '@/pages/club/ClubPdfImportPanel'
import { ClubSettingsPanel } from '@/pages/club/ClubSettingsPanel'
import type { ClubLesson, ClubPayload, LessonSport, LocalLessonDraft } from '@/pages/club/clubTypes'
import { normalizeClubPayload, WEEKDAYS } from '@/pages/club/clubTypes'
import {
  invalidateClubScheduleCache,
  readClubScheduleCache,
  writeClubScheduleCache,
} from '@/lib/clubScheduleCache'

function newLocalId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function ClubScheduleLoading({ showSlowMessage }: { showSlowMessage: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <LoadingSpinner size="lg" />
      <p className="text-sm font-medium text-foreground">Laddar klubben…</p>
      {showSlowMessage && (
        <p className="max-w-md text-center text-sm text-muted-foreground">
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
  const [activeWeekday, setActiveWeekday] = useState(1)
  const [activeSport, setActiveSport] = useState<LessonSport>('tennis')
  const [settingsOpen, setSettingsOpen] = useState(false)
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
        },
        { background: true }
      )

      setDraftsByWeekday((prev) => ({
        ...prev,
        [activeWeekday]: (prev[activeWeekday] || []).filter((item) => item.localId !== localId),
      }))
      toast({ title: 'Lektion sparad' })
    } finally {
      setIsSavingLesson(false)
    }
  }

  function patchLessonInState(
    lessonId: number,
    weekday: number,
    patch: Partial<ClubLesson> & { playerNames?: string[] }
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

  function scheduleLessonSave(lesson: ClubLesson, patch: Partial<ClubLesson> & { playerNames?: string[] }) {
    if (saveLessonTimeoutRef.current) {
      clearTimeout(saveLessonTimeoutRef.current)
    }

    const nextStart = patch.startTime ?? lesson.startTime
    const nextDuration = patch.durationMinutes ?? lesson.durationMinutes
    const nextResource = patch.resourceId ?? lesson.resourceId
    const nextCoachIds = patch.coachIds ?? lesson.coachIds
    const nextPlayers =
      patch.playerNames ?? lesson.players.map((player) => player.name)

    patchLessonInState(lesson.id, lesson.weekday, {
      startTime: nextStart,
      durationMinutes: nextDuration,
      resourceId: nextResource,
      coachIds: nextCoachIds,
      playerNames: nextPlayers,
    })

    saveLessonTimeoutRef.current = setTimeout(() => {
      void (async () => {
        setIsSavingLesson(true)
        try {
          await postClubAdmin(
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
            },
            { background: true }
          )
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
    toast({ title: 'Lektion borttagen' })
  }

  if (!isSignedIn || (user && !user.hasClubAccess)) {
    return null
  }

  if (!canManageClub) {
    return (
      <div className="min-h-screen flex-1 bg-background p-4 md:p-6">
        <div className="container mx-auto max-w-3xl space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight">Närvaro</h1>
          <ClubAttendanceSection isBoss={false} />
        </div>
      </div>
    )
  }

  const activeDayLabel = WEEKDAYS.find((day) => day.value === activeWeekday)?.label || ''

  if (isInitialClubLoad) {
    return (
      <div className="min-h-screen flex-1 bg-background p-4 md:p-6">
        <div className="container mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Klubbschema</h1>
            <p className="mt-1 text-sm text-muted-foreground">Veckoschema och inställningar.</p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <ClubScheduleLoading showSlowMessage={showSlowLoadHint} />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex-1 bg-background p-4 md:p-6">
      <div className="container mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Klubbschema</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {clubMainTab === 'schedule'
                ? `Planera ${activeSportLabel.toLowerCase()} per veckodag.`
                : 'Närvaro, historik och ändringar per dag.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {clubMainTab === 'schedule' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setImportOpen((open) => !open)}
              >
                <FileUp className="h-4 w-4" />
                Importera PDF
                {importOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
            <Button
              type="button"
              variant={settingsOpen ? 'secondary' : 'outline'}
              size="sm"
              className="gap-2"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <Settings2 className="h-4 w-4" />
              Inställningar
              {settingsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          <Button
            type="button"
            size="sm"
            variant={clubMainTab === 'schedule' ? 'default' : 'outline'}
            onClick={() => setClubMainTab('schedule')}
          >
            Veckoschema
          </Button>
          <Button
            type="button"
            size="sm"
            variant={clubMainTab === 'attendance' ? 'default' : 'outline'}
            onClick={() => setClubMainTab('attendance')}
          >
            Närvaro
          </Button>
        </div>

        {clubMainTab === 'schedule' && importOpen && data && (
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

        {clubMainTab === 'attendance' && <ClubAttendanceSection isBoss />}

        {clubMainTab === 'schedule' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Veckoschema</CardTitle>
            <CardDescription>
              Välj sport och dag — du ser bara lektioner för vald sport.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 border-b border-border pb-3">
              {tennisEnabled && (
                <Button
                  type="button"
                  size="sm"
                  variant={activeSport === 'tennis' ? 'default' : 'outline'}
                  onClick={() => setActiveSport('tennis')}
                >
                  Tennis
                </Button>
              )}
              {bordtennisEnabled && (
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

            {!tennisEnabled && !bordtennisEnabled ? (
              <p className="text-sm text-muted-foreground">
                Öppna Inställningar och aktivera tennis eller bordtennis för att börja planera.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <Button
                      key={day.value}
                      type="button"
                      size="sm"
                      variant={activeWeekday === day.value ? 'default' : 'outline'}
                      onClick={() => setActiveWeekday(day.value)}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>

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
                  <p className="text-sm text-muted-foreground">
                    {activeSportLabel} är inte aktiverat. Slå på det under Inställningar.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  )
}
