import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

export const CLEAR_SCHEDULE_CONFIRM_PHRASE = 'RADERA SCHEMA'

type Props = {
  isBusy: boolean
  onClearSchedule: (confirmPhrase: string) => Promise<void>
}

export function ClubClearScheduleSection({ isBusy, onClearSchedule }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [isClearing, setIsClearing] = useState(false)

  const normalizedInput = confirmText.trim().toUpperCase()
  const canConfirm = normalizedInput === CLEAR_SCHEDULE_CONFIRM_PHRASE

  async function handleClear() {
    if (!canConfirm || isClearing) return

    setIsClearing(true)
    try {
      await onClearSchedule(confirmText.trim())
      setConfirmText('')
      setIsOpen(false)
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="border-t border-border/60 pt-4">
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? 'Dölj avancerat' : 'Avancerat: rensa hela veckoschemat'}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
          <p className="text-sm text-muted-foreground">
            Tar bort <strong className="font-medium text-foreground">alla lektioner</strong> i
            veckoschemat (tennis och bordtennis). Tränare, banor och inställningar behålls. Detta
            går inte att ångra.
          </p>

          <div className="space-y-2">
            <Label htmlFor="club-clear-confirm" className="text-xs">
              Skriv <span className="font-mono font-semibold">{CLEAR_SCHEDULE_CONFIRM_PHRASE}</span>{' '}
              för att fortsätta
            </Label>
            <Input
              id="club-clear-confirm"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={CLEAR_SCHEDULE_CONFIRM_PHRASE}
              className="font-mono text-sm"
              autoComplete="off"
              disabled={isBusy || isClearing}
            />
          </div>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!canConfirm || isBusy || isClearing}
            onClick={() => void handleClear()}
          >
            {isClearing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rensar…
              </>
            ) : (
              'Radera hela veckoschemat'
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
