import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { FileUp, Loader2, Sparkles } from 'lucide-react'
import { apiRequest } from '@/services/api'
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
import {
  buildAiReviewPayload,
  type AiScheduleReviewResult,
} from './scheduleImportAiReview'

type Props = {
  data: ClubPayload
  isBusy: boolean
  onImport: (body: Record<string, unknown>) => Promise<{ importedCount?: number; skippedCount?: number }>
  onImportComplete?: () => Promise<void>
}

const IMPORT_BATCH_SIZE = 40

// Flip to true when OpenAI is wired on club-admin and ready to use.
const AI_REVIEW_ENABLED = false

const WEEKDAY_LABEL = Object.fromEntries(WEEKDAYS.map((day) => [day.value, day.label]))

export function ClubPdfImportPanel({ data, isBusy, onImport, onImportComplete }: Props) {
  const { toast } = useToast()
  const [preview, setPreview] = useState<PdfImportPreview | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [replaceTennis, setReplaceTennis] = useState(true)
  const [replaceBordtennis, setReplaceBordtennis] = useState(true)
  const [createMissingCoaches, setCreateMissingCoaches] = useState(true)
  const [createMissingResources, setCreateMissingResources] = useState(true)
  const [filterSport, setFilterSport] = useState<'all' | LessonSport>('all')
  const [aiReview, setAiReview] = useState<AiScheduleReviewResult | null>(null)
  const [isAiReviewing, setIsAiReviewing] = useState(false)

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
      setAiReview(null)
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

  async function handleAiReview() {
    if (!preview) return
    setIsAiReviewing(true)
    setAiReview(null)
    try {
      const raw = await apiRequest<Partial<AiScheduleReviewResult>>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'review_schedule_import',
          review: buildAiReviewPayload(preview),
        }),
      })

      // Old club-admin builds fall through to the club payload — reject that shape.
      const verdict = raw?.verdict
      if (verdict !== 'ok' && verdict !== 'needs_review' && verdict !== 'likely_broken') {
        throw new Error(
          'Servern svarade utan AI-resultat. Deploya club-admin Lambda och kör set-lambda-env med OPENAI_API_KEY.'
        )
      }

      const result: AiScheduleReviewResult = {
        verdict,
        summary: String(raw.summary || '').trim() || 'Ingen sammanfattning.',
        issues: Array.isArray(raw.issues) ? raw.issues.map(String).filter(Boolean) : [],
        suggestions: Array.isArray(raw.suggestions)
          ? raw.suggestions.map(String).filter(Boolean)
          : [],
        model: String(raw.model || ''),
      }

      setAiReview(result)
      toast({
        title:
          result.verdict === 'ok'
            ? 'AI: ser OK ut'
            : result.verdict === 'likely_broken'
              ? 'AI: troligen trasigt'
              : 'AI: granska vidare',
        description: result.summary,
        variant: result.verdict === 'likely_broken' ? 'destructive' : 'default',
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'AI-granskning misslyckades',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsAiReviewing(false)
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
      const payload = buildImportPayload(readyLessons)
      const batchCount = Math.ceil(payload.length / IMPORT_BATCH_SIZE)
      let totalImported = 0
      let totalSkipped = 0

      for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
        const batchStart = batchIndex * IMPORT_BATCH_SIZE
        const batchLessons = payload.slice(batchStart, batchStart + IMPORT_BATCH_SIZE)

        if (batchCount > 1) {
          toast({
            title: 'Importerar…',
            description: `Batch ${batchIndex + 1} av ${batchCount} (${batchLessons.length} lektioner)`,
          })
        }

        const result = await onImport({
          operation: 'import_schedule',
          replaceSports: batchIndex === 0 ? replaceSports : [],
          createMissingCoaches,
          createMissingResources,
          lessons: batchLessons,
        })

        totalImported += result.importedCount ?? batchLessons.length
        totalSkipped += result.skippedCount ?? 0
      }

      if (onImportComplete) {
        await onImportComplete()
      }

      setPreview(null)
      setAiReview(null)
      toast({
        title: 'Import klar',
        description: `${totalImported} lektioner importerade${
          totalSkipped ? ` (${totalSkipped} hoppades över)` : ''
        }.`,
      })
    } catch {
      // onImport visar toast
    } finally {
      setIsImporting(false)
    }
  }

  const coachOptions = data.coaches

  return (
    <div className="space-y-4">
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

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`gap-2 ${AI_REVIEW_ENABLED ? '' : 'opacity-50'}`}
                disabled={!AI_REVIEW_ENABLED || isAiReviewing || isImporting || isBusy}
                onClick={() => {
                  if (!AI_REVIEW_ENABLED) return
                  void handleAiReview()
                }}
                title={
                  AI_REVIEW_ENABLED
                    ? undefined
                    : 'AI-granskning är tillfälligt avstängd'
                }
                data-testid="pdf-ai-review-button"
              >
                {isAiReviewing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isAiReviewing ? 'AI granskar…' : 'Granska med AI'}
              </Button>
              <p className="text-xs text-muted-foreground">
                {AI_REVIEW_ENABLED
                  ? 'Valfritt: AI kollar om parse-resultatet ser rimligt ut (importerar inte).'
                  : 'AI-granskning är tillfälligt otillgänglig.'}
              </p>
            </div>

            {aiReview && (
              <div
                className={`rounded-lg border p-3 text-sm space-y-2 ${
                  aiReview.verdict === 'ok'
                    ? 'border-green-600/40 bg-green-500/10'
                    : aiReview.verdict === 'likely_broken'
                      ? 'border-destructive/40 bg-destructive/10'
                      : 'border-amber-500/40 bg-amber-500/10'
                }`}
                data-testid="pdf-ai-review-result"
              >
                <p className="font-medium">
                  AI-bedömning:{' '}
                  {aiReview.verdict === 'ok'
                    ? 'OK'
                    : aiReview.verdict === 'likely_broken'
                      ? 'Troligen trasigt'
                      : 'Behöver granskas'}
                </p>
                <p>{aiReview.summary}</p>
                {(aiReview.issues?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Problem
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {aiReview.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(aiReview.suggestions?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Förslag
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {aiReview.suggestions.map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiReview.model ? (
                  <p className="text-xs text-muted-foreground">Modell: {aiReview.model}</p>
                ) : null}
              </div>
            )}

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
    </div>
  )
}
