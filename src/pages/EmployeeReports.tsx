import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addMonths, format, subMonths } from 'date-fns'
import { sv } from 'date-fns/locale'
import { useAuth } from '@/contexts/AuthContext'
import { apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import {
  ReportEntriesReadOnly,
  type ReportEntry,
} from '@/components/reports/ReportEntriesReadOnly'
import { cn } from '@/lib/utils'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'

type EmployeeSummary = {
  userId: number
  name: string
  lastName: string
  email: string
  hasReport: boolean
  status: 'draft' | 'submitted'
  submittedAt: string | null
  workedHours: number
  leaveHours: number
  entryCount: number
}

type ListResponse = {
  month: number
  year: number
  employees: EmployeeSummary[]
}

type DetailResponse = {
  month: number
  year: number
  status: 'draft' | 'submitted'
  submittedAt: string | null
  user: { id: number; name: string; lastName: string; email: string }
  workedHours: number
  leaveHours: number
  entryCount: number
  entries: ReportEntry[]
  readOnly: boolean
}

function statusLabel(status: 'draft' | 'submitted') {
  return status === 'submitted' ? 'Inskickad' : 'Utkast'
}

export default function EmployeeReports() {
  const { isSignedIn, user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [monthDate, setMonthDate] = useState(() => subMonths(new Date(), 1))
  const [list, setList] = useState<EmployeeSummary[]>([])
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  const month = monthDate.getMonth() + 1
  const year = monthDate.getFullYear()
  const monthLabel = format(monthDate, 'MMMM yyyy', { locale: sv })

  const canAccess = !!user?.hasEmployeeReportsAccess

  const loadList = useCallback(async () => {
    setIsLoadingList(true)
    try {
      const data = await apiRequest<ListResponse>(
        `/list-employee-reports?month=${month}&year=${year}`,
        { method: 'GET' }
      )
      setList(data.employees)
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte ladda personal',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
      setList([])
    } finally {
      setIsLoadingList(false)
    }
  }, [month, year, toast])

  const loadDetail = useCallback(
    async (userId: number) => {
      setIsLoadingDetail(true)
      setDetail(null)
      try {
        const data = await apiRequest<DetailResponse>(
          `/get-employee-report?userId=${userId}&month=${month}&year=${year}`,
          { method: 'GET' }
        )
        setDetail(data)
      } catch (error: unknown) {
        const err = error as { message?: string }
        toast({
          title: 'Kunde inte ladda rapport',
          description: err?.message || 'Ett fel uppstod',
          variant: 'destructive',
        })
        setDetail(null)
        setSelectedUserId(null)
      } finally {
        setIsLoadingDetail(false)
      }
    },
    [month, year, toast]
  )

  function openEmployee(userId: number) {
    setSelectedUserId(userId)
  }

  function closeEmployee() {
    setSelectedUserId(null)
    setDetail(null)
  }

  useEffect(() => {
    if (!isSignedIn) {
      navigate('/login')
      return
    }
    if (user && !canAccess) {
      navigate('/dashboard', { replace: true })
    }
  }, [isSignedIn, user, canAccess, navigate])

  useEffect(() => {
    if (!canAccess) return
    setSelectedUserId(null)
    setDetail(null)
    void loadList()
  }, [canAccess, loadList])

  useEffect(() => {
    if (!canAccess || selectedUserId === null) return
    void loadDetail(selectedUserId)
  }, [canAccess, selectedUserId, loadDetail])

  const sortedEmployees = useMemo(() => {
    return [...list].sort((a, b) => {
      const last = a.lastName.localeCompare(b.lastName, 'sv')
      if (last !== 0) return last
      return a.name.localeCompare(b.name, 'sv')
    })
  }, [list])

  if (!isSignedIn || !canAccess) {
    return null
  }

  const earliestMonth = subMonths(new Date(), 24)
  const canGoOlder = monthDate > earliestMonth
  const canGoNewer = monthDate < new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  return (
    <div className="min-h-screen flex-1 bg-background p-4 md:p-6">
      <div className="container mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Personalens tidsrapporter</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Klicka på en medarbetare för att se hela månadsrapporten — dag för dag med tider och
            typ av arbete.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base capitalize">{monthLabel}</CardTitle>
                <CardDescription>
                  {selectedUserId === null
                    ? 'Klicka på en rad för att öppna rapporten'
                    : 'Byt medarbetare genom att klicka på en annan rad'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!canGoOlder || isLoadingList || isLoadingDetail}
                  aria-label="Föregående månad"
                  onClick={() => {
                    closeEmployee()
                    setMonthDate((current) => subMonths(current, 1))
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!canGoNewer || isLoadingList || isLoadingDetail}
                  aria-label="Nästa månad"
                  onClick={() => {
                    closeEmployee()
                    setMonthDate((current) => addMonths(current, 1))
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoadingList ? (
              <p className="text-sm text-muted-foreground">Laddar...</p>
            ) : sortedEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga medarbetare hittades.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Namn</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 pr-3 font-medium text-right">Arbetstid</th>
                      <th className="pb-2 pr-3 font-medium text-right">Ledighet</th>
                      <th className="pb-2 font-medium text-right">Poster</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEmployees.map((employee) => {
                      const isSelected = selectedUserId === employee.userId
                      return (
                        <tr
                          key={employee.userId}
                          className={cn(
                            'cursor-pointer border-b transition-colors last:border-0',
                            isSelected
                              ? 'bg-primary/10 hover:bg-primary/15'
                              : 'hover:bg-muted/50'
                          )}
                          onClick={() => openEmployee(employee.userId)}
                        >
                          <td className="py-2.5 pr-3">
                            <span className="font-medium">
                              {employee.name} {employee.lastName}
                            </span>
                            <p className="text-xs text-muted-foreground">{employee.email}</p>
                          </td>
                          <td className="py-2.5 pr-3">
                            {employee.hasReport ? statusLabel(employee.status) : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {employee.workedHours > 0 ? `${employee.workedHours.toFixed(1)} h` : '—'}
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            {employee.leaveHours > 0 ? `${employee.leaveHours.toFixed(1)} h` : '—'}
                          </td>
                          <td className="py-2.5 text-right tabular-nums">
                            {employee.entryCount || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedUserId !== null && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {isLoadingDetail || !detail ? (
                    <>
                      <CardTitle className="text-base">Laddar rapport...</CardTitle>
                      <CardDescription className="capitalize">{monthLabel}</CardDescription>
                    </>
                  ) : (
                    <>
                      <CardTitle className="text-lg">
                        {detail.user.name} {detail.user.lastName}
                      </CardTitle>
                      <CardDescription>
                        {detail.user.email} · {statusLabel(detail.status)}
                        {detail.submittedAt && (
                          <>
                            {' '}
                            · Inskickad{' '}
                            {format(new Date(detail.submittedAt), 'd MMM yyyy HH:mm', {
                              locale: sv,
                            })}
                          </>
                        )}
                      </CardDescription>
                      <p className="mt-2 text-sm text-muted-foreground capitalize">
                        Rapport för {monthLabel}
                      </p>
                    </>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 shrink-0"
                  onClick={closeEmployee}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Stäng
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {isLoadingDetail || !detail ? (
                <p className="text-sm text-muted-foreground">Hämtar alla dagar och poster...</p>
              ) : detail.entryCount === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Inga registrerade timmar för {monthLabel}.
                </p>
              ) : (
                <div className="max-h-[min(70vh,720px)] overflow-y-auto rounded-lg border bg-muted/20 p-4">
                  <ReportEntriesReadOnly entries={detail.entries} />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
