import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths } from 'date-fns'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import './Report.css'
import { Button } from '@/components/ui/button'
import { DateModal } from '@/components/Calendar/DateModal'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'

interface Entry {
  id: number
  date: string
  time_from: string
  time_to: string
  work_type: 'cafe' | 'coaching' | 'administration' | 'cleaning' | 'annat'
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

export default function Report() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const today = new Date()
  const [currentDate, setCurrentDate] = useState(startOfMonth(today))
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

    const totalHours = dayData.entries.reduce((sum, entry) => {
      const from = entry.time_from.substring(0, 5)
      const to = entry.time_to.substring(0, 5)
      const hours = (parseInt(to.split(':')[0]) - parseInt(from.split(':')[0])) + 
                   (parseInt(to.split(':')[1]) - parseInt(from.split(':')[1])) / 60
      return sum + Math.max(0, hours)
    }, 0)

    return (
      <div className="mt-2 text-center w-full">
        <div className={`text-sm font-bold px-2 py-1 rounded-md ${
          dayData.reportStatus === 'submitted' 
            ? 'bg-gray-200 text-gray-700' 
            : 'bg-blue-100 text-blue-700'
        }`}>
          {totalHours.toFixed(1)}h
        </div>
        {dayData.entries.length > 1 && (
          <div className="text-xs text-gray-500 mt-1 font-medium">
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
      classes.push(dayData.reportStatus === 'submitted' ? 'bg-gray-100' : 'bg-blue-50')
    }
    
    return classes.join(' ')
  }

  const minDate = startOfMonth(addMonths(today, -6))
  const maxDate = endOfMonth(addMonths(today, 1))

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 overflow-hidden">
      {/* Premium header with shadow */}
      <div className="flex-shrink-0 px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b border-slate-200/60 bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent truncate">
              Timrapport
            </h1>
            <p className="text-xs sm:text-sm text-slate-600/80 hidden sm:block">
              Klicka på ett datum för att lägga till eller redigera timmar
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => navigate('/preview')}
            className="shadow-md hover:shadow-lg transition-all duration-200 text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-10 flex-shrink-0 border-slate-200 hover:border-slate-300 bg-white/90 backdrop-blur-sm"
          >
            <span className="hidden sm:inline">Förhandsvisa</span>
            <span className="sm:hidden">Förhandsgranska</span>
          </Button>
        </div>
      </div>
      
      {/* Loading banner / Notification */}
      <div className="flex-shrink-0 h-[48px] sm:h-[52px] px-3 sm:px-4 md:px-6 border-b transition-all duration-200 relative">
        <div className={`absolute inset-0 h-full flex items-center gap-3 text-blue-700 transition-opacity duration-300 ${
          isLoadingEntries 
            ? 'opacity-100 bg-blue-50/80 border-blue-200/50 backdrop-blur-sm z-10' 
            : 'opacity-0 z-0'
        }`}>
          <div className="relative h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-blue-200"></div>
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-600 animate-spin"></div>
          </div>
          <p className="text-sm sm:text-base font-medium">
            Laddar dina timmar, vänta en stund...
          </p>
        </div>
        
        {!isLoadingEntries && (
          <div className={`absolute inset-0 h-full flex items-center justify-center text-amber-700 transition-opacity duration-500 ${
            showNotification 
              ? 'opacity-100 bg-amber-50/80 border-amber-200/50 backdrop-blur-sm z-10' 
              : 'opacity-0 z-0'
          }`}>
            <p className="text-sm sm:text-base font-medium px-4">
              Glöm inte att lämna in rapporten i slutet av månaden
            </p>
          </div>
        )}
      </div>
      
      {/* Calendar container */}
      <div className="flex-1 overflow-auto p-0">
        <div className="h-full w-full bg-white overflow-hidden p-2 sm:p-4 md:p-6 lg:p-8 flex items-start justify-center">
          <div className="w-full max-w-7xl h-full flex flex-col">
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
              className="w-full border-0 flex-1"
              showWeekNumbers={true}
            />
          </div>
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
