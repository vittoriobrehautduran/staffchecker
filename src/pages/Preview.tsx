import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { addMonths, format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'
import { calculateHours } from '@/utils/validation'
import { ArrowLeft } from 'lucide-react'

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

export default function Preview() {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>('current')

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/login')
      return
    }
    initializeReportPeriod()
  }, [isSignedIn])

  // Decide which month to show first:
  // - If last month's report is not submitted -> show last month
  // - If last month's report is submitted     -> show current month
  const initializeReportPeriod = async () => {
    if (!isSignedIn) return

    try {
      setIsLoading(true)

      const today = new Date()
      const lastMonthDate = addMonths(today, -1)
      const lastMonth = lastMonthDate.getMonth() + 1
      const lastYear = lastMonthDate.getFullYear()

      // Try last month first
      const lastMonthData = await apiRequest<ReportData>(
        `/get-report?month=${lastMonth}&year=${lastYear}`,
        { method: 'GET' }
      )

      if (lastMonthData.status !== 'submitted') {
        setReportData(lastMonthData)
        setSelectedPeriod('previous')
        return
      }

      // If last month is already submitted, fall back to current month
      await loadReportData('current')
    } catch (error: any) {
      console.error('Error initializing report period:', error)
      toast({
        title: 'Kunde inte ladda rapport',
        description: error.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadReportData = async (period: ReportPeriod) => {
    if (!isSignedIn) return

    try {
      setIsLoading(true)

      const today = new Date()
      const baseDate = period === 'current' ? today : addMonths(today, -1)
      const month = baseDate.getMonth() + 1
      const year = baseDate.getFullYear()

      const data = await apiRequest<ReportData>(`/get-report?month=${month}&year=${year}`, {
        method: 'GET',
      })
      setReportData(data)
      setSelectedPeriod(period)
    } catch (error: any) {
      console.error('Error loading report:', error)
      toast({
        title: 'Kunde inte ladda rapport',
        description: error.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangePeriod = async (period: ReportPeriod) => {
    if (!isSignedIn || period === selectedPeriod) return
    await loadReportData(period)
  }

  const handleSubmit = async () => {
    if (!reportData) return

    if (reportData.entries.length === 0) {
      toast({
        title: 'Inga poster',
        description: 'Du måste ha minst en post för att kunna skicka rapporten',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      await apiRequest('/submit-report', {
        method: 'POST',
        body: JSON.stringify({
          month: reportData.month,
          year: reportData.year,
        }),
      })

      toast({
        title: 'Rapport skickad!',
        description: 'Din timrapport har skickats till chefen',
      })

      navigate('/report')
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center">Laddar...</div>
        </div>
      </div>
    )
  }

  if (!reportData) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="container mx-auto max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>Ingen rapport hittades</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/report')}>
                Gå till kalender
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const monthName = format(new Date(reportData.year, reportData.month - 1), 'MMMM yyyy', { locale: sv })
  
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

  const totalHours = reportData.entries.reduce((sum, entry) => {
    if (entry.time_from && entry.time_to) {
      return sum + calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
    }
    return sum
  }, 0)

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-4">
          <Button variant="ghost" onClick={() => navigate('/report')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka till kalender
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Förhandsvisning - {monthName}</CardTitle>
            <CardDescription>
              Granska din rapport innan du skickar den
            </CardDescription>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant={selectedPeriod === 'previous' ? 'default' : 'outline'}
                size="sm"
                disabled={isLoading || isSubmitting}
                onClick={() => handleChangePeriod('previous')}
              >
                Förra månaden
              </Button>
              <Button
                type="button"
                variant={selectedPeriod === 'current' ? 'default' : 'outline'}
                size="sm"
                disabled={isLoading || isSubmitting}
                onClick={() => handleChangePeriod('current')}
              >
                Denna månad
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {sortedDates.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Inga poster för denna månad. Gå till kalendern för att lägga till timmar.
              </p>
            ) : (
              <>
                {sortedDates.map((dateStr) => {
                  const dateEntries = entriesByDate[dateStr]
                  const dateWorkEntries = dateEntries.filter(e => e.entry_type === 'work')
                  const dateLeaveEntries = dateEntries.filter(e => e.entry_type === 'leave')
                  const dateCompensationEntries = dateEntries.filter(e => e.entry_type === 'compensation')
                  
                  const dateTotal = dateEntries.reduce((sum, entry) => {
                    if (entry.time_from && entry.time_to) {
                      return sum + calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
                    }
                    return sum
                  }, 0)

                  return (
                    <div key={dateStr} className="border-b pb-4 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold">
                          {format(new Date(dateStr), 'EEEE d MMMM yyyy', { locale: sv })}
                        </h3>
                        {dateTotal > 0 && (
                          <span className="text-sm text-muted-foreground">
                            Totalt: {dateTotal.toFixed(1)} timmar
                          </span>
                        )}
                      </div>
                      <div className="space-y-4 ml-4">
                        {/* Work Entries */}
                        {dateWorkEntries.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">Arbete</h4>
                            <div className="space-y-2">
                              {dateWorkEntries.map((entry) => {
                                if (!entry.time_from || !entry.time_to) return null
                                const hours = calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
                                return (
                                  <div key={entry.id} className="text-sm">
                                    <span className="font-medium">
                                      {entry.time_from.substring(0, 5)} - {entry.time_to.substring(0, 5)}
                                    </span>
                                    {' '}
                                    <span className="text-muted-foreground">
                                      ({hours.toFixed(1)}h) - {entry.work_type && workTypeLabels[entry.work_type]}
                                      {entry.work_type === 'privat_traning' && (
                                        <>
                                          {entry.student_count && (
                                            <span> ({entry.student_count} {entry.student_count === 1 ? 'elev' : 'elever'})</span>
                                          )}
                                          {entry.sport_type && (
                                            <span> - {entry.sport_type === 'tennis' ? '🎾 Tennis' : '🏓 Bordtennis'}</span>
                                          )}
                                        </>
                                      )}
                                    </span>
                                    {entry.work_type === 'annat' && entry.annat_specification && (
                                      <span className="text-muted-foreground">
                                        {' '}- {entry.annat_specification}
                                      </span>
                                    )}
                                    {entry.comment && (
                                      <div className="text-muted-foreground ml-6">
                                        {entry.comment}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Leave Entries */}
                        {dateLeaveEntries.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">Ledighet</h4>
                            <div className="space-y-2">
                              {dateLeaveEntries.map((entry) => {
                                if (entry.is_full_day_leave) {
                                  return (
                                    <div key={entry.id} className="text-sm">
                                      <span className="font-medium">Hela dagen</span>
                                      {' '}
                                      <span className="text-muted-foreground">
                                        - {entry.leave_type && leaveTypeLabels[entry.leave_type]}
                                      </span>
                                      {entry.comment && (
                                        <div className="text-muted-foreground ml-6">
                                          {entry.comment}
                                        </div>
                                      )}
                                    </div>
                                  )
                                }
                                if (!entry.time_from || !entry.time_to) return null
                                const hours = calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
                                return (
                                  <div key={entry.id} className="text-sm">
                                    <span className="font-medium">
                                      {entry.time_from.substring(0, 5)} - {entry.time_to.substring(0, 5)}
                                    </span>
                                    {' '}
                                    <span className="text-muted-foreground">
                                      ({hours.toFixed(1)}h) - {entry.leave_type && leaveTypeLabels[entry.leave_type]}
                                    </span>
                                    {entry.comment && (
                                      <div className="text-muted-foreground ml-6">
                                        {entry.comment}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Compensation Entries */}
                        {dateCompensationEntries.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-2">Ersättning</h4>
                            <div className="space-y-2">
                              {dateCompensationEntries.map((entry) => (
                                <div key={entry.id} className="text-sm">
                                  <span className="font-medium">
                                    {entry.compensation_type && compensationTypeLabels[entry.compensation_type]}
                                  </span>
                                  {entry.compensation_type === 'milersattning' && entry.mileage_km && (
                                    <span className="text-muted-foreground ml-2">
                                      - {entry.mileage_km} km
                                    </span>
                                  )}
                                  {entry.compensation_type === 'annan_ersattning' && (
                                    <>
                                      {entry.compensation_description && (
                                        <span className="text-muted-foreground ml-2">
                                          - {entry.compensation_description}
                                        </span>
                                      )}
                                      {entry.compensation_amount && (
                                        <span className="text-muted-foreground ml-2 font-semibold">
                                          {entry.compensation_amount} SEK
                                        </span>
                                      )}
                                    </>
                                  )}
                                  {entry.comment && (
                                    <div className="text-muted-foreground ml-6">
                                      {entry.comment}
                                    </div>
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

                <div className="border-t pt-4 mt-6">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold">Totalt för månaden:</span>
                    <span className="text-lg font-semibold">{totalHours.toFixed(1)} timmar</span>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || reportData.status === 'submitted'}
                    className="flex-1"
                  >
                    {isSubmitting
                      ? 'Skickar...'
                      : reportData.status === 'submitted'
                      ? 'Rapport redan skickad'
                      : 'Skicka rapport'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/report')}
                    disabled={isSubmitting}
                  >
                    Redigera
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

