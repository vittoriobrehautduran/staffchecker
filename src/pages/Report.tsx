import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { Button } from '@/components/ui/button'
import { DateModal } from '@/components/Calendar/DateModal'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'
import type { DateSelectArg, EventClickArg } from '@fullcalendar/core'

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
  const calendarRef = useRef<FullCalendar>(null)
  const today = new Date()
  const [currentDate, setCurrentDate] = useState(startOfMonth(today))
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [entries, setEntries] = useState<Entry[]>([])
  const [reportStatus, setReportStatus] = useState<'draft' | 'submitted'>('draft')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [monthEntries, setMonthEntries] = useState<MonthEntries>({})
  const loadingRef = useRef(false)
  const lastLoadedMonthRef = useRef<string | null>(null)

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
      lastLoadedMonthRef.current = monthKey
      
      const month = date.getMonth() + 1
      const year = date.getFullYear()
      
      // Use get-report to fetch all entries for the month in ONE call instead of 31
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
          const dateStr = entry.date
          if (entriesMap[dateStr]) {
            entriesMap[dateStr].entries.push(entry)
          }
        })
      }
      
      setMonthEntries(entriesMap)
    } catch (error: any) {
      console.error('Error loading month entries:', error)
      // On error, initialize empty map for the month
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

  // Disable next button on initial load if on current month
  useEffect(() => {
    const updateNextButton = () => {
      const nextButton = document.querySelector('.fc-next-button')
      const currentMonth = format(startOfMonth(currentDate), 'yyyy-MM')
      const todayMonth = format(startOfMonth(today), 'yyyy-MM')
      
      if (nextButton) {
        if (currentMonth >= todayMonth) {
          nextButton.classList.add('fc-button-disabled')
          nextButton.setAttribute('disabled', 'true')
        } else {
          nextButton.classList.remove('fc-button-disabled')
          nextButton.removeAttribute('disabled')
        }
      }
    }
    
    // Run after calendar renders
    const timer = setTimeout(updateNextButton, 100)
    return () => clearTimeout(timer)
  }, [currentDate])

  const handleDateSelect = async (selectInfo: DateSelectArg) => {
    const date = selectInfo.start
    const dateStr = format(date, 'yyyy-MM-dd')

    // Allow all dates in the current month, including future dates
    // Only restrict dates from other months
    const currentMonth = format(currentDate, 'yyyy-MM')
    const selectedMonth = format(date, 'yyyy-MM')
    
    if (selectedMonth !== currentMonth) {
      toast({
        title: 'Kan inte välja datum från annan månad',
        description: 'Du kan endast välja datum i den aktuella månaden',
        variant: 'destructive',
      })
      return
    }

    setSelectedDate(date)
    
    // Load entries for this date
    if (monthEntries[dateStr]) {
      setEntries(monthEntries[dateStr].entries)
      setReportStatus(monthEntries[dateStr].reportStatus)
    } else {
      // Load if not in cache
      try {
        const data = await apiRequest<EntriesResponse>(`/get-entries?date=${dateStr}`, {
          method: 'GET',
        })
        setEntries(data?.entries || [])
        setReportStatus(data?.reportStatus || 'draft')
      } catch (error: any) {
        console.error('Error loading entries:', error)
        setEntries([])
        setReportStatus('draft')
      }
    }

    setIsModalOpen(true)
  }

  const handleEntrySaved = () => {
    if (selectedDate) {
      loadMonthEntries(currentDate)
      loadEntriesForDate(selectedDate)
    }
    setIsModalOpen(false)
  }

  const handleEntryDeleted = () => {
    if (selectedDate) {
      loadMonthEntries(currentDate)
      loadEntriesForDate(selectedDate)
    }
  }

  const loadEntriesForDate = async (date: Date) => {
    if (!isSignedIn) return

    // Use cached data from monthEntries instead of making another API call
    const dateStr = format(date, 'yyyy-MM-dd')
    const cachedData = monthEntries[dateStr]
    if (cachedData) {
      setEntries(cachedData.entries)
      setReportStatus(cachedData.reportStatus)
    } else {
      // If not in cache, reload the month (shouldn't happen normally)
      await loadMonthEntries(currentDate)
      const reloadedData = monthEntries[dateStr]
      if (reloadedData) {
        setEntries(reloadedData.entries)
        setReportStatus(reloadedData.reportStatus)
      }
    }
  }

  // Convert entries to FullCalendar events
  const calendarEvents = Object.entries(monthEntries).flatMap(([dateStr, data]) => {
    return data.entries.map((entry) => {
      const workTypeLabels = {
        cafe: 'Cafe',
        coaching: 'Coaching',
        administration: 'Admin',
        cleaning: 'Städning',
        annat: entry.annat_specification || 'Annat',
      }

      return {
        id: entry.id.toString(),
        title: `${entry.time_from.substring(0, 5)} - ${workTypeLabels[entry.work_type]}`,
        start: dateStr,
        allDay: true,
        backgroundColor: data.reportStatus === 'submitted' ? '#9ca3af' : '#3b82f6',
        borderColor: data.reportStatus === 'submitted' ? '#6b7280' : '#2563eb',
        textColor: '#ffffff',
        display: 'block',
      }
    })
  })

  const handleDatesSet = (arg: any) => {
    const newDate = startOfMonth(arg.start)
    const currentMonth = startOfMonth(today)
    const newMonthKey = format(newDate, 'yyyy-MM')
    const currentMonthKey = format(currentMonth, 'yyyy-MM')
    
    // Prevent navigation to future months - reset to current month if user tries
    if (newMonthKey > currentMonthKey) {
      if (calendarRef.current) {
        calendarRef.current.getApi().gotoDate(currentMonth)
      }
      return
    }
    
    // Update current date if month changed
    if (newMonthKey !== format(startOfMonth(currentDate), 'yyyy-MM')) {
      setCurrentDate(newDate)
    }
    
    // Disable next button if we're on current month or future
    setTimeout(() => {
      const nextButton = document.querySelector('.fc-next-button')
      if (nextButton) {
        if (newMonthKey >= currentMonthKey) {
          nextButton.classList.add('fc-button-disabled')
          nextButton.setAttribute('disabled', 'true')
        } else {
          nextButton.classList.remove('fc-button-disabled')
          nextButton.removeAttribute('disabled')
        }
      }
    }, 0)
  }

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
      
      {/* Calendar with premium container */}
      <div className="flex-1 overflow-hidden p-2 sm:p-3 md:p-4 lg:p-6">
        <div className="h-full w-full bg-white rounded-2xl shadow-2xl border border-slate-200/50 overflow-hidden">
          <div className="h-full p-3 sm:p-4 md:p-6">
            <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale="sv"
            firstDay={1}
            headerToolbar={{
              left: 'prev',
              center: 'title',
              right: 'next today',
            }}
            height="100%"
            selectable={true}
            selectMirror={true}
            dayMaxEvents={2}
            moreLinkClick="popover"
            events={calendarEvents}
            select={handleDateSelect}
            datesSet={handleDatesSet}
            fixedWeekCount={false}
            showNonCurrentDates={false}
            initialDate={today}
            dayCellClassNames={(arg) => {
              const dateStr = format(arg.date, 'yyyy-MM-dd')
              const dayData = monthEntries[dateStr]
              const dateMonth = format(arg.date, 'yyyy-MM')
              const todayMonth = format(today, 'yyyy-MM')
              const classes = ['hover:bg-blue-50', 'active:bg-blue-100', 'cursor-pointer', 'transition-colors', 'touch-manipulation']
              
              // Gray out if it's a future month
              if (dateMonth > todayMonth) {
                classes.push('opacity-40', 'pointer-events-none')
              }
              
              if (dayData?.reportStatus === 'submitted') {
                classes.push('opacity-60')
              }
              return classes
            }}
            eventClick={(info: EventClickArg) => {
              const eventDate = info.event.start
              if (eventDate) {
                handleDateSelect({
                  start: eventDate,
                  end: eventDate,
                  allDay: false,
                  jsEvent: info.jsEvent,
                  view: info.view,
                } as DateSelectArg)
              }
            }}
            dayHeaderFormat={{ weekday: 'short' }}
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
