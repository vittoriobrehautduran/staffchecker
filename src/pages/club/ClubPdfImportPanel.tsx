import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { FileUp, Loader2 } from 'lucide-react'
import type { ClubPayload, LessonSport } from './clubTypes'
import { WEEKDAYS } from './clubTypes'
import {
  buildImportPayload,
  buildUnknownCoachPatch,
  enrichPdfPreview,
  parseSchedulePdf,
  UNKNOWN_COACH_NAME,
  type PdfImportLesson,
  type PdfImportPreview,
} from './pdfScheduleImport'

type Props = {
  data: ClubPayload
  isBusy: boolean
  onImport: (body: Record<string, unknown>) => Promise<{ importedCount?: number }>
}

const WEEKDAY_LABEL = Object.fromEntries(WEEKDAYS.map((day) => [day.value, day.label]))

export function ClubPdfImportPanel({ data, isBusy, onImport }: Props) {
  const { toast } = useToast()
  const [preview, setPreview] = useState<PdfImportPreview | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [replaceTennis, setReplaceTennis] = useState(true)
  const [replaceBordtennis, setReplaceBordtennis] = useState(true)
  const [createMissingCoaches, setCreateMissingCoaches] = useState(true)
  const [createMissingResources, setCreateMissingResources] = useState(true)
  const [filterSport, setFilterSport] = useState<'all' | LessonSport>('all')

  const includedCount = useMemo(
    () => preview?.lessons.filter((lesson) => lesson.included).length ?? 0,
    [preview]
  )

  const visibleLessons = useMemo(() => {
    if (!preview) return []
    if (filterSport === 'all') return preview.lessons
    return preview.lessons.filter((lesson) => lesson.sport === filterSport)
  }, [preview, filterSport])

  async function handleFileChange(file: File | null) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: 'Ogiltig fil',
        description: 'Välj en PDF-fil.',
        variant: 'destructive',
      })
      return
    }

    setIsParsing(true)
    try {
      const parsed = await parseSchedulePdf(file, data.club.default_slot_duration_minutes)
      const enriched = enrichPdfPreview(parsed, data)
      setPreview(enriched)
      toast({
        title: 'PDF analyserad',
        description: `${enriched.lessons.length} lektioner från ${enriched.pagesProcessed} sidor.`,
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte läsa PDF',
        description: err?.message || 'Okänt fel',
        variant: 'destructive',
      })
      setPreview(null)
    } finally {
      setIsParsing(false)
    }
  }

  function updateLesson(tempId: string, patch: Partial<PdfImportLesson>) {
    if (!preview) return
    setPreview({
      ...preview,
      lessons: preview.lessons.map((lesson) =>
        lesson.tempId === tempId ? { ...lesson, ...patch } : lesson
      ),
    })
  }

  function setAllIncluded(included: boolean) {
    if (!preview) return
    setPreview({
      ...preview,
      lessons: preview.lessons.map((lesson) => ({ ...lesson, included })),
    })
  }

  async function handleImport() {
    if (!preview) return

    const readyLessons = preview.lessons.filter(
      (lesson) =>
        lesson.included &&
        lesson.resourceId &&
        (lesson.coachId || (createMissingCoaches && lesson.coachName))
    )

    const notReady = preview.lessons.filter((lesson) => lesson.included).length - readyLessons.length
    if (notReady > 0) {
      toast({
        title: 'Kan inte importera alla valda',
        description: `${notReady} lektion(er) saknar tränare eller bana. Justera eller avmarkera dem.`,
        variant: 'destructive',
      })
      return
    }

    if (readyLessons.length === 0) {
      toast({
        title: 'Inget att importera',
        description: 'Markera minst en komplett lektion.',
        variant: 'destructive',
      })
      return
    }

    const replaceSports: LessonSport[] = []
    if (replaceTennis) replaceSports.push('tennis')
    if (replaceBordtennis) replaceSports.push('bordtennis')

    setIsImporting(true)
    try {
      const result = await onImport({
        operation: 'import_schedule',
        replaceSports,
        createMissingCoaches,
        createMissingResources,
        lessons: buildImportPayload(readyLessons),
      })
      setPreview(null)
      toast({
        title: 'Import klar',
        description: `${result.importedCount ?? readyLessons.length} lektioner importerade.`,
      })
    } catch {
      // onImport visar toast
    } finally {
      setIsImporting(false)
    }
  }

  const coachOptions = data.coaches

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Importera schema från PDF</CardTitle>
        <CardDescription>
          Ladda upp klubbens PDF (t.ex. 35 sidor). Programmet grupperar spelare till lektioner per
          tränare, dag, tid och bana. Granska innan du importerar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="club-pdf-upload">PDF-fil</Label>
            <input
              id="club-pdf-upload"
              type="file"
              accept="application/pdf,.pdf"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
              disabled={isParsing || isBusy}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                void handleFileChange(file)
                event.target.value = ''
              }}
            />
          </div>
          {isParsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Läser PDF…
            </div>
          )}
        </div>

        {preview && (
          <>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p>
                <strong>{preview.pagesProcessed}</strong> sidor ·{' '}
                <strong>{preview.linesParsed}</strong> rader ·{' '}
                <strong>{preview.lessons.length}</strong> lektioner ·{' '}
                <strong>{preview.coaches.length}</strong> tränare
              </p>
              {preview.warnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800 dark:text-amber-200">
                  {preview.warnings.slice(0, 8).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                  {preview.warnings.length > 8 && (
                    <li>…och {preview.warnings.length - 8} till</li>
                  )}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={replaceTennis}
                  onChange={(event) => setReplaceTennis(event.target.checked)}
                />
                Ersätt befintliga tennislektioner
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={replaceBordtennis}
                  onChange={(event) => setReplaceBordtennis(event.target.checked)}
                />
                Ersätt befintliga bordtennislektioner
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createMissingCoaches}
                  onChange={(event) => setCreateMissingCoaches(event.target.checked)}
                />
                Skapa saknade tränare
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createMissingResources}
                  onChange={(event) => setCreateMissingResources(event.target.checked)}
                />
                Skapa saknade banor/bord
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setAllIncluded(true)}>
                Markera alla
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAllIncluded(false)}>
                Avmarkera alla
              </Button>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={filterSport}
                onChange={(event) => setFilterSport(event.target.value as 'all' | LessonSport)}
              >
                <option value="all">Alla sporter</option>
                <option value="tennis">Tennis</option>
                <option value="bordtennis">Bordtennis</option>
              </select>
              <span className="text-sm text-muted-foreground">
                {includedCount} av {preview.lessons.length} valda för import
              </span>
            </div>

            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {visibleLessons.map((lesson) => (
                <div
                  key={lesson.tempId}
                  className={`rounded-lg border p-3 text-sm ${lesson.status === 'needs_review' ? 'border-amber-400/60' : ''}`}
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <input
                      type="checkbox"
                      checked={lesson.included}
                      onChange={(event) =>
                        updateLesson(lesson.tempId, { included: event.target.checked })
                      }
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="font-medium">
                        {WEEKDAY_LABEL[lesson.weekday]} {lesson.startTime} · {lesson.venueRaw} ·{' '}
                        {lesson.sport} · {lesson.players.length} spelare
                      </p>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Tränare</Label>
                          <Select
                            value={
                              lesson.coachId
                                ? String(lesson.coachId)
                                : lesson.coachName?.trim().toLowerCase() === UNKNOWN_COACH_NAME
                                  ? '__unknown__'
                                  : undefined
                            }
                            onValueChange={(value) => {
                              if (value === '__unknown__') {
                                updateLesson(
                                  lesson.tempId,
                                  buildUnknownCoachPatch(lesson, data.coaches)
                                )
                                return
                              }

                              const coachId = Number(value)
                              const coach = coachOptions.find((item) => item.id === coachId)
                              updateLesson(lesson.tempId, {
                                coachId,
                                coachName: coach?.name ?? lesson.coachName,
                                status: lesson.resourceId ? 'ready' : 'needs_review',
                              })
                            }}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={lesson.coachName || 'Välj tränare'} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unknown__">{UNKNOWN_COACH_NAME} (okänd)</SelectItem>
                              {coachOptions
                                .filter(
                                  (coach) =>
                                    coach.sport === lesson.sport || coach.sport === 'both'
                                )
                                .map((coach) => (
                                  <SelectItem key={coach.id} value={String(coach.id)}>
                                    {coach.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Bana / bord</Label>
                          <Select
                            value={lesson.resourceId ? String(lesson.resourceId) : undefined}
                            onValueChange={(value) => {
                              updateLesson(lesson.tempId, {
                                resourceId: Number(value),
                                status: 'ready',
                              })
                            }}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={lesson.venueRaw} />
                            </SelectTrigger>
                            <SelectContent>
                              {data.resources
                                .filter((resource) =>
                                  lesson.sport === 'tennis'
                                    ? resource.resource_type === 'court'
                                    : resource.resource_type === 'table'
                                )
                                .map((resource) => (
                                  <SelectItem key={resource.id} value={String(resource.id)}>
                                    {resource.label?.trim() ||
                                      `${lesson.sport === 'tennis' ? 'Bana' : 'Bord'} ${resource.resource_number}`}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {lesson.players
                          .slice(0, 6)
                          .map((player) => player.name)
                          .join(', ')}
                        {lesson.players.length > 6
                          ? ` … +${lesson.players.length - 6}`
                          : ''}
                      </p>

                      {lesson.warnings.length > 0 && (
                        <ul className="text-xs text-amber-800 dark:text-amber-200">
                          {lesson.warnings.map((warning) => (
                            <li key={warning}>• {warning}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              className="gap-2"
              disabled={isImporting || isBusy || includedCount === 0}
              onClick={() => void handleImport()}
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              Importera {includedCount} lektioner
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
