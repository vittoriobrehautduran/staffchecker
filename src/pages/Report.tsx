import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { format, isSameMonth, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
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
  const { isSignedIn, userId } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const calendarRef = useRef<FullCalendar>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
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

  const today = new Date()

  const loadMonthEntries = async (date: Date) => {
    if (!userId || loadingRef.current) return

    const monthKey = format(date, 'yyyy-MM')
    if (lastLoadedMonthRef.current === monthKey) {
      return
    }

    try {
      loadingRef.current = true
      lastLoadedMonthRef.current = monthKey
      const monthStart = startOfMonth(date)
      const monthEnd = endOfMonth(date)
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

      const entriesMap: MonthEntries = {}

      // Load entries for all days in parallel
      const promises = days.map(async (day) => {
        const dateStr = format(day, 'yyyy-MM-dd')
        try {
          const data = await apiRequest<EntriesResponse>(`/get-entries?date=${dateStr}&userId=${userId}`, {
            method: 'GET',
          })
          entriesMap[dateStr] = {
            entries: data?.entries || [],
            reportStatus: data?.reportStatus || 'draft',
          }
        } catch (error) {
          entriesMap[dateStr] = {
            entries: [],
            reportStatus: 'draft',
          }
        }
      })

      await Promise.all(promises)
      setMonthEntries(entriesMap)
    } catch (error: any) {
      console.error('Error loading month entries:', error)
    } finally {
      loadingRef.current = false
    }
  }

  useEffect(() => {
    if (userId) {
      const monthKey = format(currentDate, 'yyyy-MM')
      if (lastLoadedMonthRef.current !== monthKey) {
        loadMonthEntries(currentDate)
      }
    }
  }, [currentDate, userId])

  const handleDateSelect = async (selectInfo: DateSelectArg) => {
    const date = selectInfo.start
    const dateStr = format(date, 'yyyy-MM-dd')

    // Check if date is in the future
    if (date > today && !isSameMonth(date, today)) {
      toast({
        title: 'Kan inte välja framtida datum',
        description: 'Du kan endast välja datum i nuvarande eller tidigare månader',
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
        const data = await apiRequest<EntriesResponse>(`/get-entries?date=${dateStr}&userId=${userId}`, {
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
    if (!userId) return

    try {
      const dateStr = format(date, 'yyyy-MM-dd')
      const data = await apiRequest<EntriesResponse>(`/get-entries?date=${dateStr}&userId=${userId}`, {
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
    const currentMonth = startOfMonth(currentDate)
    
    // Only update if month actually changed
    if (format(newDate, 'yyyy-MM') !== format(currentMonth, 'yyyy-MM')) {
      setCurrentDate(newDate)
    }
  }

  return (
    <div className="h-[calc(100vh-64px)] bg-background flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-2xl font-bold">Timrapport</h1>
          <p className="text-sm text-muted-foreground">
            Klicka på ett datum för att lägga till eller redigera timmar
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => navigate('/preview')}
        >
          Förhandsvisa
        </Button>
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <div className="h-full w-full">
          <div className="h-full">
            <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale="sv"
            firstDay={1}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: '',
            }}
            height="100%"
            selectable={true}
            selectMirror={true}
            dayMaxEvents={true}
            moreLinkClick="popover"
            events={calendarEvents}
            select={handleDateSelect}
            datesSet={handleDatesSet}
            validRange={{
              end: today,
            }}
            dayCellClassNames={(arg) => {
              const dateStr = format(arg.date, 'yyyy-MM-dd')
              const dayData = monthEntries[dateStr]
              const classes = ['hover:bg-accent/50', 'cursor-pointer']
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
        userId={userId || undefined}
        reportStatus={reportStatus}
      />
    </div>
  )
}
