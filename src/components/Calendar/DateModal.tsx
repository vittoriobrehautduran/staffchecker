import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { apiRequest } from '@/services/api'
import { calculateHours, validateTimeRange } from '@/utils/validation'
import { Trash2, Edit2 } from 'lucide-react'

// Generate time options in 10-minute intervals (24-hour format)
const generateTimeOptions = (): string[] => {
  const options: string[] = []
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 10) {
      const hourStr = hour.toString().padStart(2, '0')
      const minuteStr = minute.toString().padStart(2, '0')
      options.push(`${hourStr}:${minuteStr}`)
    }
  }
  return options
}

// Round time to nearest 10 minutes
const roundToNearest10Minutes = (timeStr: string): string => {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const roundedMinutes = Math.round(minutes / 10) * 10
  const finalMinutes = roundedMinutes >= 60 ? 0 : roundedMinutes
  const finalHours = roundedMinutes >= 60 ? (hours + 1) % 24 : hours
  return `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`
}

const TIME_OPTIONS = generateTimeOptions()

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

interface DateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: Date | undefined
  entries: Entry[]
  onEntrySaved: () => void
  onEntryDeleted: () => void
  reportStatus: 'draft' | 'submitted'
}

export function DateModal({
  open,
  onOpenChange,
  date,
  entries,
  onEntrySaved,
  onEntryDeleted,
  reportStatus,
}: DateModalProps) {
  const [selectedEntryType, setSelectedEntryType] = useState<EntryType | ''>('')
  const [timeFrom, setTimeFrom] = useState('12:00')
  const [timeTo, setTimeTo] = useState('12:00')
  const [workType, setWorkType] = useState<WorkType | ''>('')
  const [leaveType, setLeaveType] = useState<LeaveType | ''>('')
  const [compensationType, setCompensationType] = useState<CompensationType | ''>('')
  const [studentCount, setStudentCount] = useState<number | 'fler' | ''>('')
  const [studentCountMore, setStudentCountMore] = useState('')
  const [sportType, setSportType] = useState<SportType | ''>('')
  const [isFullDayLeave, setIsFullDayLeave] = useState(false)
  const [mileageKm, setMileageKm] = useState('')
  const [compensationAmount, setCompensationAmount] = useState('')
  const [compensationDescription, setCompensationDescription] = useState('')
  const [annatSpec, setAnnatSpec] = useState('')
  const [comment, setComment] = useState('')
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (!open && date) {
      resetForm()
    }
  }, [open, date])

  const resetForm = () => {
    setSelectedEntryType('')
    setTimeFrom('12:00')
    setTimeTo('12:00')
    setWorkType('')
    setLeaveType('')
    setCompensationType('')
    setStudentCount('')
    setStudentCountMore('')
    setSportType('')
    setIsFullDayLeave(false)
    setMileageKm('')
    setCompensationAmount('')
    setCompensationDescription('')
    setAnnatSpec('')
    setComment('')
    setEditingEntry(null)
  }

  const handleEdit = (entry: Entry) => {
    if (reportStatus === 'submitted') {
      toast({
        title: 'Rapport redan skickad',
        description: 'Du kan inte redigera poster i en skickad rapport',
        variant: 'destructive',
      })
      return
    }
    setEditingEntry(entry)
    setSelectedEntryType(entry.entry_type)
    
    if (entry.time_from && entry.time_to) {
      const timeFromStr = entry.time_from.substring(0, 5)
      const timeToStr = entry.time_to.substring(0, 5)
      setTimeFrom(roundToNearest10Minutes(timeFromStr))
      setTimeTo(roundToNearest10Minutes(timeToStr))
    } else {
      setTimeFrom('12:00')
      setTimeTo('12:00')
    }
    
    if (entry.entry_type === 'work') {
      setWorkType(entry.work_type || '')
      setAnnatSpec(entry.annat_specification || '')
      setStudentCount(entry.student_count || '')
      setStudentCountMore(entry.student_count && entry.student_count > 4 ? entry.student_count.toString() : '')
      setSportType(entry.sport_type || '')
    } else if (entry.entry_type === 'leave') {
      setLeaveType(entry.leave_type || '')
      setIsFullDayLeave(entry.is_full_day_leave || false)
    } else if (entry.entry_type === 'compensation') {
      setCompensationType(entry.compensation_type || '')
      setMileageKm(entry.mileage_km?.toString() || '')
      setCompensationAmount(entry.compensation_amount?.toString() || '')
      setCompensationDescription(entry.compensation_description || '')
    }
    
    setComment(entry.comment || '')
  }

  const handleDeleteClick = (entryId: number) => {
    if (reportStatus === 'submitted') {
      toast({
        title: 'Rapport redan skickad',
        description: 'Du kan inte redigera poster i en skickad rapport',
        variant: 'destructive',
      })
      return
    }
    setPendingDeleteId(entryId)
    }

  const handleDeleteConfirm = async (entryId: number) => {
    try {
      await apiRequest(`/delete-entry`, {
        method: 'DELETE',
        body: JSON.stringify({ entryId }),
      })
      toast({
        title: 'Post borttagen',
        description: 'Timposten har tagits bort',
      })
      setPendingDeleteId(null)
      onEntryDeleted()
      if (editingEntry?.id === entryId) {
        resetForm()
      }
    } catch (error: any) {
      console.error('Error deleting entry:', error)
      toast({
        title: 'Kunde inte ta bort post',
        description: error.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
      setPendingDeleteId(null)
    }
  }

  const handleDeleteCancel = () => {
    setPendingDeleteId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (reportStatus === 'submitted') {
      toast({
        title: 'Rapport redan skickad',
        description: 'Du kan inte lägga till eller redigera poster i en skickad rapport',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    if (!date) {
      setIsSubmitting(false)
      return
    }

    // If editing, use the entry's entry_type, otherwise require selection
    const entryType = editingEntry ? editingEntry.entry_type : selectedEntryType

    if (!entryType) {
      toast({
        title: 'Välj typ',
        description: 'Välj typ av post (Arbete, Ledighet eller Ersättning)',
        variant: 'destructive',
      })
      setIsSubmitting(false)
      return
    }

    try {
      let entryData: any = {
        date: format(date, 'yyyy-MM-dd'),
        entry_type: entryType,
        comment: comment || null,
      }

      if (entryType === 'work') {
        if (!workType) {
          toast({
            title: 'Fält saknas',
            description: 'Välj typ av arbete',
            variant: 'destructive',
          })
          setIsSubmitting(false)
          return
        }

        if (!timeFrom || !timeTo) {
          toast({
            title: 'Fält saknas',
            description: 'Fyll i tid från och till',
            variant: 'destructive',
          })
          setIsSubmitting(false)
          return
        }

        if (!validateTimeRange(timeFrom, timeTo)) {
          toast({
            title: 'Ogiltig tidsperiod',
            description: 'Sluttid måste vara efter starttid',
            variant: 'destructive',
          })
          setIsSubmitting(false)
          return
        }

        if (workType === 'annat' && !annatSpec.trim()) {
          toast({
            title: 'Specifikation krävs',
            description: 'Ange vad du arbetade med när du väljer "Annat"',
            variant: 'destructive',
          })
          setIsSubmitting(false)
          return
        }

        if (workType === 'privat_traning' && !studentCount) {
          toast({
            title: 'Antal elever krävs',
            description: 'Välj antal elever för privatträning',
            variant: 'destructive',
          })
          setIsSubmitting(false)
          return
        }

        entryData.time_from = timeFrom
        entryData.time_to = timeTo
        entryData.work_type = workType
        entryData.annat_specification = workType === 'annat' ? annatSpec : null
        
        if (workType === 'privat_traning') {
          if (studentCount === 'fler') {
            const moreCount = parseInt(studentCountMore)
            if (!moreCount || moreCount < 5) {
              toast({
                title: 'Ogiltigt antal',
                description: 'Ange antal elever (minst 5)',
                variant: 'destructive',
              })
              setIsSubmitting(false)
              return
            }
            entryData.student_count = moreCount
          } else {
            entryData.student_count = parseInt(studentCount as string)
          }
          entryData.sport_type = sportType
        }

      } else if (entryType === 'leave') {
        if (!leaveType) {
          toast({
            title: 'Fält saknas',
            description: 'Välj typ av ledighet',
            variant: 'destructive',
          })
          setIsSubmitting(false)
          return
        }

        entryData.leave_type = leaveType
        entryData.is_full_day_leave = isFullDayLeave

        if (!isFullDayLeave) {
          if (!timeFrom || !timeTo) {
            toast({
              title: 'Fält saknas',
              description: 'Fyll i tid från och till eller välj "Hela dagen"',
              variant: 'destructive',
            })
            setIsSubmitting(false)
            return
          }

          if (!validateTimeRange(timeFrom, timeTo)) {
            toast({
              title: 'Ogiltig tidsperiod',
              description: 'Sluttid måste vara efter starttid',
              variant: 'destructive',
            })
            setIsSubmitting(false)
            return
          }

          entryData.time_from = timeFrom
          entryData.time_to = timeTo
        } else {
          entryData.time_from = null
          entryData.time_to = null
        }

      } else if (entryType === 'compensation') {
        if (!compensationType) {
          toast({
            title: 'Fält saknas',
            description: 'Välj typ av ersättning',
            variant: 'destructive',
          })
          setIsSubmitting(false)
          return
        }

        entryData.compensation_type = compensationType

        if (compensationType === 'milersattning') {
          const km = parseFloat(mileageKm)
          if (!mileageKm || isNaN(km) || km <= 0) {
            toast({
              title: 'Ogiltigt antal km',
              description: 'Ange antal kilometer',
              variant: 'destructive',
            })
            setIsSubmitting(false)
            return
          }
          entryData.mileage_km = km
        } else if (compensationType === 'annan_ersattning') {
          if (!compensationDescription.trim()) {
            toast({
              title: 'Beskrivning krävs',
              description: 'Ange beskrivning av ersättningen',
              variant: 'destructive',
            })
            setIsSubmitting(false)
            return
          }
          const amount = parseFloat(compensationAmount)
          if (!compensationAmount || isNaN(amount) || amount <= 0) {
            toast({
              title: 'Ogiltigt belopp',
              description: 'Ange belopp i SEK',
              variant: 'destructive',
            })
            setIsSubmitting(false)
            return
          }
          entryData.compensation_description = compensationDescription
          entryData.compensation_amount = amount
        }
      }

      if (editingEntry) {
        await apiRequest(`/update-entry`, {
          method: 'PUT',
          body: JSON.stringify({
            entryId: editingEntry.id,
            ...entryData,
          }),
        })
        toast({
          title: 'Post uppdaterad',
          description: 'Timposten har uppdaterats',
        })
      } else {
        await apiRequest(`/create-entry`, {
          method: 'POST',
          body: JSON.stringify(entryData),
        })
        toast({
          title: 'Post skapad',
          description: 'Timposten har lagts till',
        })
      }

      resetForm()
      onEntrySaved()
    } catch (error: any) {
      console.error('Error saving entry:', error)
      toast({
        title: 'Kunde inte spara post',
        description: error.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!date) return null

  const dateStr = format(date, 'EEEE d MMMM yyyy', { locale: sv })
  
  const workEntries = entries.filter(e => e.entry_type === 'work')
  const leaveEntries = entries.filter(e => e.entry_type === 'leave')
  const compensationEntries = entries.filter(e => e.entry_type === 'compensation')
  
  const totalHours = entries.reduce((sum, entry) => {
    if (entry.time_from && entry.time_to) {
      return sum + calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
    }
    return sum
  }, 0)

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[95vh] overflow-y-auto p-0 sm:p-6">
        <div className="p-4 sm:p-6">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              {dateStr}
            </DialogTitle>
            <DialogDescription className="text-base sm:text-lg mt-2">
              {entries.length > 0 && (
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  Totalt: {totalHours.toFixed(1)} timmar
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 sm:space-y-8">
            {/* Existing Entries */}
            {entries.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                  Befintliga poster
                </h3>
                
                {/* Work Entries */}
                {workEntries.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-base font-semibold text-blue-700 dark:text-blue-400">Arbete</h4>
                    <div className="grid gap-4">
                      {workEntries.map((entry) => (
                        <Card key={entry.id} className="border-2 border-blue-200 shadow-md hover:shadow-lg transition-shadow">
                          <CardContent className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                {entry.time_from && entry.time_to && (
                                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                                    <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                                      {entry.time_from.substring(0, 5)} - {entry.time_to.substring(0, 5)}
                                    </span>
                                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md text-sm sm:text-base font-semibold">
                                      {calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5)).toFixed(1)}h
                                    </span>
                                  </div>
                                )}
                                <div className="space-y-2">
                                  <p className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200">
                                    {entry.work_type && workTypeLabels[entry.work_type]}
                                    {entry.work_type === 'privat_traning' && (
                                      <>
                                        {entry.student_count && (
                                          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                                            ({entry.student_count} {entry.student_count === 1 ? 'elev' : 'elever'})
                                          </span>
                                        )}
                                        {entry.sport_type && (
                                          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                                            - {entry.sport_type === 'tennis' ? '🎾 Tennis' : '🏓 Bordtennis'}
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </p>
                                  {entry.work_type === 'annat' && entry.annat_specification && (
                                    <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                      {entry.annat_specification}
                                    </p>
                                  )}
                                  {entry.comment && (
                                    <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 italic">
                                      💬 {entry.comment}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                {pendingDeleteId === entry.id ? (
                                  <>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => handleDeleteConfirm(entry.id)}
                                      className="text-sm px-3 py-2 h-auto"
                                    >
                                      Ja, ta bort
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={handleDeleteCancel}
                                      className="text-sm px-3 py-2 h-auto"
                                    >
                                      Avbryt
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEdit(entry)}
                                      disabled={reportStatus === 'submitted'}
                                      title={reportStatus === 'submitted' ? 'Rapport redan skickad' : 'Redigera'}
                                      className="h-10 w-10"
                                    >
                                      <Edit2 className="h-5 w-5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteClick(entry.id)}
                                      disabled={reportStatus === 'submitted'}
                                      title={reportStatus === 'submitted' ? 'Rapport redan skickad' : 'Ta bort'}
                                      className="h-10 w-10"
                                    >
                                      <Trash2 className="h-5 w-5 text-red-500" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Leave Entries */}
                {leaveEntries.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-base font-semibold text-green-700 dark:text-green-400">Ledighet</h4>
                    <div className="grid gap-4">
                      {leaveEntries.map((entry) => (
                        <Card key={entry.id} className="border-2 border-green-200 shadow-md hover:shadow-lg transition-shadow">
                          <CardContent className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                {entry.is_full_day_leave ? (
                                  <div className="mb-3">
                                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-md text-sm sm:text-base font-semibold">
                                      Hela dagen
                                    </span>
                                  </div>
                                ) : entry.time_from && entry.time_to && (
                                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                                    <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                                      {entry.time_from.substring(0, 5)} - {entry.time_to.substring(0, 5)}
                                    </span>
                                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-md text-sm sm:text-base font-semibold">
                                      {calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5)).toFixed(1)}h
                                    </span>
                                  </div>
                                )}
                                <div className="space-y-2">
                                  <p className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200">
                                    {entry.leave_type && leaveTypeLabels[entry.leave_type]}
                                  </p>
                                  {entry.comment && (
                                    <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 italic">
                                      💬 {entry.comment}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                {pendingDeleteId === entry.id ? (
                                  <>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => handleDeleteConfirm(entry.id)}
                                      className="text-sm px-3 py-2 h-auto"
                                    >
                                      Ja, ta bort
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={handleDeleteCancel}
                                      className="text-sm px-3 py-2 h-auto"
                                    >
                                      Avbryt
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEdit(entry)}
                                      disabled={reportStatus === 'submitted'}
                                      title={reportStatus === 'submitted' ? 'Rapport redan skickad' : 'Redigera'}
                                      className="h-10 w-10"
                                    >
                                      <Edit2 className="h-5 w-5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteClick(entry.id)}
                                      disabled={reportStatus === 'submitted'}
                                      title={reportStatus === 'submitted' ? 'Rapport redan skickad' : 'Ta bort'}
                                      className="h-10 w-10"
                                    >
                                      <Trash2 className="h-5 w-5 text-red-500" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Compensation Entries */}
                {compensationEntries.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-base font-semibold text-orange-700 dark:text-orange-400">Ersättning</h4>
                    <div className="grid gap-4">
                      {compensationEntries.map((entry) => (
                        <Card key={entry.id} className="border-2 border-orange-200 shadow-md hover:shadow-lg transition-shadow">
                          <CardContent className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="space-y-2">
                                  <p className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200">
                                    {entry.compensation_type && compensationTypeLabels[entry.compensation_type]}
                                  </p>
                                  {entry.compensation_type === 'milersattning' && entry.mileage_km && (
                                    <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                                      {entry.mileage_km} km
                                    </p>
                                  )}
                                  {entry.compensation_type === 'annan_ersattning' && (
                                    <>
                                      {entry.compensation_description && (
                                        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                                          {entry.compensation_description}
                                        </p>
                                      )}
                                      {entry.compensation_amount && (
                                        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 font-semibold">
                                          {entry.compensation_amount} SEK
                                        </p>
                                      )}
                                    </>
                                  )}
                                  {entry.comment && (
                                    <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 italic">
                                      💬 {entry.comment}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                {pendingDeleteId === entry.id ? (
                                  <>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => handleDeleteConfirm(entry.id)}
                                      className="text-sm px-3 py-2 h-auto"
                                    >
                                      Ja, ta bort
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={handleDeleteCancel}
                                      className="text-sm px-3 py-2 h-auto"
                                    >
                                      Avbryt
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEdit(entry)}
                                      disabled={reportStatus === 'submitted'}
                                      title={reportStatus === 'submitted' ? 'Rapport redan skickad' : 'Redigera'}
                                      className="h-10 w-10"
                                    >
                                      <Edit2 className="h-5 w-5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteClick(entry.id)}
                                      disabled={reportStatus === 'submitted'}
                                      title={reportStatus === 'submitted' ? 'Rapport redan skickad' : 'Ta bort'}
                                      className="h-10 w-10"
                                    >
                                      <Trash2 className="h-5 w-5 text-red-500" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Add/Edit Form */}
            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6 border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingEntry ? 'Redigera post' : 'Lägg till ny post'}
              </h3>

              {/* Entry Type Selection - Only show if not editing */}
              {!editingEntry && !selectedEntryType && (
                <div className="space-y-4">
                  <Label className="text-base sm:text-lg font-semibold">
                    Välj typ av post:
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedEntryType('work')}
                      disabled={isSubmitting || reportStatus === 'submitted'}
                      className="h-20 sm:h-24 text-base sm:text-lg font-semibold border-2 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
                    >
                      Arbete
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedEntryType('leave')}
                      disabled={isSubmitting || reportStatus === 'submitted'}
                      className="h-20 sm:h-24 text-base sm:text-lg font-semibold border-2 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950"
                    >
                      Ledighet
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedEntryType('compensation')}
                      disabled={isSubmitting || reportStatus === 'submitted'}
                      className="h-20 sm:h-24 text-base sm:text-lg font-semibold border-2 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950"
                    >
                      Ersättning
                    </Button>
                  </div>
                </div>
              )}

              {/* Show form based on selected entry type or editing entry */}
              {(selectedEntryType || editingEntry) && (
                <>
                  {/* Work Form */}
                  {((selectedEntryType === 'work' || editingEntry?.entry_type === 'work')) && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                        <div className="space-y-2">
                          <Label htmlFor="timeFrom" className="text-base sm:text-lg font-semibold">
                            Från
                          </Label>
                          <Select
                            value={timeFrom}
                            onValueChange={(value) => setTimeFrom(value)}
                            required
                            disabled={isSubmitting || reportStatus === 'submitted'}
                          >
                            <SelectTrigger id="timeFrom" className="h-12 sm:h-14 text-base sm:text-lg">
                              <SelectValue placeholder="Välj tid" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              {TIME_OPTIONS.map((time) => (
                                <SelectItem key={time} value={time} className="text-base">
                                  {time}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="timeTo" className="text-base sm:text-lg font-semibold">
                            Till
                          </Label>
                          <Select
                            value={timeTo}
                            onValueChange={(value) => setTimeTo(value)}
                            required
                            disabled={isSubmitting || reportStatus === 'submitted'}
                          >
                            <SelectTrigger id="timeTo" className="h-12 sm:h-14 text-base sm:text-lg">
                              <SelectValue placeholder="Välj tid" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              {TIME_OPTIONS.map((time) => (
                                <SelectItem key={time} value={time} className="text-base">
                                  {time}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="workType" className="text-base sm:text-lg font-semibold">
                          Typ av arbete
                        </Label>
                        <Select
                          value={workType}
                          onValueChange={(value) => {
                            setWorkType(value as WorkType)
                            if (value !== 'annat') {
                              setAnnatSpec('')
                            }
                            if (value !== 'privat_traning') {
                              setStudentCount('')
                              setStudentCountMore('')
                              setSportType('')
                            }
                          }}
                          required
                          disabled={isSubmitting || reportStatus === 'submitted'}
                        >
                          <SelectTrigger className="h-12 sm:h-14 text-base sm:text-lg">
                            <SelectValue placeholder="Välj arbets typ" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cafe" className="text-base">Cafe</SelectItem>
                            <SelectItem value="coaching_tennis" className="text-base">🎾 Coaching (Tennis)</SelectItem>
                            <SelectItem value="coaching_bordtennis" className="text-base">🏓 Coaching (Bordtennis)</SelectItem>
                            <SelectItem value="privat_traning" className="text-base">Privatträning</SelectItem>
                            <SelectItem value="administration" className="text-base">Administration</SelectItem>
                            <SelectItem value="cleaning" className="text-base">Städning</SelectItem>
                            <SelectItem value="annat" className="text-base">Annat</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {workType === 'privat_traning' && (
                        <div className="space-y-2">
                          <Label htmlFor="studentCount" className="text-base sm:text-lg font-semibold">
                            Antal elever
                          </Label>
                          <Select
                            value={studentCount.toString()}
                            onValueChange={(value) => {
                              if (value === 'fler') {
                                setStudentCount('fler')
                              } else {
                                setStudentCount(parseInt(value))
                                setStudentCountMore('')
                              }
                            }}
                            required
                            disabled={isSubmitting || reportStatus === 'submitted'}
                          >
                            <SelectTrigger className="h-12 sm:h-14 text-base sm:text-lg">
                              <SelectValue placeholder="Välj antal elever" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1" className="text-base">1 elev</SelectItem>
                              <SelectItem value="2" className="text-base">2 elever</SelectItem>
                              <SelectItem value="3" className="text-base">3 elever</SelectItem>
                              <SelectItem value="4" className="text-base">4 elever</SelectItem>
                              <SelectItem value="fler" className="text-base">Fler elever</SelectItem>
                            </SelectContent>
                          </Select>
                          {studentCount === 'fler' && (
                            <Input
                              type="number"
                              min="5"
                              value={studentCountMore}
                              onChange={(e) => setStudentCountMore(e.target.value)}
                              placeholder="Ange antal elever"
                              required
                              disabled={isSubmitting || reportStatus === 'submitted'}
                              className="h-12 sm:h-14 text-base sm:text-lg mt-2"
                            />
                          )}
                        </div>
                      )}

                      {workType === 'privat_traning' && (
                        <div className="space-y-2">
                          <Label htmlFor="sportType" className="text-base sm:text-lg font-semibold">
                            Sport
                          </Label>
                          <Select
                            value={sportType}
                            onValueChange={(value) => setSportType(value as SportType)}
                            required
                            disabled={isSubmitting || reportStatus === 'submitted'}
                          >
                            <SelectTrigger className="h-12 sm:h-14 text-base sm:text-lg">
                              <SelectValue placeholder="Välj sport" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tennis" className="text-base">🎾 Tennis</SelectItem>
                              <SelectItem value="bordtennis" className="text-base">🏓 Bordtennis</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {workType === 'annat' && (
                        <div className="space-y-2">
                          <Label htmlFor="annatSpec" className="text-base sm:text-lg font-semibold">
                            Specifikation (Annat)
                          </Label>
                          <Input
                            id="annatSpec"
                            type="text"
                            value={annatSpec}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAnnatSpec(e.target.value)}
                            placeholder="Beskriv vad du arbetade med"
                            required
                            disabled={isSubmitting || reportStatus === 'submitted'}
                            className="h-12 sm:h-14 text-base sm:text-lg"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* Leave Form */}
                  {((selectedEntryType === 'leave' || editingEntry?.entry_type === 'leave')) && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-base sm:text-lg font-semibold flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isFullDayLeave}
                            onChange={(e) => setIsFullDayLeave(e.target.checked)}
                            disabled={isSubmitting || reportStatus === 'submitted'}
                            className="w-5 h-5"
                          />
                          Hela dagen
                        </Label>
                      </div>

                      {!isFullDayLeave && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                          <div className="space-y-2">
                            <Label htmlFor="timeFrom" className="text-base sm:text-lg font-semibold">
                              Från
                            </Label>
                            <Select
                              value={timeFrom}
                              onValueChange={(value) => setTimeFrom(value)}
                              required
                              disabled={isSubmitting || reportStatus === 'submitted'}
                            >
                              <SelectTrigger id="timeFrom" className="h-12 sm:h-14 text-base sm:text-lg">
                                <SelectValue placeholder="Välj tid" />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px]">
                                {TIME_OPTIONS.map((time) => (
                                  <SelectItem key={time} value={time} className="text-base">
                                    {time}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="timeTo" className="text-base sm:text-lg font-semibold">
                              Till
                            </Label>
                            <Select
                              value={timeTo}
                              onValueChange={(value) => setTimeTo(value)}
                              required
                              disabled={isSubmitting || reportStatus === 'submitted'}
                            >
                              <SelectTrigger id="timeTo" className="h-12 sm:h-14 text-base sm:text-lg">
                                <SelectValue placeholder="Välj tid" />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px]">
                                {TIME_OPTIONS.map((time) => (
                                  <SelectItem key={time} value={time} className="text-base">
                                    {time}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="leaveType" className="text-base sm:text-lg font-semibold">
                          Typ av ledighet
                        </Label>
                        <Select
                          value={leaveType}
                          onValueChange={(value) => setLeaveType(value as LeaveType)}
                          required
                          disabled={isSubmitting || reportStatus === 'submitted'}
                        >
                          <SelectTrigger className="h-12 sm:h-14 text-base sm:text-lg">
                            <SelectValue placeholder="Välj typ av ledighet" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="semester" className="text-base">Semester</SelectItem>
                            <SelectItem value="tjanstledig" className="text-base">Tjänstledig</SelectItem>
                            <SelectItem value="sjukdom" className="text-base">Sjukdom</SelectItem>
                            <SelectItem value="vard_av_barn" className="text-base">Vård av barn</SelectItem>
                            <SelectItem value="annan_ledighet" className="text-base">Annan ledighet</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {/* Compensation Form */}
                  {((selectedEntryType === 'compensation' || editingEntry?.entry_type === 'compensation')) && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="compensationType" className="text-base sm:text-lg font-semibold">
                          Typ av ersättning
                        </Label>
                        <Select
                          value={compensationType}
                          onValueChange={(value) => {
                            setCompensationType(value as CompensationType)
                            if (value === 'milersattning') {
                              setCompensationAmount('')
                              setCompensationDescription('')
                            } else {
                              setMileageKm('')
                            }
                          }}
                          required
                          disabled={isSubmitting || reportStatus === 'submitted'}
                        >
                          <SelectTrigger className="h-12 sm:h-14 text-base sm:text-lg">
                            <SelectValue placeholder="Välj typ av ersättning" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="milersattning" className="text-base">Milersättning</SelectItem>
                            <SelectItem value="annan_ersattning" className="text-base">Annan ersättning</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {compensationType === 'milersattning' && (
                        <div className="space-y-2">
                          <Label htmlFor="mileageKm" className="text-base sm:text-lg font-semibold">
                            Antal kilometer
                          </Label>
                          <Input
                            id="mileageKm"
                            type="number"
                            min="0"
                            step="0.1"
                            value={mileageKm}
                            onChange={(e) => setMileageKm(e.target.value)}
                            placeholder="Ange antal km"
                            required
                            disabled={isSubmitting || reportStatus === 'submitted'}
                            className="h-12 sm:h-14 text-base sm:text-lg"
                          />
                        </div>
                      )}

                      {compensationType === 'annan_ersattning' && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="compensationDescription" className="text-base sm:text-lg font-semibold">
                              Beskrivning
                            </Label>
                            <Input
                              id="compensationDescription"
                              type="text"
                              value={compensationDescription}
                              onChange={(e) => setCompensationDescription(e.target.value)}
                              placeholder="Beskriv ersättningen (t.ex. Parkering, Material)"
                              required
                              disabled={isSubmitting || reportStatus === 'submitted'}
                              className="h-12 sm:h-14 text-base sm:text-lg"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="compensationAmount" className="text-base sm:text-lg font-semibold">
                              Belopp (SEK)
                            </Label>
                            <Input
                              id="compensationAmount"
                              type="number"
                              min="0"
                              step="0.01"
                              value={compensationAmount}
                              onChange={(e) => setCompensationAmount(e.target.value)}
                              placeholder="Ange belopp i SEK"
                              required
                              disabled={isSubmitting || reportStatus === 'submitted'}
                              className="h-12 sm:h-14 text-base sm:text-lg"
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* Common fields */}
                  <div className="space-y-2">
                    <Label htmlFor="comment" className="text-base sm:text-lg font-semibold">
                      Övrig kommentar
                    </Label>
                    <Textarea
                      id="comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Valfri kommentar"
                      disabled={isSubmitting || reportStatus === 'submitted'}
                      className="min-h-[100px] sm:min-h-[120px] text-base sm:text-lg"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Button 
                      type="submit" 
                      disabled={isSubmitting || reportStatus === 'submitted'}
                      className="h-12 sm:h-14 text-base sm:text-lg font-semibold flex-1 sm:flex-none"
                    >
                      {isSubmitting
                        ? 'Sparar...'
                        : reportStatus === 'submitted'
                        ? 'Rapport redan skickad'
                        : editingEntry
                        ? 'Uppdatera post'
                        : 'Lägg till post'}
                    </Button>
                    {(editingEntry || selectedEntryType) && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetForm}
                        disabled={isSubmitting || reportStatus === 'submitted'}
                        className="h-12 sm:h-14 text-base sm:text-lg font-semibold"
                      >
                        Avbryt
                      </Button>
                    )}
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

