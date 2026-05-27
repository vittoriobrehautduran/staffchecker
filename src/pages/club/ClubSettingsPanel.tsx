import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ClubCoach, ClubPayload, ClubResource } from './clubTypes'
import { ClubClearScheduleSection } from './ClubClearScheduleSection'
import { ClubClosuresPanel } from './ClubClosuresPanel'

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
  onRemoveCoach: (coachId: number) => void
  onClearSchedule: (confirmPhrase: string) => Promise<void>
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="border-b border-border/60 py-6 last:border-b-0 last:pb-0 first:pt-0">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function SportToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
        checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
      }`}
    >
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
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
  onRemoveCoach,
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
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Inställningar</CardTitle>
        <CardDescription>{data.club.name}</CardDescription>
      </CardHeader>
      <CardContent>
        <SettingsSection
          title="Sporter"
          description="Välj vilka sporter klubben har. Spara innan du lägger till banor eller bord."
        >
          <div className="flex flex-wrap gap-3">
            <SportToggle label="Tennis" checked={tennisEnabled} onChange={onTennisEnabledChange} />
            <SportToggle
              label="Bordtennis"
              checked={bordtennisEnabled}
              onChange={onBordtennisEnabledChange}
            />
          </div>
          <Button type="button" size="sm" className="mt-4" onClick={onSaveSettings} disabled={isSaving}>
            Spara sporter
          </Button>
        </SettingsSection>

        {(tennisEnabled || bordtennisEnabled) && (
          <SettingsSection title="Banor & bord" description="Namn visas i schemat och närvaro.">
            <div className="space-y-4">
              {tennisEnabled && (
                <ResourceBlock
                  title="Tennisbanor"
                  resources={courts}
                  fallbackLabel="Bana"
                  placeholder="t.ex. Grusbana 1"
                  value={newCourtName}
                  onValueChange={onNewCourtNameChange}
                  onAdd={onAddCourt}
                  isSaving={isSaving}
                />
              )}
              {bordtennisEnabled && (
                <ResourceBlock
                  title="Bordtennisbord"
                  resources={tables}
                  fallbackLabel="Bord"
                  placeholder="t.ex. Bord 1"
                  value={newTableName}
                  onValueChange={onNewTableNameChange}
                  onAdd={onAddTable}
                  isSaving={isSaving}
                />
              )}
            </div>
          </SettingsSection>
        )}

        <SettingsSection title="Tränare" description="Tränare kan kopplas till lektioner i veckoschemat.">
          <div className="grid gap-4 sm:grid-cols-2">
            <CoachBlock
              title="Tennis"
              coaches={tennisCoaches}
              muted={!tennisEnabled}
              isSaving={isSaving}
              onRemoveCoach={onRemoveCoach}
            />
            <CoachBlock
              title="Bordtennis"
              coaches={bordtennisCoaches}
              muted={!bordtennisEnabled}
              isSaving={isSaving}
              onRemoveCoach={onRemoveCoach}
            />
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-coach-name" className="text-xs">
                Ny tränare
              </Label>
              <Input
                id="new-coach-name"
                placeholder="Namn"
                value={newCoachName}
                onChange={(event) => onNewCoachNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onAddCoach()
                  }
                }}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddCoach}
              disabled={isSaving || !newCoachName.trim()}
            >
              Lägg till
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Lov/tävling & röda dagar"
          description="Dagar utan skola — tränare ser inga lektioner i närvaro."
        >
          <ClubClosuresPanel />
        </SettingsSection>

        <section className="pt-6">
          <ClubClearScheduleSection isBusy={isSaving} onClearSchedule={onClearSchedule} />
        </section>
      </CardContent>
    </Card>
  )
}

function ResourceBlock({
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
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      {resources.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga tillagda ännu.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {resources.map((resource) => (
            <li
              key={resource.id}
              className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-sm"
            >
              {formatResourceName(resource, fallbackLabel)}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
          className="sm:max-w-xs"
        />
        <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={isSaving || !value.trim()}>
          Lägg till
        </Button>
      </div>
    </div>
  )
}

function CoachBlock({
  title,
  coaches,
  muted,
  isSaving,
  onRemoveCoach,
}: {
  title: string
  coaches: ClubCoach[]
  muted: boolean
  isSaving: boolean
  onRemoveCoach: (coachId: number) => void
}) {
  return (
    <div className={`rounded-lg border border-border/60 p-3 ${muted ? 'opacity-50' : ''}`}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {coaches.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga tränare.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {coaches.map((coach) => (
            <li
              key={coach.id}
              className="group flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/30 py-1 pl-2.5 pr-1 text-sm"
            >
              <span>{coach.name}</span>
              <button
                type="button"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                title={`Ta bort ${coach.name}`}
                aria-label={`Ta bort ${coach.name}`}
                disabled={muted || isSaving}
                onClick={() => onRemoveCoach(coach.id)}
              >
                −
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
