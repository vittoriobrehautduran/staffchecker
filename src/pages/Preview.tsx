import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation, useNavigate } from 'react-router-dom'
import { addMonths, format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'
import { getReportSubmitPath } from '@/lib/report-api'
import {
  invalidateReportMonthCache,
  readReportMonthCache,
  toReportMonthKey,
  writeReportMonthCache,
} from '@/lib/reportMonthCache'
import { calculateHours } from '@/utils/validation'
import { ArrowLeft } from 'lucide-react'
import {
  ClubEmptyState,
  ClubPageHeader,
  ClubPageShell,
  ClubSegmentedControl,
  ClubSoftPanel,
  ClubToolbarButton,
} from '@/pages/club/clubUi'
import { PreviewSkeleton } from '@/components/ui/page-skeletons'

type EntryType = 'work' | 'leave' | 'compensation'
type WorkType = 'cafe' | 'coaching_tennis' | 'coaching_bordtennis' | 'privat_traning' | 'administration' | 'cleaning' | 'annat'
type LeaveType = 'semester' | 'tjanstledig' | 'sjukdom' | 'vard_av_barn' | 'annan_ledighet'
type CompensationType = 'milersattning' | 'annan_ersattning'
type SportType = 'tennis' | 'bordtennis'

interface Entry {
  id: number
  date: string
  entry_type: EntryType
  time_from: string | null
  time_to: string | null
  work_type: WorkType | null
  leave_type: LeaveType | null
  compensation_type: CompensationType | null
  student_count: number | null
  sport_type: SportType | null
  is_full_day_leave: boolean | null
  mileage_km: number | null
  compensation_amount: number | null
  compensation_description: string | null
  annat_specification: string | null
  comment: string | null
}

interface ReportData {
  month: number
  year: number
  status: 'draft' | 'submitted'
  entries: Entry[]
}

type ReportPeriod = 'current' | 'previous'
type PreviewLocationState = {
  reportMonthKey?: string
}

// Parse "yyyy-MM" safely and return null when format is invalid.
const parseMonthKey = (monthKey?: string): Date | null => {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return null
  }

  const [yearPart, monthPart] = monthKey.split('-')
  const year = Number(yearPart)
  const monthIndex = Number(monthPart) - 1
  const parsedDate = new Date(year, monthIndex, 1)

  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  return parsedDate
}

export default function Preview() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>('current')
  const locationState = location.state as PreviewLocationState | null
  const requestedMonth = parseMonthKey(locationState?.reportMonthKey)

  const fetchReportMonth = useCallback(
    async (month: number, year: number, options?: { background?: boolean }) => {
      const monthKey = toReportMonthKey(year, month)
      const cached = readReportMonthCache(monthKey)
      const showBlockingLoader = !options?.background && !cached

      if (showBlockingLoader) {
        setIsLoading(true)
      } else if (options?.background) {
        setIsRefreshing(true)
      } else if (cached) {
        setReportData(cached as ReportData)
        setIsLoading(false)
      }

      try {
        const data = await apiRequest<ReportData>(`/get-report?month=${month}&year=${year}`, {
          method: 'GET',
        })
        setReportData(data)
        writeReportMonthCache(data)
        return data
      } catch (error) {
        if (options?.background && cached) {
          return cached as ReportData
        }
        throw error
      }
    },
    []
  )

  // Decide which month to show first:
  // - If last month's report is not submitted -> show last month
  // - If last month's report is submitted     -> show current month
  const initializeReportPeriod = useCallback(async () => {
    if (!isSignedIn) return

    try {
      const hasAnyCache =
        !!readReportMonthCache(
          toReportMonthKey(new Date().getFullYear(), new Date().getMonth() + 1)
        ) ||
        !!readReportMonthCache(
          toReportMonthKey(
            addMonths(new Date(), -1).getFullYear(),
            addMonths(new Date(), -1).getMonth() + 1
          )
        )

      if (!hasAnyCache) {
        setIsLoading(true)
      }

      if (requestedMonth) {
        const month = requestedMonth.getMonth() + 1
        const year = requestedMonth.getFullYear()
        await fetchReportMonth(month, year, { background: !!readReportMonthCache(toReportMonthKey(year, month)) })
        setSelectedPeriod('current')
        return
      }

      const today = new Date()
      const lastMonthDate = addMonths(today, -1)
      const lastMonth = lastMonthDate.getMonth() + 1
      const lastYear = lastMonthDate.getFullYear()
      const lastKey = toReportMonthKey(lastYear, lastMonth)
      const cachedLast = readReportMonthCache(lastKey)

      if (cachedLast && cachedLast.status !== 'submitted') {
        setReportData(cachedLast as ReportData)
        setSelectedPeriod('previous')
        void fetchReportMonth(lastMonth, lastYear, { background: true })
        return
      }

      const lastMonthData = await fetchReportMonth(
        lastMonth,
        lastYear,
        { background: !!cachedLast }
      )

      if (lastMonthData.status !== 'submitted') {
        setSelectedPeriod('previous')
        return
      }

      const curMonth = today.getMonth() + 1
      const curYear = today.getFullYear()
      await fetchReportMonth(curMonth, curYear, {
        background: !!readReportMonthCache(toReportMonthKey(curYear, curMonth)),
      })
      setSelectedPeriod('current')
    } catch (error: unknown) {
      console.error('Error initializing report period:', error)
      const message = error instanceof Error ? error.message : 'Ett fel uppstod'
      toast({
        title: 'Kunde inte ladda rapport',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [isSignedIn, requestedMonth, fetchReportMonth, toast])

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/login')
      return
    }
    void initializeReportPeriod()
  }, [isSignedIn, navigate, initializeReportPeriod])

  const loadReportData = useCallback(
    async (period: ReportPeriod) => {
      if (!isSignedIn) return

      try {
        const today = new Date()
        const baseDate = period === 'current' ? today : addMonths(today, -1)
        const month = baseDate.getMonth() + 1
        const year = baseDate.getFullYear()
        const monthKey = toReportMonthKey(year, month)
        const cached = readReportMonthCache(monthKey)

        if (cached) {
          setReportData(cached as ReportData)
          setSelectedPeriod(period)
          setIsLoading(false)
          await fetchReportMonth(month, year, { background: true })
        } else {
          await fetchReportMonth(month, year)
          setSelectedPeriod(period)
        }
      } catch (error: unknown) {
        console.error('Error loading report:', error)
        const message = error instanceof Error ? error.message : 'Ett fel uppstod'
        toast({
          title: 'Kunde inte ladda rapport',
          description: message,
          variant: 'destructive',
        })
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [isSignedIn, fetchReportMonth, toast]
  )

  const handleChangePeriod = async (period: ReportPeriod) => {
    if (!isSignedIn || period === selectedPeriod) return
    await loadReportData(period)
  }

  // Öppnar bekräftelsedialog; själva utskicket sker i handleConfirmSubmit.
  const handleSubmitClick = () => {
    if (!reportData) return

    if (reportData.entries.length === 0) {
      toast({
        title: 'Inga poster',
        description: 'Du måste ha minst en post för att kunna skicka rapporten',
        variant: 'destructive',
      })
      return
    }

    setConfirmSubmitOpen(true)
  }

  const handleConfirmSubmit = async () => {
    if (!reportData) return

    setConfirmSubmitOpen(false)
    setIsSubmitting(true)

    try {
      await apiRequest(`/${getReportSubmitPath()}`, {
        method: 'POST',
        body: JSON.stringify({
          month: reportData.month,
          year: reportData.year,
        }),
      })

      invalidateReportMonthCache(toReportMonthKey(reportData.year, reportData.month))

      toast({
        title: 'Rapport skickad!',
        description: 'Din timrapport har skickats till chefen',
      })

      navigate('/report', {
        state: {
          activeMonthKey: toReportMonthKey(reportData.year, reportData.month),
        },
      })
    } catch (error: any) {
      console.error('Error submitting report:', error)
      toast({
        title: 'Kunde inte skicka rapport',
        description: error.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isSignedIn) {
    return null
  }

  if (isLoading && !reportData) {
    return <PreviewSkeleton />
  }

  if (!reportData) {
    return (
      <ClubPageShell>
        <ClubPageHeader eyebrow="Rapport" title="Förhandsvisning" />
        <ClubEmptyState
          title="Ingen rapport hittades"
          description="Gå till kalendern och lägg till timmar för månaden."
          action={
            <Button type="button" className="min-h-11" onClick={() => navigate('/report')}>
              Öppna kalender
            </Button>
          }
        />
      </ClubPageShell>
    )
  }

  const monthName = format(new Date(reportData.year, reportData.month - 1), 'MMMM yyyy', { locale: sv })
  const activeMonthKey = toReportMonthKey(reportData.year, reportData.month)
  
  // Group entries by date
  const entriesByDate = reportData.entries.reduce((acc, entry) => {
    if (!acc[entry.date]) {
      acc[entry.date] = []
    }
    acc[entry.date].push(entry)
    return acc
  }, {} as Record<string, Entry[]>)

  const sortedDates = Object.keys(entriesByDate).sort()

  const workTypeLabels: Record<WorkType, string> = {
    cafe: 'Cafe',
    coaching_tennis: '🎾 Coaching (Tennis)',
    coaching_bordtennis: '🏓 Coaching (Bordtennis)',
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

  // Keep worked and leave hours separate in monthly totals.
  const totalWorkedHours = reportData.entries.reduce((sum, entry) => {
    if (entry.entry_type !== 'work' || !entry.time_from || !entry.time_to) {
      return sum
    }
    return sum + calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
  }, 0)

  const totalLeaveHours = reportData.entries.reduce((sum, entry) => {
    if (entry.entry_type !== 'leave' || !entry.time_from || !entry.time_to) {
      return sum
    }
    return sum + calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
  }, 0)

  const totalCompensationEntries = reportData.entries.filter(
    (entry) => entry.entry_type === 'compensation'
  ).length

  const totalCompensationAmount = reportData.entries.reduce((sum, entry) => {
    if (entry.entry_type !== 'compensation' || !entry.compensation_amount) {
      return sum
    }
    return sum + Number(entry.compensation_amount)
  }, 0)

  return (
    <ClubPageShell>
      <Dialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Skicka rapport?</DialogTitle>
            <DialogDescription>
              Vill du skicka rapporten för <span className="font-medium text-foreground">{monthName}</span>{' '}
              till din chef? Efter att rapporten skickats kan du inte längre redigera den.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setConfirmSubmitOpen(false)}
              disabled={isSubmitting}
            >
              Nej
            </Button>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => void handleConfirmSubmit()}
              disabled={isSubmitting}
            >
              Ja, skicka
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClubPageHeader
        eyebrow="Rapport"
        title={monthName}
        description={
          isRefreshing
            ? 'Granska innan du skickar. Uppdaterar i bakgrunden…'
            : 'Granska din rapport innan du skickar den.'
        }
        actions={
          <ClubToolbarButton
            onClick={() => navigate('/report', { state: { activeMonthKey } })}
          >
            <ArrowLeft className="h-4 w-4" />
            Kalender
          </ClubToolbarButton>
        }
      />

      <ClubSegmentedControl
        aria-label="Rapportperiod"
        fullWidth
        value={selectedPeriod}
        onChange={(period) => {
          void handleChangePeriod(period)
        }}
        options={[
          { value: 'previous', label: 'Förra månaden' },
          { value: 'current', label: 'Denna månad' },
        ]}
      />

      <ClubSoftPanel
        title="Poster"
        description={
          reportData.status === 'submitted'
            ? 'Denna månad är redan inskickad.'
            : `${reportData.entries.length} poster i perioden.`
        }
        actions={
          <span
            className={
              reportData.status === 'submitted'
                ? 'rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary'
                : 'rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground'
            }
          >
            {reportData.status === 'submitted' ? 'Inskickad' : 'Utkast'}
          </span>
        }
      >
        {sortedDates.length === 0 ? (
          <ClubEmptyState
            title="Inga poster denna månad"
            description="Gå till kalendern för att lägga till timmar."
            action={
              <Button
                type="button"
                className="min-h-11"
                onClick={() => navigate('/report', { state: { activeMonthKey } })}
              >
                Öppna kalender
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {sortedDates.map((dateStr) => {
              const dateEntries = entriesByDate[dateStr]
              const dateWorkEntries = dateEntries.filter((e) => e.entry_type === 'work')
              const dateLeaveEntries = dateEntries.filter((e) => e.entry_type === 'leave')
              const dateCompensationEntries = dateEntries.filter(
                (e) => e.entry_type === 'compensation'
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
                <div
                  key={dateStr}
                  className="rounded-2xl border border-border/80 bg-background/60 p-4 md:p-5"
                >
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold capitalize tracking-tight">
                      {format(new Date(dateStr), 'EEEE d MMMM yyyy', { locale: sv })}
                    </h3>
                    {dateTotal > 0 && (
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {dateTotal.toFixed(1)} timmar
                      </span>
                    )}
                  </div>
                  <div className="space-y-4">
                    {dateWorkEntries.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-primary">Arbete</h4>
                        <div className="space-y-2">
                          {dateWorkEntries.map((entry) => {
                            if (!entry.time_from || !entry.time_to) return null
                            const hours = calculateHours(
                              entry.time_from.substring(0, 5),
                              entry.time_to.substring(0, 5)
                            )
                            return (
                              <div key={entry.id} className="text-sm leading-relaxed">
                                <span className="font-medium tabular-nums">
                                  {entry.time_from.substring(0, 5)} –{' '}
                                  {entry.time_to.substring(0, 5)}
                                </span>{' '}
                                <span className="text-muted-foreground">
                                  ({hours.toFixed(1)}h) –{' '}
                                  {entry.work_type && workTypeLabels[entry.work_type]}
                                  {entry.work_type === 'privat_traning' && (
                                    <>
                                      {entry.student_count && (
                                        <span>
                                          {' '}
                                          ({entry.student_count}{' '}
                                          {entry.student_count === 1 ? 'elev' : 'elever'})
                                        </span>
                                      )}
                                      {entry.sport_type && (
                                        <span>
                                          {' '}
                                          –{' '}
                                          {entry.sport_type === 'tennis'
                                            ? 'Tennis'
                                            : 'Bordtennis'}
                                        </span>
                                      )}
                                    </>
                                  )}
                                </span>
                                {entry.work_type === 'annat' && entry.annat_specification && (
                                  <span className="text-muted-foreground">
                                    {' '}
                                    – {entry.annat_specification}
                                  </span>
                                )}
                                {entry.comment && (
                                  <div className="mt-0.5 text-muted-foreground">{entry.comment}</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {dateLeaveEntries.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                          Ledighet
                        </h4>
                        <div className="space-y-2">
                          {dateLeaveEntries.map((entry) => {
                            if (entry.is_full_day_leave) {
                              return (
                                <div key={entry.id} className="text-sm leading-relaxed">
                                  <span className="font-medium">Hela dagen</span>{' '}
                                  <span className="text-muted-foreground">
                                    – {entry.leave_type && leaveTypeLabels[entry.leave_type]}
                                  </span>
                                  {entry.comment && (
                                    <div className="mt-0.5 text-muted-foreground">
                                      {entry.comment}
                                    </div>
                                  )}
                                </div>
                              )
                            }
                            if (!entry.time_from || !entry.time_to) return null
                            const hours = calculateHours(
                              entry.time_from.substring(0, 5),
                              entry.time_to.substring(0, 5)
                            )
                            return (
                              <div key={entry.id} className="text-sm leading-relaxed">
                                <span className="font-medium tabular-nums">
                                  {entry.time_from.substring(0, 5)} –{' '}
                                  {entry.time_to.substring(0, 5)}
                                </span>{' '}
                                <span className="text-muted-foreground">
                                  ({hours.toFixed(1)}h) –{' '}
                                  {entry.leave_type && leaveTypeLabels[entry.leave_type]}
                                </span>
                                {entry.comment && (
                                  <div className="mt-0.5 text-muted-foreground">{entry.comment}</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {dateCompensationEntries.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-orange-700 dark:text-orange-400">
                          Ersättning
                        </h4>
                        <div className="space-y-2">
                          {dateCompensationEntries.map((entry) => (
                            <div key={entry.id} className="text-sm leading-relaxed">
                              <span className="font-medium">
                                {entry.compensation_type &&
                                  compensationTypeLabels[entry.compensation_type]}
                              </span>
                              {entry.compensation_type === 'milersattning' && entry.mileage_km && (
                                <span className="ml-2 text-muted-foreground">
                                  – {entry.mileage_km} km
                                </span>
                              )}
                              {entry.compensation_type === 'annan_ersattning' && (
                                <>
                                  {entry.compensation_description && (
                                    <span className="ml-2 text-muted-foreground">
                                      – {entry.compensation_description}
                                    </span>
                                  )}
                                  {entry.compensation_amount && (
                                    <span className="ml-2 font-semibold tabular-nums text-muted-foreground">
                                      {entry.compensation_amount} SEK
                                    </span>
                                  )}
                                </>
                              )}
                              {entry.comment && (
                                <div className="mt-0.5 text-muted-foreground">{entry.comment}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 md:p-5">
              <h3 className="mb-3 text-base font-semibold tracking-tight">Totalt för månaden</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-primary">Arbetade timmar</dt>
                  <dd className="font-semibold tabular-nums">{totalWorkedHours.toFixed(1)} timmar</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-emerald-700 dark:text-emerald-400">Ledighetstimmar</dt>
                  <dd className="font-semibold tabular-nums">{totalLeaveHours.toFixed(1)} timmar</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-orange-700 dark:text-orange-400">Ersättning</dt>
                  <dd className="font-semibold tabular-nums">
                    {totalCompensationEntries} poster
                    {totalCompensationAmount > 0
                      ? ` (${totalCompensationAmount.toFixed(2)} SEK)`
                      : ''}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Button
                type="button"
                className="min-h-11 flex-1"
                onClick={handleSubmitClick}
                disabled={isSubmitting || reportData.status === 'submitted'}
              >
                {isSubmitting
                  ? 'Skickar…'
                  : reportData.status === 'submitted'
                    ? 'Rapport redan skickad'
                    : 'Skicka rapport'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => navigate('/report', { state: { activeMonthKey } })}
                disabled={isSubmitting}
              >
                Redigera
              </Button>
            </div>
          </div>
        )}
      </ClubSoftPanel>
    </ClubPageShell>
  )
}

