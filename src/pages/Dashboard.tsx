import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { addMonths, format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'
import { calculateHours } from '@/utils/validation'
import { Calendar, Eye, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'

type EntryType = 'work' | 'leave' | 'compensation'

interface Entry {
  id: number
  date: string
  entry_type: EntryType
  time_from: string | null
  time_to: string | null
}

interface ReportData {
  month: number
  year: number
  status: 'draft' | 'submitted'
  entries: Entry[]
}

const toMonthKey = (year: number, month: number): string =>
  `${year}-${month.toString().padStart(2, '0')}`

// Match calendar day keys so "dagar med registreringar" lines up with the grid.
function normalizeEntryDate(entryDate: string): string | null {
  if (!entryDate) return null
  const dateObj = new Date(entryDate)
  if (Number.isNaN(dateObj.getTime())) {
    return entryDate.length >= 10 ? entryDate.slice(0, 10) : null
  }
  return format(dateObj, 'yyyy-MM-dd')
}

// Same hour rules as förhandsvisning: only timed work/leave rows (not helledag-ledighet).
function summarizeEntries(entries: Entry[]) {
  const dayKeys = new Set<string>()
  let workedHours = 0
  let leaveHours = 0

  for (const entry of entries) {
    const dk = normalizeEntryDate(entry.date)
    if (dk) dayKeys.add(dk)

    if (entry.entry_type === 'work' && entry.time_from && entry.time_to) {
      workedHours += calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
    }
    if (entry.entry_type === 'leave' && entry.time_from && entry.time_to) {
      leaveHours += calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
    }
  }

  return {
    workedHours,
    leaveHours,
    daysWithEntries: dayKeys.size,
    entryCount: entries.length,
  }
}

function statusLabel(status: 'draft' | 'submitted') {
  return status === 'submitted' ? 'Inskickad' : 'Utkast'
}

type MonthSummaryProps = {
  title: string
  report: ReportData | null
  loadError: boolean
}

// One month block: neutral stats only (no alerts or "action required" wording).
function MonthSummaryCard({ title, report, loadError }: MonthSummaryProps) {
  if (loadError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Kunde inte ladda data för denna period.</p>
        </CardContent>
      </Card>
    )
  }

  if (!report) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Laddar…</p>
        </CardContent>
      </Card>
    )
  }

  const monthTitle = format(new Date(report.year, report.month - 1), 'MMMM yyyy', { locale: sv })
  const { workedHours, leaveHours, daysWithEntries, entryCount } = summarizeEntries(report.entries)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base capitalize">{title}</CardTitle>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium',
              report.status === 'submitted'
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {statusLabel(report.status)}
          </span>
        </div>
        <CardDescription className="capitalize">{monthTitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Arbetade timmar</dt>
            <dd className="text-lg font-semibold tabular-nums">{workedHours.toFixed(1)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Ledighet (timmar)</dt>
            <dd className="text-lg font-semibold tabular-nums">{leaveHours.toFixed(1)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Dagar med poster</dt>
            <dd className="text-lg font-semibold tabular-nums">{daysWithEntries}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Antal poster</dt>
            <dd className="text-lg font-semibold tabular-nums">{entryCount}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const { isSignedIn, user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [currentReport, setCurrentReport] = useState<ReportData | null>(null)
  const [previousReport, setPreviousReport] = useState<ReportData | null>(null)
  const [currentError, setCurrentError] = useState(false)
  const [previousError, setPreviousError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const loadDashboard = useCallback(async () => {
    if (!isSignedIn) return

    setIsLoading(true)
    setCurrentError(false)
    setPreviousError(false)

    const today = new Date()
    const curMonth = today.getMonth() + 1
    const curYear = today.getFullYear()
    const prevRef = addMonths(today, -1)
    const prevMonth = prevRef.getMonth() + 1
    const prevYear = prevRef.getFullYear()

    try {
      const [cur, prev] = await Promise.all([
        apiRequest<ReportData>(`/get-report?month=${curMonth}&year=${curYear}`, { method: 'GET' }),
        apiRequest<ReportData>(`/get-report?month=${prevMonth}&year=${prevYear}`, { method: 'GET' }),
      ])
      setCurrentReport(cur)
      setPreviousReport(prev)
    } catch (e: unknown) {
      console.error('Dashboard load failed:', e)
      const message = e instanceof Error ? e.message : 'Ett fel uppstod'
      toast({
        title: 'Kunde inte ladda översikten',
        description: message,
        variant: 'destructive',
      })
      setCurrentError(true)
      setPreviousError(true)
      setCurrentReport(null)
      setPreviousReport(null)
    } finally {
      setIsLoading(false)
    }
  }, [isSignedIn, toast])

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/login')
      return
    }
    loadDashboard()
  }, [isSignedIn, navigate, loadDashboard])

  if (!isSignedIn) {
    return null
  }

  const currentMonthKey =
    currentReport != null ? toMonthKey(currentReport.year, currentReport.month) : toMonthKey(new Date().getFullYear(), new Date().getMonth() + 1)

  const displayName = user?.name?.trim() || 'du'

  return (
    <div className="min-h-screen flex-1 bg-background p-4 md:p-6">
      <div className="container mx-auto max-w-4xl space-y-6">
        <div>
          <div className="mb-1 flex items-center gap-2 text-muted-foreground">
            <LayoutDashboard className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wide">Översikt</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Hej{displayName !== 'du' ? `, ${displayName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sammanfattning av denna och föregående månad. Öppna kalendern eller förhandsvisning när du vill redigera eller skicka rapporten.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <MonthSummaryCard
            title="Denna månad"
            report={isLoading ? null : currentReport}
            loadError={currentError}
          />
          <MonthSummaryCard
            title="Föregående månad"
            report={isLoading ? null : previousReport}
            loadError={previousError}
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Genvägar</CardTitle>
            <CardDescription>Kalender och förhandsvisning använder samma data som här ovan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" className="w-full sm:w-auto" onClick={() => navigate('/report')}>
              <Calendar className="mr-2 h-4 w-4" aria-hidden />
              Kalender
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => navigate('/preview', { state: { reportMonthKey: currentMonthKey } })}
            >
              <Eye className="mr-2 h-4 w-4" aria-hidden />
              Förhandsvisa
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
