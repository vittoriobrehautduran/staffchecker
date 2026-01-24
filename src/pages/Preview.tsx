import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'
import { calculateHours } from '@/utils/validation'
import { ArrowLeft } from 'lucide-react'

interface Entry {
  id: number
  date: string
  time_from: string
  time_to: string
  work_type: 'cafe' | 'coaching' | 'administration' | 'cleaning' | 'annat'
  annat_specification: string | null
  comment: string | null
}

interface ReportData {
  month: number
  year: number
  status: 'draft' | 'submitted'
  entries: Entry[]
}

export default function Preview() {
  const { isSignedIn, userId } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/login')
      return
    }
    loadReportData()
  }, [isSignedIn, userId])

  const loadReportData = async () => {
    if (!userId) return

    try {
      setIsLoading(true)
      const today = new Date()
      const month = today.getMonth() + 1
      const year = today.getFullYear()

      const data = await apiRequest<ReportData>(`/get-report?month=${month}&year=${year}&userId=${userId}`, {
        method: 'GET',
      })
      setReportData(data)
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

  const handleSubmit = async () => {
    if (!userId || !reportData) return

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
          userId,
        }),
      })

      toast({
        title: 'Rapport skickad!',
        description: 'Din timrapport har skickats till chefen',
      })

      navigate('/dashboard')
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

  const workTypeLabels = {
    cafe: 'Cafe',
    coaching: 'Coaching',
    administration: 'Administration',
    cleaning: 'Städning',
    annat: 'Annat',
  }

  const totalHours = reportData.entries.reduce((sum, entry) => {
    return sum + calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
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
                  const dateTotal = dateEntries.reduce((sum, entry) => {
                    return sum + calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
                  }, 0)

                  return (
                    <div key={dateStr} className="border-b pb-4 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold">
                          {format(new Date(dateStr), 'EEEE d MMMM yyyy', { locale: sv })}
                        </h3>
                        <span className="text-sm text-muted-foreground">
                          Totalt: {dateTotal.toFixed(1)} timmar
                        </span>
                      </div>
                      <div className="space-y-2 ml-4">
                        {dateEntries.map((entry) => {
                          const hours = calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
                          return (
                            <div key={entry.id} className="text-sm">
                              <span className="font-medium">
                                {entry.time_from.substring(0, 5)} - {entry.time_to.substring(0, 5)}
                              </span>
                              {' '}
                              <span className="text-muted-foreground">
                                ({hours.toFixed(1)}h) - {workTypeLabels[entry.work_type]}
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

