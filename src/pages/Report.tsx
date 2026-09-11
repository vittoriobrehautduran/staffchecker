import { useState, useRef, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation, useNavigate } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths } from 'date-fns'
import { sv } from 'date-fns/locale'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import './Report.css'
import { Button } from '@/components/ui/button'
import { Bell, Eye, Loader2, X } from 'lucide-react'
import { DateModal } from '@/components/Calendar/DateModal'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'
import {
  ClubPageHeader,
  ClubSoftPanel,
} from '@/pages/club/clubUi'
import {
  buildClosureDayMap,
  closureTypeDisplayLabel,
  getClosureForDate,
  listClosureSummariesForMonth,
} from '@/lib/clubClosuresCalendar'
import type { ClubClosuresPayload } from '@/pages/club/clubAttendanceTypes'

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

interface EntriesResponse {
  entries: Entry[]
  reportStatus: 'draft' | 'submitted'
}

interface MonthEntries {
  [date: string]: {
    entries: Entry[]
    reportStatus: 'draft' | 'submitted'
  }
}

type ReportLocationState = {
  activeMonthKey?: string
}

const SUBMIT_REMINDER_STORAGE_KEY = 'kalender-submit-reminder-dismissed'

// Parse "yyyy-MM" safely and fall back to current month if invalid.
function formatClosureDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  if (!year || !month || !day) return dateStr
  return new Date(year, month - 1, day).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
  })
}

const getInitialCalendarMonth = (monthKey?: string): Date => {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return startOfMonth(new Date())
  }

  const [yearPart, monthPart] = monthKey.split('-')
  const year = Number(yearPart)
  const monthIndex = Number(monthPart) - 1
  const parsedDate = new Date(year, monthIndex, 1)

  if (Number.isNaN(parsedDate.getTime())) {
    return startOfMonth(new Date())
  }

  return startOfMonth(parsedDate)
}

export default function Report() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const today = new Date()
  const locationState = location.state as ReportLocationState | null
  const [currentDate, setCurrentDate] = useState(() =>
    getInitialCalendarMonth(locationState?.activeMonthKey)
  )
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [entries, setEntries] = useState<Entry[]>([])
  const [reportStatus, setReportStatus] = useState<'draft' | 'submitted'>('draft')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [monthEntries, setMonthEntries] = useState<MonthEntries>({})
  const [clubClosures, setClubClosures] = useState<ClubClosuresPayload>({
    rodDays: [],
    lovRanges: [],
  })
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)
  const [reminderDismissed, setReminderDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(SUBMIT_REMINDER_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })
  const loadingRef = useRef(false)
  const lastLoadedMonthRef = useRef<string | null>(null)
  const [compactHourLabels, setCompactHourLabels] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const apply = () => setCompactHourLabels(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const closureMap = useMemo(() => buildClosureDayMap(clubClosures), [clubClosures])

  const monthClosureSummaries = useMemo(
    () =>
      listClosureSummariesForMonth(
        clubClosures,
        currentDate.getFullYear(),
        currentDate.getMonth()
      ),
    [clubClosures, currentDate]
  )

  if (!isSignedIn) {
    navigate('/login')
    return null
  }

  const loadMonthEntries = async (date: Date) => {
    if (loadingRef.current) return

    const monthKey = format(date, 'yyyy-MM')
    if (lastLoadedMonthRef.current === monthKey) {
      return
    }

    try {
      loadingRef.current = true
      setIsLoadingEntries(true)
      lastLoadedMonthRef.current = monthKey
      
      const month = date.getMonth() + 1
      const year = date.getFullYear()
      
      const reportData = await apiRequest<{
        month: number
        year: number
        status: 'draft' | 'submitted'
        entries: Entry[]
        clubClosures?: ClubClosuresPayload
      }>(`/get-report?month=${month}&year=${year}`, {
        method: 'GET',
      })

      setClubClosures(reportData?.clubClosures ?? { rodDays: [], lovRanges: [] })

      // Group entries by date
      const entriesMap: MonthEntries = {}
      const monthStart = startOfMonth(date)
      const monthEnd = endOfMonth(date)
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

      // Initialize all days with empty entries
      days.forEach((day) => {
        const dateStr = format(day, 'yyyy-MM-dd')
        entriesMap[dateStr] = {
          entries: [],
          reportStatus: reportData?.status || 'draft',
        }
      })

      // Populate entries by date
      if (reportData?.entries) {
        reportData.entries.forEach((entry) => {
          let dateStr = entry.date
          if (dateStr && typeof dateStr === 'string') {
            const dateObj = new Date(dateStr)
            if (!isNaN(dateObj.getTime())) {
              dateStr = format(dateObj, 'yyyy-MM-dd')
            }
          }
          
          if (dateStr && entriesMap[dateStr]) {
            entriesMap[dateStr].entries.push(entry)
          }
        })
      }
      
      setMonthEntries(entriesMap)
    } catch (error: any) {
      console.error('Error loading month entries:', error)
      const monthStart = startOfMonth(date)
      const monthEnd = endOfMonth(date)
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
      const entriesMap: MonthEntries = {}
      days.forEach((day) => {
        const dateStr = format(day, 'yyyy-MM-dd')
        entriesMap[dateStr] = {
          entries: [],
          reportStatus: 'draft',
        }
      })
      setMonthEntries(entriesMap)
    } finally {
      loadingRef.current = false
      setIsLoadingEntries(false)
    }
  }

  useEffect(() => {
    if (isSignedIn) {
      const monthKey = format(currentDate, 'yyyy-MM')
      if (lastLoadedMonthRef.current !== monthKey) {
        loadMonthEntries(currentDate)
      }
    }
  }, [currentDate, isSignedIn])

  useEffect(() => {
    if (selectedDate && isModalOpen) {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const cachedData = monthEntries[dateStr]
      if (cachedData) {
        setEntries(cachedData.entries)
        setReportStatus(cachedData.reportStatus)
      }
    }
  }, [monthEntries, selectedDate, isModalOpen])

  const dismissSubmitReminder = () => {
    setReminderDismissed(true)
    try {
      sessionStorage.setItem(SUBMIT_REMINDER_STORAGE_KEY, '1')
    } catch {
      // Private mode still dismisses for this visit.
    }
  }

  const handleDateClick = (value: any) => {
    // Handle single date selection (not range)
    if (!value || Array.isArray(value)) return
    const date = value as Date
    const dateStr = format(date, 'yyyy-MM-dd')
    const today = new Date()
    const earliestDate = addMonths(today, -6)
    const latestDate = addMonths(today, 1)
    
    if (date < startOfMonth(earliestDate) || date > endOfMonth(latestDate)) {
      toast({
        title: 'Datum utanför tillåtet intervall',
        description: 'Du kan endast välja datum inom de senaste 6 månaderna eller nästa månad',
        variant: 'destructive',
      })
      return
    }

    setSelectedDate(date)
    
    // Use cached entries if available
    if (monthEntries[dateStr]) {
      setEntries(monthEntries[dateStr].entries)
      setReportStatus(monthEntries[dateStr].reportStatus)
    } else {
      setEntries([])
      setReportStatus('draft')
    }
    
    setIsModalOpen(true)
    
    // Load entries in background if not cached
    if (!monthEntries[dateStr]) {
      const selectedMonth = format(date, 'yyyy-MM')
      const currentMonthKey = format(currentDate, 'yyyy-MM')
      if (selectedMonth !== currentMonthKey) {
        setCurrentDate(startOfMonth(date))
        loadMonthEntries(startOfMonth(date))
      } else {
        apiRequest<EntriesResponse>(`/get-entries?date=${dateStr}`, {
          method: 'GET',
        })
          .then((data) => {
            if (isModalOpen && format(selectedDate || new Date(), 'yyyy-MM-dd') === dateStr) {
              setEntries(data?.entries || [])
              setReportStatus(data?.reportStatus || 'draft')
            }
          })
          .catch((error) => {
            console.error('Error loading entries:', error)
          })
      }
    }
  }

  const handleActiveStartDateChange = ({ activeStartDate }: { activeStartDate: Date | null }) => {
    if (activeStartDate) {
      const newDate = startOfMonth(activeStartDate)
      const today = new Date()
      const nextMonth = addMonths(today, 1)
      const earliestMonth = addMonths(today, -6)
      
      // Prevent navigation beyond allowed range
      if (newDate < startOfMonth(earliestMonth)) {
        setCurrentDate(startOfMonth(earliestMonth))
        return
      }
      
      if (newDate > startOfMonth(nextMonth)) {
        setCurrentDate(startOfMonth(nextMonth))
        return
      }
      
      setCurrentDate(newDate)
    }
  }

  const handleEntrySaved = async () => {
    if (selectedDate) {
      lastLoadedMonthRef.current = ''
      await loadMonthEntries(currentDate)
      await loadEntriesForDate(selectedDate)
    }
    setIsModalOpen(false)
  }

  const handleEntryDeleted = async () => {
    if (selectedDate) {
      lastLoadedMonthRef.current = ''
      await loadMonthEntries(currentDate)
      await loadEntriesForDate(selectedDate)
    }
  }

  const loadEntriesForDate = async (date: Date) => {
    if (!isSignedIn) return

    const dateStr = format(date, 'yyyy-MM-dd')
    const cachedData = monthEntries[dateStr]
    if (cachedData) {
      setEntries(cachedData.entries)
      setReportStatus(cachedData.reportStatus)
    } else {
      await loadMonthEntries(currentDate)
      const reloadedData = monthEntries[dateStr]
      if (reloadedData) {
        setEntries(reloadedData.entries)
        setReportStatus(reloadedData.reportStatus)
      }
    }
  }

  const tileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null

    const dateStr = format(date, 'yyyy-MM-dd')
    const dayData = monthEntries[dateStr]
    const closure = getClosureForDate(closureMap, dateStr)

    const closureTag = closure ? (
      <div
        className={`mx-auto mb-0.5 max-w-full truncate px-0.5 text-center text-[9px] font-semibold leading-tight sm:text-[10px] ${
          closure.type === 'lov'
            ? 'text-amber-900 dark:text-amber-200'
            : 'text-rose-900 dark:text-rose-200'
        }`}
        title={closure.label}
      >
        {closure.label}
      </div>
    ) : null

    if (!dayData || dayData.entries.length === 0) {
      return closureTag
    }

    const hasLeave = dayData.entries.some(e => e.entry_type === 'leave')
    const hasCompensation = dayData.entries.some(e => e.entry_type === 'compensation')

    const totalHours = dayData.entries.reduce((sum, entry) => {
      if (entry.time_from && entry.time_to) {
        const from = entry.time_from.substring(0, 5)
        const to = entry.time_to.substring(0, 5)
        const hours = (parseInt(to.split(':')[0]) - parseInt(from.split(':')[0])) + 
                     (parseInt(to.split(':')[1]) - parseInt(from.split(':')[1])) / 60
        return sum + Math.max(0, hours)
      }
      return sum
    }, 0)

    const badgeClassName = (() => {
      if (dayData.reportStatus === 'submitted') {
        return 'bg-muted text-muted-foreground'
      }
      if (hasLeave) {
        return 'bg-emerald-600/[0.045] text-emerald-700/80 dark:text-emerald-400/65'
      }
      if (hasCompensation) {
        return 'bg-orange-500/15 text-orange-800 dark:text-orange-300'
      }
      return 'bg-primary/15 text-primary'
    })()

    const hoursLabel = `${totalHours.toFixed(1)}${compactHourLabels ? '' : 'h'}`

    return (
      <div className="mt-2 w-full text-center">
        {closureTag}
        <div
          className={`rounded-md px-1 py-0.5 text-xs font-bold sm:px-2 sm:py-1 sm:text-sm ${badgeClassName}`}
        >
          {hoursLabel}
        </div>
        {dayData.entries.length > 1 && (
          <div className="text-xs text-muted-foreground mt-1 font-medium">
            {dayData.entries.length} poster
          </div>
        )}
      </div>
    )
  }

  const tileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return ''

    const dateStr = format(date, 'yyyy-MM-dd')
    const dayData = monthEntries[dateStr]
    const closure = getClosureForDate(closureMap, dateStr)
    const dateMonth = format(date, 'yyyy-MM')
    const nextMonth = format(addMonths(today, 1), 'yyyy-MM')
    const earliestMonth = format(addMonths(today, -6), 'yyyy-MM')
    
    const classes: string[] = []
    
    if (dateMonth > nextMonth || dateMonth < earliestMonth) {
      classes.push('opacity-40', 'pointer-events-none')
    }
    
    if (dayData?.reportStatus === 'submitted') {
      classes.push('opacity-60')
    }
    
    if (dayData?.entries && dayData.entries.length > 0) {
      const hasLeave = dayData.entries.some(e => e.entry_type === 'leave')
      const hasCompensation = dayData.entries.some(e => e.entry_type === 'compensation')
      
      // Color priority:
      // - Submitted overrides with gray
      // - Leave shows green
      // - Compensation shows orange
      // - Default work shows blue
      if (dayData.reportStatus === 'submitted') {
        classes.push('!bg-muted/90')
      } else if (hasLeave) {
        classes.push('!bg-emerald-600/[0.04]')
      } else if (hasCompensation) {
        classes.push('!bg-orange-500/12')
      } else {
        classes.push('!bg-primary/12')
      }
    }

    const inViewMonth =
      date.getMonth() === currentDate.getMonth() &&
      date.getFullYear() === currentDate.getFullYear()
    const isOutOfRange = dateMonth > nextMonth || dateMonth < earliestMonth
    if (inViewMonth && !isOutOfRange) {
      if (!dayData?.entries?.length) {
        classes.push('report-tile-empty')
      }
    }

    if (closure) {
      classes.push(closure.type === 'lov' ? 'report-tile-club-lov' : 'report-tile-club-rod')
    }

    return classes.join(' ')
  }

  const minDate = startOfMonth(addMonths(today, -6))
  const maxDate = endOfMonth(addMonths(today, 1))
  const monthLabel = format(currentDate, 'MMMM yyyy', { locale: sv })

  return (
    <div className="min-h-svh flex-1 bg-background">
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-primary/[0.07] via-transparent to-transparent"
        />
        <div className="relative mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:space-y-8 md:px-6 md:py-8">
          <ClubPageHeader
            eyebrow="Rapport"
            title="Kalender"
            description={`Klicka på ett datum i ${monthLabel} för att lägga till eller redigera timmar.`}
            actions={
              <Button
                type="button"
                className="min-h-11 w-full sm:w-auto"
                onClick={() =>
                  navigate('/preview', {
                    state: {
                      reportMonthKey: format(currentDate, 'yyyy-MM'),
                    },
                  })
                }
              >
                <Eye className="mr-2 h-4 w-4" aria-hidden />
                Förhandsvisa
              </Button>
            }
          />

          {isLoadingEntries && (
            <p
              className="-mt-2 flex items-center gap-2 text-sm text-muted-foreground"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Laddar dina timmar…
            </p>
          )}

          {!reminderDismissed &&
            Object.values(monthEntries)[0]?.reportStatus !== 'submitted' && (
              <div
                role="status"
                className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-3 sm:px-4"
              >
                <Bell
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 dark:text-amber-200"
                  aria-hidden
                />
                <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
                  Glöm inte att lämna in rapporten i slutet av månaden.
                </p>
                <button
                  type="button"
                  aria-label="Stäng påminnelse"
                  onClick={dismissSubmitReminder}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-amber-500/15 hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}

          <ClubSoftPanel className="p-2 md:p-6">
            <Calendar
              onChange={handleDateClick}
              value={selectedDate}
              onActiveStartDateChange={handleActiveStartDateChange}
              activeStartDate={currentDate}
              minDate={minDate}
              maxDate={maxDate}
              locale="sv-SE"
              tileContent={tileContent}
              tileClassName={tileClassName}
              className="report-dashboard-calendar w-full border-0"
              showWeekNumbers={true}
            />

            {monthClosureSummaries.length > 0 && (
              <div className="mt-5 space-y-3 border-t border-border/80 pt-5">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  Klubbstängt denna månad
                </h2>
                <ul className="space-y-2 text-sm">
                  {monthClosureSummaries.map((entry) => (
                    <li
                      key={`${entry.type}-${entry.fromDate}-${entry.toDate}-${entry.label}`}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1"
                    >
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          entry.type === 'lov'
                            ? 'bg-amber-500/15 text-amber-900 dark:text-amber-100'
                            : 'bg-rose-500/15 text-rose-900 dark:text-rose-100'
                        }`}
                      >
                        {closureTypeDisplayLabel(entry.type)}
                      </span>
                      <span className="font-medium text-foreground">{entry.label}</span>
                      <span className="text-muted-foreground">
                        {entry.fromDate === entry.toDate
                          ? formatClosureDateLabel(entry.fromDate)
                          : `${formatClosureDateLabel(entry.fromDate)} – ${formatClosureDateLabel(entry.toDate)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </ClubSoftPanel>

          <DateModal
            open={isModalOpen}
            onOpenChange={setIsModalOpen}
            date={selectedDate}
            entries={entries}
            onEntrySaved={handleEntrySaved}
            onEntryDeleted={handleEntryDeleted}
            reportStatus={reportStatus}
          />
        </div>
      </div>
    </div>
  )
}
