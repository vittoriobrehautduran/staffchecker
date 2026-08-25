import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { addMonths, format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'
import {
  readReportMonthCache,
  toReportMonthKey,
  writeReportMonthCache,
} from '@/lib/reportMonthCache'
import { calculateHours } from '@/utils/validation'
import { Calendar, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ClubPageHeader,
  ClubPageShell,
  ClubSoftPanel,
} from '@/pages/club/clubUi'
import { DashboardSkeleton } from '@/components/ui/page-skeletons'

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

function MonthSummaryCard({ title, report, loadError }: MonthSummaryProps) {
  if (loadError) {
    return (
      <ClubSoftPanel title={title}>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Kunde inte ladda data för denna period.
        </p>
      </ClubSoftPanel>
    )
  }

  if (!report) {
    return (
      <ClubSoftPanel>
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-xl bg-muted/30 px-3 py-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-14" />
            </div>
          ))}
        </div>
      </ClubSoftPanel>
    )
  }

  const monthTitle = format(new Date(report.year, report.month - 1), 'MMMM yyyy', { locale: sv })
  const { workedHours, leaveHours, daysWithEntries, entryCount } = summarizeEntries(report.entries)

  return (
    <ClubSoftPanel
      title={title}
      description={monthTitle}
      actions={
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
            report.status === 'submitted'
              ? 'bg-primary/15 text-primary'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {statusLabel(report.status)}
        </span>
      }
    >
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-xl bg-muted/40 px-3 py-3">
          <dt className="text-muted-foreground">Arbetade timmar</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
            {workedHours.toFixed(1)}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-3">
          <dt className="text-muted-foreground">Ledighet (timmar)</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
            {leaveHours.toFixed(1)}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-3">
          <dt className="text-muted-foreground">Dagar med poster</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
            {daysWithEntries}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-3">
          <dt className="text-muted-foreground">Antal poster</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{entryCount}</dd>
        </div>
      </dl>
    </ClubSoftPanel>
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
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadDashboard = useCallback(
    async (options?: { background?: boolean }) => {
      if (!isSignedIn) return

      const today = new Date()
      const curMonth = today.getMonth() + 1
      const curYear = today.getFullYear()
      const prevRef = addMonths(today, -1)
      const prevMonth = prevRef.getMonth() + 1
      const prevYear = prevRef.getFullYear()

      const curKey = toReportMonthKey(curYear, curMonth)
      const prevKey = toReportMonthKey(prevYear, prevMonth)
      const cachedCur = readReportMonthCache(curKey)
      const cachedPrev = readReportMonthCache(prevKey)
      const hasCache = !!cachedCur && !!cachedPrev

      if (!options?.background && !hasCache) {
        setIsLoading(true)
      } else if (options?.background) {
        setIsRefreshing(true)
      }

      if (cachedCur) {
        setCurrentReport(cachedCur as ReportData)
        setCurrentError(false)
      }
      if (cachedPrev) {
        setPreviousReport(cachedPrev as ReportData)
        setPreviousError(false)
      }

      try {
        const [cur, prev] = await Promise.all([
          apiRequest<ReportData>(`/get-report?month=${curMonth}&year=${curYear}`, { method: 'GET' }),
          apiRequest<ReportData>(`/get-report?month=${prevMonth}&year=${prevYear}`, { method: 'GET' }),
        ])
        setCurrentReport(cur)
        setPreviousReport(prev)
        writeReportMonthCache(cur)
        writeReportMonthCache(prev)
        setCurrentError(false)
        setPreviousError(false)
      } catch (e: unknown) {
        console.error('Dashboard load failed:', e)
        if (!options?.background || !hasCache) {
          const message = e instanceof Error ? e.message : 'Ett fel uppstod'
          toast({
            title: 'Kunde inte ladda översikten',
            description: message,
            variant: 'destructive',
          })
          setCurrentError(true)
          setPreviousError(true)
          if (!cachedCur) setCurrentReport(null)
          if (!cachedPrev) setPreviousReport(null)
        }
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [isSignedIn, toast]
  )

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/login')
      return
    }
    const today = new Date()
    const curKey = toReportMonthKey(today.getFullYear(), today.getMonth() + 1)
    const prevRef = addMonths(today, -1)
    const prevKey = toReportMonthKey(prevRef.getFullYear(), prevRef.getMonth() + 1)
    const hasCache = !!readReportMonthCache(curKey) && !!readReportMonthCache(prevKey)

    if (hasCache) {
      void loadDashboard({ background: true })
    } else {
      void loadDashboard()
    }
  }, [isSignedIn, navigate, loadDashboard])

  if (!isSignedIn) {
    return null
  }

  if (isLoading && !currentReport && !previousReport) {
    return <DashboardSkeleton />
  }

  const currentMonthKey =
    currentReport != null
      ? toReportMonthKey(currentReport.year, currentReport.month)
      : toReportMonthKey(new Date().getFullYear(), new Date().getMonth() + 1)

  const displayName = user?.name?.trim() || 'du'

  return (
    <ClubPageShell>
      <ClubPageHeader
        eyebrow="Översikt"
        title={displayName !== 'du' ? `Hej, ${displayName}` : 'Hej'}
        description="Sammanfattning av denna och föregående månad. Öppna kalendern eller förhandsvisning när du vill redigera eller skicka rapporten."
      />

      {isRefreshing && (
        <p className="-mt-2 text-xs text-muted-foreground">Uppdaterar i bakgrunden…</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <MonthSummaryCard
          title="Denna månad"
          report={isLoading && !currentReport ? null : currentReport}
          loadError={currentError}
        />
        <MonthSummaryCard
          title="Föregående månad"
          report={isLoading && !previousReport ? null : previousReport}
          loadError={previousError}
        />
      </div>

      <ClubSoftPanel
        title="Genvägar"
        description="Kalender och förhandsvisning använder samma data som här ovan."
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => navigate('/report')}
          >
            <Calendar className="mr-2 h-4 w-4" aria-hidden />
            Öppna kalender
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => navigate('/preview', { state: { reportMonthKey: currentMonthKey } })}
          >
            <Eye className="mr-2 h-4 w-4" aria-hidden />
            Förhandsvisa
          </Button>
        </div>
      </ClubSoftPanel>
    </ClubPageShell>
  )
}
