import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { calculateHours } from '@/utils/validation'

type EntryType = 'work' | 'leave' | 'compensation'
type WorkType = 'cafe' | 'coaching_tennis' | 'coaching_bordtennis' | 'privat_traning' | 'administration' | 'cleaning' | 'annat'
type LeaveType = 'semester' | 'tjanstledig' | 'sjukdom' | 'vard_av_barn' | 'annan_ledighet'
type CompensationType = 'milersattning' | 'annan_ersattning'

export type ReportEntry = {
  id: number
  date: string
  entry_type: EntryType
  time_from: string | null
  time_to: string | null
  work_type: WorkType | null
  leave_type: LeaveType | null
  compensation_type: CompensationType | null
  student_count: number | null
  sport_type: string | null
  is_full_day_leave: boolean | null
  mileage_km: number | null
  compensation_amount: number | null
  compensation_description: string | null
  annat_specification: string | null
  comment: string | null
}

const workTypeLabels: Record<WorkType, string> = {
  cafe: 'Cafe',
  coaching_tennis: 'Coaching (Tennis)',
  coaching_bordtennis: 'Coaching (Bordtennis)',
  privat_traning: 'Privatträning',
  administration: 'Administration',
  cleaning: 'Städning',
  annat: 'Annat',
}

const leaveTypeLabels: Record<LeaveType, string> = {
  semester: 'Semester',
  tjanstledig: 'Tjänstledig',
  sjukdom: 'Sjukdom',
  vard_av_barn: 'Vård av barn',
  annan_ledighet: 'Annan ledighet',
}

const compensationTypeLabels: Record<CompensationType, string> = {
  milersattning: 'Milersättning',
  annan_ersattning: 'Annan ersättning',
}

type Props = {
  entries: ReportEntry[]
  showMonthTotals?: boolean
}

function formatEntryDateLabel(dateStr: string) {
  const [yearPart, monthPart, dayPart] = dateStr.split('-').map(Number)
  if (!yearPart || !monthPart || !dayPart) {
    return dateStr
  }
  return format(new Date(yearPart, monthPart - 1, dayPart), 'EEEE d MMMM yyyy', { locale: sv })
}

export function ReportEntriesReadOnly({ entries, showMonthTotals = true }: Props) {
  const entriesByDate = entries.reduce(
    (acc, entry) => {
      if (!acc[entry.date]) {
        acc[entry.date] = []
      }
      acc[entry.date].push(entry)
      return acc
    },
    {} as Record<string, ReportEntry[]>
  )

  const sortedDates = Object.keys(entriesByDate).sort()

  const totalWorkedHours = entries.reduce((sum, entry) => {
    if (entry.entry_type !== 'work' || !entry.time_from || !entry.time_to) return sum
    return (
      sum + calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
    )
  }, 0)

  const totalLeaveHours = entries.reduce((sum, entry) => {
    if (entry.entry_type !== 'leave' || !entry.time_from || !entry.time_to) return sum
    return (
      sum + calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
    )
  }, 0)

  const totalCompensationEntries = entries.filter(
    (entry) => entry.entry_type === 'compensation'
  ).length

  const totalCompensationAmount = entries.reduce((sum, entry) => {
    if (entry.entry_type !== 'compensation' || !entry.compensation_amount) return sum
    return sum + Number(entry.compensation_amount)
  }, 0)

  if (sortedDates.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Inga poster för denna månad.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {sortedDates.map((dateStr) => {
        const dateEntries = entriesByDate[dateStr]
        const dateWorkEntries = dateEntries.filter((entry) => entry.entry_type === 'work')
        const dateLeaveEntries = dateEntries.filter((entry) => entry.entry_type === 'leave')
        const dateCompensationEntries = dateEntries.filter(
          (entry) => entry.entry_type === 'compensation'
        )

        const dateTotal = dateEntries.reduce((sum, entry) => {
          if (entry.time_from && entry.time_to) {
            return (
              sum +
              calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
            )
          }
          return sum
        }, 0)

        return (
          <div key={dateStr} className="border-b pb-4 last:border-0">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-sm">{formatEntryDateLabel(dateStr)}</h3>
              {dateTotal > 0 && (
                <span className="text-xs text-muted-foreground">
                  Totalt: {dateTotal.toFixed(1)} h
                </span>
              )}
            </div>

            <div className="ml-2 space-y-4">
              {dateWorkEntries.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold text-primary">Arbete</h4>
                  <ul className="space-y-1 text-sm">
                    {dateWorkEntries.map((entry) => {
                      if (!entry.time_from || !entry.time_to) return null
                      const hours = calculateHours(
                        entry.time_from.substring(0, 5),
                        entry.time_to.substring(0, 5)
                      )
                      return (
                        <li key={entry.id}>
                          <span className="font-medium">
                            {entry.time_from.substring(0, 5)}–{entry.time_to.substring(0, 5)}
                          </span>{' '}
                          <span className="text-muted-foreground">
                            ({hours.toFixed(1)} h)
                            {entry.work_type && ` — ${workTypeLabels[entry.work_type]}`}
                            {entry.work_type === 'privat_traning' && entry.sport_type && (
                              <> ({entry.sport_type})</>
                            )}
                            {(entry.work_type === 'coaching_tennis' ||
                              entry.work_type === 'coaching_bordtennis') &&
                              entry.student_count != null && (
                                <> — {entry.student_count} elever</>
                              )}
                            {entry.work_type === 'annat' && entry.annat_specification && (
                              <> — {entry.annat_specification}</>
                            )}
                          </span>
                          {entry.comment && (
                            <p className="text-xs text-muted-foreground">{entry.comment}</p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {dateLeaveEntries.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    Ledighet
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {dateLeaveEntries.map((entry) => {
                      if (entry.is_full_day_leave) {
                        return (
                          <li key={entry.id}>
                            Heldag —{' '}
                            {entry.leave_type && leaveTypeLabels[entry.leave_type]}
                          </li>
                        )
                      }
                      if (!entry.time_from || !entry.time_to) return null
                      const hours = calculateHours(
                        entry.time_from.substring(0, 5),
                        entry.time_to.substring(0, 5)
                      )
                      return (
                        <li key={entry.id}>
                          {entry.time_from.substring(0, 5)}–{entry.time_to.substring(0, 5)} (
                          {hours.toFixed(1)} h) —{' '}
                          {entry.leave_type && leaveTypeLabels[entry.leave_type]}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {dateCompensationEntries.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold">Ersättning</h4>
                  <ul className="space-y-1 text-sm">
                    {dateCompensationEntries.map((entry) => (
                      <li key={entry.id}>
                        {entry.compensation_type &&
                          compensationTypeLabels[entry.compensation_type]}
                        {entry.compensation_type === 'milersattning' &&
                          entry.mileage_km != null && <> — {entry.mileage_km} km</>}
                        {entry.compensation_type === 'annan_ersattning' &&
                          entry.compensation_amount != null && (
                            <> — {entry.compensation_amount} kr</>
                          )}
                        {entry.compensation_description && (
                          <span className="text-muted-foreground">
                            {' '}
                            ({entry.compensation_description})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {showMonthTotals && (
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-base font-semibold">Totalt för månaden</h3>
          <div className="flex items-center justify-between text-sm">
            <span className="text-primary">Arbetade timmar</span>
            <span className="font-semibold tabular-nums">{totalWorkedHours.toFixed(1)} h</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-emerald-700 dark:text-emerald-400">Ledighet</span>
            <span className="font-semibold tabular-nums">{totalLeaveHours.toFixed(1)} h</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-orange-700 dark:text-orange-400">Ersättning</span>
            <span className="font-semibold tabular-nums">
              {totalCompensationEntries} poster
              {totalCompensationAmount > 0
                ? ` (${totalCompensationAmount.toFixed(2)} SEK)`
                : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
