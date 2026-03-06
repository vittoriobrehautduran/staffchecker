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

interface Entry {
  id: number
  date: string
  time_from: string
  time_to: string
  work_type: 'cafe' | 'coaching' | 'administration' | 'cleaning' | 'annat'
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
  const [timeFrom, setTimeFrom] = useState('12:00')
  const [timeTo, setTimeTo] = useState('12:00')
  const [workType, setWorkType] = useState<'cafe' | 'coaching' | 'administration' | 'cleaning' | 'annat' | ''>('')
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
    setTimeFrom('12:00')
    setTimeTo('12:00')
    setWorkType('')
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
    // Extract HH:MM and round to nearest 10 minutes
    const timeFromStr = entry.time_from.substring(0, 5)
    const timeToStr = entry.time_to.substring(0, 5)
    setTimeFrom(roundToNearest10Minutes(timeFromStr))
    setTimeTo(roundToNearest10Minutes(timeToStr))
    setWorkType(entry.work_type)
    setAnnatSpec(entry.annat_specification || '')
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

    try {
      if (!timeFrom || !timeTo || !workType) {
        toast({
          title: 'Fält saknas',
          description: 'Fyll i alla obligatoriska fält',
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

      const entryData = {
        date: format(date, 'yyyy-MM-dd'),
        time_from: timeFrom,
        time_to: timeTo,
        work_type: workType,
        annat_specification: workType === 'annat' ? annatSpec : null,
        comment: comment || null,
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
  const totalHours = entries.reduce((sum, entry) => {
    return sum + calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5))
  }, 0)

  const workTypeLabels = {
    cafe: 'Cafe',
    coaching: 'Coaching',
    administration: 'Administration',
    cleaning: 'Städning',
    annat: 'Annat',
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
                <div className="grid gap-4">
                  {entries.map((entry) => (
                    <Card key={entry.id} className="border-2 shadow-md hover:shadow-lg transition-shadow">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                              <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                                {entry.time_from.substring(0, 5)} - {entry.time_to.substring(0, 5)}
                              </span>
                              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md text-sm sm:text-base font-semibold">
                                {calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5)).toFixed(1)}h
                              </span>
                            </div>
                            <div className="space-y-2">
                              <p className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-200">
                                {workTypeLabels[entry.work_type]}
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

            {/* Add/Edit Form */}
            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6 border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                {editingEntry ? 'Redigera post' : 'Lägg till ny post'}
              </h3>

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
                  Arbete
                </Label>
                <Select
                  value={workType}
                  onValueChange={(value) => {
                    setWorkType(value as typeof workType)
                    if (value !== 'annat') {
                      setAnnatSpec('')
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
                    <SelectItem value="coaching" className="text-base">Coaching</SelectItem>
                    <SelectItem value="administration" className="text-base">Administration</SelectItem>
                    <SelectItem value="cleaning" className="text-base">Städning</SelectItem>
                    <SelectItem value="annat" className="text-base">Annat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
                {editingEntry && (
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
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

