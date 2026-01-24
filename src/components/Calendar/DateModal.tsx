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
  userId: string | null | undefined
  reportStatus: 'draft' | 'submitted'
}

export function DateModal({
  open,
  onOpenChange,
  date,
  entries,
  onEntrySaved,
  onEntryDeleted,
  userId,
  reportStatus,
}: DateModalProps) {
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [workType, setWorkType] = useState<'cafe' | 'coaching' | 'administration' | 'cleaning' | 'annat' | ''>('')
  const [annatSpec, setAnnatSpec] = useState('')
  const [comment, setComment] = useState('')
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!open && date) {
      resetForm()
    }
  }, [open, date])

  const resetForm = () => {
    setTimeFrom('')
    setTimeTo('')
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

  const handleDelete = async (entryId: number) => {
    if (reportStatus === 'submitted') {
      toast({
        title: 'Rapport redan skickad',
        description: 'Du kan inte redigera poster i en skickad rapport',
        variant: 'destructive',
      })
      return
    }

    if (!confirm('Är du säker på att du vill ta bort denna post?')) {
      return
    }

    if (!userId) {
      toast({
        title: 'Fel',
        description: 'Du måste vara inloggad',
        variant: 'destructive',
      })
      return
    }

    try {
      await apiRequest(`/delete-entry`, {
        method: 'DELETE',
        body: JSON.stringify({ entryId, userId }),
      })
      toast({
        title: 'Post borttagen',
        description: 'Timposten har tagits bort',
      })
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
    }
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

      if (!userId) {
        toast({
          title: 'Fel',
          description: 'Du måste vara inloggad',
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
        userId,
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dateStr}</DialogTitle>
          <DialogDescription>
            {entries.length > 0 && (
              <span className="font-semibold">Totalt: {totalHours.toFixed(1)} timmar</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Existing Entries */}
          {entries.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold">Befintliga poster</h3>
              <div className="grid gap-3">
                {entries.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold">
                              {entry.time_from.substring(0, 5)} - {entry.time_to.substring(0, 5)}
                            </span>
                            <span className="text-muted-foreground">
                              ({calculateHours(entry.time_from.substring(0, 5), entry.time_to.substring(0, 5)).toFixed(1)}h)
                            </span>
                          </div>
                          <div className="space-y-1">
                            <p className="font-medium">{workTypeLabels[entry.work_type]}</p>
                            {entry.work_type === 'annat' && entry.annat_specification && (
                              <p className="text-sm text-muted-foreground">
                                {entry.annat_specification}
                              </p>
                            )}
                            {entry.comment && (
                              <p className="text-sm text-muted-foreground">{entry.comment}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(entry)}
                            disabled={reportStatus === 'submitted'}
                            title={reportStatus === 'submitted' ? 'Rapport redan skickad' : 'Redigera'}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(entry.id)}
                            disabled={reportStatus === 'submitted'}
                            title={reportStatus === 'submitted' ? 'Rapport redan skickad' : 'Ta bort'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Add/Edit Form */}
          <form onSubmit={handleSubmit} className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">
              {editingEntry ? 'Redigera post' : 'Lägg till ny post'}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timeFrom">Från</Label>
                <Select
                  value={timeFrom}
                  onValueChange={setTimeFrom}
                  required
                  disabled={isSubmitting || reportStatus === 'submitted'}
                >
                  <SelectTrigger id="timeFrom">
                    <SelectValue placeholder="Välj tid" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeTo">Till</Label>
                <Select
                  value={timeTo}
                  onValueChange={setTimeTo}
                  required
                  disabled={isSubmitting || reportStatus === 'submitted'}
                >
                  <SelectTrigger id="timeTo">
                    <SelectValue placeholder="Välj tid" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workType">Arbete</Label>
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
                <SelectTrigger>
                  <SelectValue placeholder="Välj arbets typ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cafe">Cafe</SelectItem>
                  <SelectItem value="coaching">Coaching</SelectItem>
                  <SelectItem value="administration">Administration</SelectItem>
                  <SelectItem value="cleaning">Städning</SelectItem>
                  <SelectItem value="annat">Annat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {workType === 'annat' && (
              <div className="space-y-2">
                <Label htmlFor="annatSpec">Specifikation (Annat)</Label>
                <Input
                  id="annatSpec"
                  type="text"
                  value={annatSpec}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAnnatSpec(e.target.value)}
                  placeholder="Beskriv vad du arbetade med"
                  required
                  disabled={isSubmitting || reportStatus === 'submitted'}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="comment">Övrig kommentar</Label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Valfri kommentar"
                disabled={isSubmitting || reportStatus === 'submitted'}
              />
            </div>

            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={isSubmitting || reportStatus === 'submitted'}
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
                >
                  Avbryt
                </Button>
              )}
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

