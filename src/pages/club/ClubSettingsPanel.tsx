import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ClubCoach, ClubPayload, ClubResource } from './clubTypes'
import { ClubClearScheduleSection } from './ClubClearScheduleSection'

type Props = {
  data: ClubPayload
  tennisEnabled: boolean
  bordtennisEnabled: boolean
  newCourtName: string
  newTableName: string
  newCoachName: string
  newCoachSport: 'tennis' | 'bordtennis'
  isSaving: boolean
  onTennisEnabledChange: (value: boolean) => void
  onBordtennisEnabledChange: (value: boolean) => void
  onNewCourtNameChange: (value: string) => void
  onNewTableNameChange: (value: string) => void
  onNewCoachNameChange: (value: string) => void
  onNewCoachSportChange: (value: 'tennis' | 'bordtennis') => void
  onSaveSettings: () => void
  onAddCourt: () => void
  onAddTable: () => void
  onAddCoach: () => void
  onClearSchedule: (confirmPhrase: string) => Promise<void>
}

function formatResourceName(resource: ClubResource, fallbackLabel: string) {
  if (resource.label?.trim()) {
    return resource.label.trim()
  }
  return `${fallbackLabel} ${resource.resource_number}`
}

export function ClubSettingsPanel({
  data,
  tennisEnabled,
  bordtennisEnabled,
  newCourtName,
  newTableName,
  newCoachName,
  newCoachSport,
  isSaving,
  onTennisEnabledChange,
  onBordtennisEnabledChange,
  onNewCourtNameChange,
  onNewTableNameChange,
  onNewCoachNameChange,
  onNewCoachSportChange,
  onSaveSettings,
  onAddCourt,
  onAddTable,
  onAddCoach,
  onClearSchedule,
}: Props) {
  const tennisCoaches = data.coaches.filter(
    (coach) => coach.sport === 'tennis' || coach.sport === 'both'
  )
  const bordtennisCoaches = data.coaches.filter(
    (coach) => coach.sport === 'bordtennis' || coach.sport === 'both'
  )

  const courts = data.resources.filter((resource) => resource.resource_type === 'court')
  const tables = data.resources.filter((resource) => resource.resource_type === 'table')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Inställningar</CardTitle>
        <CardDescription>
          {data.club.name} — aktivera sporter, lägg till banor/bord med namn och tränare.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={tennisEnabled}
              onChange={(event) => onTennisEnabledChange(event.target.checked)}
            />
            Tennis
          </label>
          {tennisEnabled && (
            <ResourceSection
              title="Tennisbanor"
              resources={courts}
              fallbackLabel="Bana"
              placeholder="Namn på bana (t.ex. Bana 1, Grusbana)"
              value={newCourtName}
              onValueChange={onNewCourtNameChange}
              onAdd={onAddCourt}
              isSaving={isSaving}
            />
          )}

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={bordtennisEnabled}
              onChange={(event) => onBordtennisEnabledChange(event.target.checked)}
            />
            Bordtennis
          </label>
          {bordtennisEnabled && (
            <ResourceSection
              title="Bordtennisbord"
              resources={tables}
              fallbackLabel="Bord"
              placeholder="Namn på bord (t.ex. Bord 1)"
              value={newTableName}
              onValueChange={onNewTableNameChange}
              onAdd={onAddTable}
              isSaving={isSaving}
            />
          )}

          <Button type="button" onClick={onSaveSettings} disabled={isSaving}>
            Spara inställningar
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <CoachList title="Tennis-tränare" coaches={tennisCoaches} disabled={!tennisEnabled} />
          <CoachList title="Bordtennis-tränare" coaches={bordtennisCoaches} disabled={!bordtennisEnabled} />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label>Lägg till tränare</Label>
            <Input
              placeholder="Namn"
              value={newCoachName}
              onChange={(event) => onNewCoachNameChange(event.target.value)}
            />
          </div>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={newCoachSport}
            onChange={(event) => onNewCoachSportChange(event.target.value as 'tennis' | 'bordtennis')}
          >
            <option value="tennis">Tennis</option>
            <option value="bordtennis">Bordtennis</option>
          </select>
          <Button type="button" variant="outline" onClick={onAddCoach} disabled={isSaving || !newCoachName.trim()}>
            + Tränare
          </Button>
        </div>

        <ClubClearScheduleSection isBusy={isSaving} onClearSchedule={onClearSchedule} />
      </CardContent>
    </Card>
  )
}

function ResourceSection({
  title,
  resources,
  fallbackLabel,
  placeholder,
  value,
  onValueChange,
  onAdd,
  isSaving,
}: {
  title: string
  resources: ClubResource[]
  fallbackLabel: string
  placeholder: string
  value: string
  onValueChange: (value: string) => void
  onAdd: () => void
  isSaving: boolean
}) {
  return (
    <div className="ml-6 space-y-3 rounded-lg border border-border/60 p-3">
      <p className="text-sm font-medium">{title}</p>
      {resources.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga tillagda ännu.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {resources.map((resource) => (
            <li key={resource.id}>{formatResourceName(resource, fallbackLabel)}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label className="sr-only">{placeholder}</Label>
          <Input
            placeholder={placeholder}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onAdd()
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" onClick={onAdd} disabled={isSaving || !value.trim()}>
          + Lägg till
        </Button>
      </div>
    </div>
  )
}

function CoachList({
  title,
  coaches,
  disabled,
}: {
  title: string
  coaches: ClubCoach[]
  disabled: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 ${disabled ? 'opacity-50' : ''}`}>
      <p className="mb-2 text-sm font-medium">{title}</p>
      {coaches.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga tränare ännu.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {coaches.map((coach) => (
            <li key={coach.id}>{coach.name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
