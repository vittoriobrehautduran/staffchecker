import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { addMinutesToTime, buildTimeOptions, DURATION_OPTIONS } from './timeSlots'
import type { ClubLesson, ClubPayload, LessonSport, LocalLessonDraft } from './clubTypes'
import { ClubEmptyState } from './clubUi'
import {
  LessonTimeRange,
  ResourceVenueBadge,
  resourceVenueCardClassName,
} from './resourceVenueStyles'
import { cn } from '@/lib/utils'

const TIME_OPTIONS = buildTimeOptions(20)

type Props = {
  weekdayLabel: string
  sportLabel: string
  data: ClubPayload
  lessons: ClubLesson[]
  drafts: LocalLessonDraft[]
  isLoading: boolean
  onAddLesson: () => void
  onUpdateLesson: (
    lesson: ClubLesson,
    patch: Partial<ClubLesson> & { playerNames?: string[]; className?: string }
  ) => void
  onDeleteLesson: (lessonId: number) => void
  onUpdateDraft: (localId: string, patch: Partial<LocalLessonDraft>) => void
  onSaveDraft: (localId: string) => void
  onRemoveDraft: (localId: string) => void
  isSavingLesson?: boolean
}

export function ClubDayPanel({
  weekdayLabel,
  sportLabel,
  data,
  lessons,
  drafts,
  isLoading,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson,
  onUpdateDraft,
  onSaveDraft,
  onRemoveDraft,
  isSavingLesson = false,
}: Props) {
  const sortedLessons = [...lessons].sort((a, b) => a.startTime.localeCompare(b.startTime))

  return (
    <div className="space-y-4">
      {sortedLessons.length === 0 && drafts.length === 0 && (
        <ClubEmptyState
          title={`Inga ${sportLabel.toLowerCase()}-klasser`}
          description={`Inget schemalagt på ${weekdayLabel.toLowerCase()} ännu. Lägg till en klass för att komma igång.`}
          action={
            <Button type="button" onClick={onAddLesson} disabled={isLoading} className="min-h-11">
              Lägg till klass
            </Button>
          }
        />
      )}

      {sortedLessons.map((lesson) => (
        <LessonEditor
          key={lesson.id}
          sport={lesson.sport}
          data={data}
          groupName={lesson.className || ''}
          startTime={lesson.startTime}
          durationMinutes={lesson.durationMinutes}
          resourceId={lesson.resourceId}
          coachIds={lesson.coachIds}
          playerNames={lesson.players.map((player) => player.name)}
          isLoading={isLoading}
          onChange={(patch) => onUpdateLesson(lesson, patch)}
          onDelete={() => onDeleteLesson(lesson.id)}
        />
      ))}

      {drafts.map((draft) => (
        <LessonEditor
          key={draft.localId}
          sport={draft.sport}
          data={data}
          groupName={draft.className}
          startTime={draft.startTime}
          durationMinutes={draft.durationMinutes}
          resourceId={draft.resourceId}
          coachIds={draft.coachIds}
          playerNames={draft.playerNames}
          isLoading={isLoading}
          isSavingLesson={isSavingLesson}
          isDraft
          onChange={(patch) => onUpdateDraft(draft.localId, patch)}
          onDelete={() => onRemoveDraft(draft.localId)}
          onSaveDraft={() => onSaveDraft(draft.localId)}
        />
      ))}

      {(sortedLessons.length > 0 || drafts.length > 0) && (
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 w-full"
          disabled={isLoading}
          onClick={onAddLesson}
        >
          + Lägg till klass
        </Button>
      )}
    </div>
  )
}

type LessonEditorProps = {
  sport: LessonSport
  data: ClubPayload
  groupName: string
  startTime: string
  durationMinutes: number
  resourceId: number
  coachIds: number[]
  playerNames: string[]
  isLoading: boolean
  isDraft?: boolean
  onChange: (patch: {
    className?: string
    startTime?: string
    durationMinutes?: number
    resourceId?: number
    coachIds?: number[]
    playerNames?: string[]
  }) => void
  onDelete: () => void
  onSaveDraft?: () => void
  isSavingLesson?: boolean
}

function LessonEditor({
  sport,
  data,
  groupName,
  startTime,
  durationMinutes,
  resourceId,
  coachIds,
  playerNames,
  isLoading,
  isDraft,
  onChange,
  onDelete,
  onSaveDraft,
  isSavingLesson = false,
}: LessonEditorProps) {
  const resources = data.resources.filter((resource) =>
    sport === 'tennis' ? resource.resource_type === 'court' : resource.resource_type === 'table'
  )

  const coaches = data.coaches.filter(
    (coach) => coach.sport === sport || coach.sport === 'both'
  )

  const resourceLabel = sport === 'tennis' ? 'Bana' : 'Bord'
  const safeStartTime = startTime || '10:00'
  const safeDuration = durationMinutes > 0 ? durationMinutes : 60
  // Keep Select always controlled (never undefined) to avoid React warnings.
  const NONE = '__none__'
  const courtSelectValue = resourceId > 0 ? String(resourceId) : NONE
  const coachSelectValue = coachIds[0] ? String(coachIds[0]) : NONE
  const title = groupName.trim() || 'Ny klass'

  function resourceDisplayName(resource: (typeof resources)[0]) {
    if (resource.label?.trim()) {
      return resource.label.trim()
    }
    return `${resourceLabel} ${resource.resource_number}`
  }

  const selectedResource =
    resourceId > 0 ? resources.find((resource) => resource.id === resourceId) : undefined
  const venueResourceNumber = selectedResource?.resource_number ?? 0
  const endTime = addMinutesToTime(safeStartTime, safeDuration)

  return (
    <div
      className={cn(
        resourceVenueCardClassName(venueResourceNumber, 'p-4 md:p-5'),
        isDraft && 'border-dashed border-primary/40'
      )}
    >
      <div className="mb-4 flex flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          {selectedResource ? (
            <ResourceVenueBadge
              name={resourceDisplayName(selectedResource)}
              resourceNumber={selectedResource.resource_number}
            />
          ) : (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {isDraft ? 'Utkast' : 'Klass'} — välj {resourceLabel.toLowerCase()}
            </p>
          )}
          <LessonTimeRange startTime={safeStartTime} endTime={endTime} />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {isDraft ? 'Utkast' : 'Klass'}
            </p>
            <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 shrink-0 text-muted-foreground"
          onClick={onDelete}
          disabled={isLoading}
        >
          Ta bort
        </Button>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`class-name-${isDraft ? 'draft' : 'saved'}-${safeStartTime}`}>
            Klassnamn
          </Label>
          <Input
            id={`class-name-${isDraft ? 'draft' : 'saved'}-${safeStartTime}`}
            placeholder="t.ex. Juniorer 10–12, Nybörjare A"
            value={groupName}
            onChange={(event) => onChange({ className: event.target.value })}
            className="min-h-11"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Starttid</Label>
            <Select value={safeStartTime} onValueChange={(value) => onChange({ startTime: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Välj tid" />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Längd (min)</Label>
            <Select
              value={String(safeDuration)}
              onValueChange={(value) => onChange({ durationMinutes: Number(value) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} min
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Vilken {resourceLabel.toLowerCase()}?</Label>
          {resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Lägg till {resourceLabel.toLowerCase()} under Inställningar först.
            </p>
          ) : (
            <Select
              value={courtSelectValue}
              onValueChange={(value) =>
                onChange({ resourceId: value === NONE ? 0 : Number(value) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={`Välj ${resourceLabel.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} disabled>
                  Välj {resourceLabel.toLowerCase()}
                </SelectItem>
                {resources.map((resource) => (
                  <SelectItem key={resource.id} value={String(resource.id)}>
                    {resourceDisplayName(resource)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label>Välj förvald tränare</Label>
          {coaches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Lägg till tränare under Inställningar.</p>
          ) : (
            <Select
              value={coachSelectValue}
              onValueChange={(value) => {
                onChange({ coachIds: value === NONE ? [] : [Number(value)] })
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Välj tränare" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Ingen tränare</SelectItem>
                {coaches.map((coach) => (
                  <SelectItem key={coach.id} value={String(coach.id)}>
                    {coach.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label>Spelare i klassen</Label>
          {playerNames.map((name, index) => (
            <div key={`player-${index}`} className="flex gap-2">
              <Input
                placeholder="Spelarens namn"
                value={name}
                onChange={(event) => {
                  const next = [...playerNames]
                  next[index] = event.target.value
                  onChange({ playerNames: next })
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Ta bort spelare"
                aria-label="Ta bort spelare"
                onClick={() => {
                  const next = playerNames.filter((_, i) => i !== index)
                  onChange({ playerNames: next })
                }}
              >
                −
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({ playerNames: [...playerNames, ''] })}
          >
            + Lägg till spelare
          </Button>
        </div>

        {isDraft && onSaveDraft && (
          <Button
            type="button"
            className="min-h-11"
            onClick={onSaveDraft}
            disabled={isLoading || isSavingLesson || resourceId <= 0}
          >
            Spara klass
          </Button>
        )}
      </div>
    </div>
  )
}
