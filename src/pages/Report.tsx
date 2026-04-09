import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLocation, useNavigate } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths } from 'date-fns'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import './Report.css'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import { DateModal } from '@/components/Calendar/DateModal'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'

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

// Parse "yyyy-MM" safely and fall back to current month if invalid.
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
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)
  const [showNotification, setShowNotification] = useState(true)
  const loadingRef = useRef(false)
  const lastLoadedMonthRef = useRef<string | null>(null)
  const notificationTimeoutsRef = useRef<NodeJS.Timeout[]>([])

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
      }>(`/get-report?month=${month}&year=${year}`, {
        method: 'GET',
      })

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

  useEffect(() => {
    if (isLoadingEntries || !isSignedIn) {
      setShowNotification(false)
      notificationTimeoutsRef.current.forEach(timeout => clearTimeout(timeout))
      notificationTimeoutsRef.current = []
      return
    }

    const cycle = () => {
      setShowNotification(true)
      const hideTimeout = setTimeout(() => {
        setShowNotification(false)
        const showTimeout = setTimeout(() => {
          cycle()
        }, 30000)
        notificationTimeoutsRef.current.push(showTimeout)
      }, 10000)
      notificationTimeoutsRef.current.push(hideTimeout)
    }

    cycle()

    return () => {
      notificationTimeoutsRef.current.forEach(timeout => clearTimeout(timeout))
      notificationTimeoutsRef.current = []
    }
  }, [isLoadingEntries, isSignedIn])

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

  const tileContent = ({ date }: { date: Date }) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayData = monthEntries[dateStr]
    
    if (!dayData || dayData.entries.length === 0) {
      return null
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
        return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
      }
      if (hasCompensation) {
        return 'bg-orange-500/15 text-orange-800 dark:text-orange-300'
      }
      return 'bg-primary/15 text-primary'
    })()

    return (
      <div className="mt-2 text-center w-full">
        <div className={`text-sm font-bold px-2 py-1 rounded-md ${badgeClassName}`}>
          {totalHours.toFixed(1)}h
        </div>
        {dayData.entries.length > 1 && (
          <div className="text-xs text-muted-foreground mt-1 font-medium">
            {dayData.entries.length} poster
          </div>
        )}
      </div>
    )
  }

  const tileClassName = ({ date }: { date: Date }) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayData = monthEntries[dateStr]
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
        classes.push('!bg-emerald-500/12')
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
    
    return classes.join(' ')
  }

  const minDate = startOfMonth(addMonths(today, -6))
  const maxDate = endOfMonth(addMonths(today, 1))

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <div className="flex-shrink-0 border-b border-border bg-card/30 px-3 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 sm:gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Timrapport
            </h1>
            <p className="mt-1 hidden text-xs text-muted-foreground sm:block sm:text-sm">
              Klicka på ett datum för att lägga till eller redigera timmar
            </p>
          </div>
          <Button
            variant="default"
            onClick={() =>
              navigate('/preview', {
                state: {
                  reportMonthKey: format(currentDate, 'yyyy-MM'),
                },
              })
            }
            className="h-9 flex-shrink-0 px-3 text-xs shadow-sm transition-shadow hover:shadow-md sm:h-10 sm:px-4 sm:text-sm"
          >
            <Eye className="mr-1.5 h-4 w-4 opacity-90 sm:mr-2" aria-hidden />
            <span className="hidden sm:inline">Förhandsvisa</span>
            <span className="sm:hidden">Förhandsgranska</span>
          </Button>
        </div>
      </div>

      <div className="relative h-[48px] shrink-0 border-b border-border sm:h-[52px]">
        <div
          className={`absolute inset-0 z-10 flex h-full items-center gap-3 px-3 transition-opacity duration-300 sm:px-6 ${
            isLoadingEntries ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 sm:px-4">
            <div className="flex items-center gap-3 text-sm font-medium text-foreground sm:text-base">
              <div className="relative h-4 w-4 shrink-0 sm:h-5 sm:w-5">
                <div className="absolute inset-0 rounded-full border-2 border-primary/30" />
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary" />
              </div>
              <span>Laddar dina timmar, vänta en stund...</span>
            </div>
          </div>
        </div>

        {!isLoadingEntries && (
          <div
            className={`absolute inset-0 z-10 flex h-full items-center justify-center px-3 transition-opacity duration-500 sm:px-6 ${
              showNotification ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <p className="rounded-md border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-center text-sm font-medium text-amber-950 dark:text-amber-100 sm:text-base">
              Glöm inte att lämna in rapporten i slutet av månaden
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-1 justify-center px-2 py-4 sm:px-4 sm:py-6 md:px-6 lg:py-8">
        <div className="flex w-full max-w-7xl flex-col rounded-xl border border-border bg-card p-3 shadow-lg shadow-black/20 sm:rounded-2xl sm:p-5 md:p-8">
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
        </div>
      </div>

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
  )
}
