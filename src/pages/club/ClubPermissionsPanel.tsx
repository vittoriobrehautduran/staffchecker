import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useToast } from '@/components/ui/use-toast'

export type ClubMember = {
  userId: number
  name: string
  lastName: string
  email: string
  permissions: string[]
}

type Props = {
  isSaving?: boolean
}

function memberLabel(member: ClubMember): string {
  const fullName = `${member.name} ${member.lastName}`.trim()
  return fullName || member.email
}

export function ClubPermissionsPanel({ isSaving = false }: Props) {
  const { toast } = useToast()
  const [members, setMembers] = useState<ClubMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const loadMembers = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await apiRequest<{ members?: ClubMember[] }>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({ operation: 'get_club_members' }),
      })

      // Old club-admin builds ignore this op and return the club payload instead.
      if (!Array.isArray(result.members)) {
        throw new Error(
          'Servern stödjer inte behörighetslistan ännu. Deploya club-admin Lambda.'
        )
      }

      setMembers(result.members)
    } catch (error: unknown) {
      const err = error as { message?: string }
      setMembers([])
      toast({
        title: 'Kunde inte ladda konton',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((member) => {
      const haystack = `${member.name} ${member.lastName} ${member.email}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [members, search])

  async function togglePermission(
    member: ClubMember,
    permission: 'club_boss' | 'club_coach',
    enabled: boolean
  ) {
    const next = new Set(member.permissions)
    if (enabled) {
      next.add(permission)
    } else {
      next.delete(permission)
    }

    setSavingUserId(member.userId)
    try {
      const result = await apiRequest<{ members: ClubMember[] }>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'update_club_member_permissions',
          userId: member.userId,
          permissions: [...next],
        }),
      })
      setMembers(result.members || [])
      toast({
        title: 'Behörigheter sparade',
        description: 'Personen behöver ladda om appen (eller logga in igen) för att se ändringen.',
      })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte spara',
        description: err?.message || 'Ett fel uppstod',
        variant: 'destructive',
      })
    } finally {
      setSavingUserId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-4">
        <LoadingSpinner />
        <span className="text-sm text-muted-foreground">Laddar konton…</span>
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Inga konton kunde visas. Antingen saknas rader i{' '}
          <code className="text-xs">users</code>, eller så behöver{' '}
          <code className="text-xs">club-admin</code> deployas med behörighets-API:t.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadMembers()}
        >
          Försök igen
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="club-permissions-panel">
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground space-y-1">
        <p>
          <strong className="text-foreground">Tränare</strong> — ser menyn{' '}
          <em>Närvaro</em> och kan bara markera närvaro (inte veckoschema eller
          inställningar).
        </p>
        <p>
          <strong className="text-foreground">Boss</strong> — ser hela klubben:
          veckoschema, närvaro, historik och behörigheter.
        </p>
        <p>Utan kryss syns ingen klubbmeny alls.</p>
      </div>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Sök namn eller e-post…"
        aria-label="Sök konto"
      />

      <div className="space-y-3">
        {filteredMembers.map((member) => {
          const isBoss = member.permissions.includes('club_boss')
          const isCoach = member.permissions.includes('club_coach')
          const isRowSaving = savingUserId === member.userId
          const hasNoAccess = !isBoss && !isCoach

          return (
            <div
              key={member.userId}
              className="rounded-lg border border-border/60 p-3"
              data-testid={`club-member-${member.userId}`}
            >
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{memberLabel(member)}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
                {hasNoAccess && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Ingen klubbåtkomst
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={isCoach}
                    disabled={isSaving || isRowSaving}
                    onChange={(event) =>
                      void togglePermission(member, 'club_coach', event.target.checked)
                    }
                    data-testid={`member-${member.userId}-coach`}
                  />
                  <span>Tränare (endast närvaro)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={isBoss}
                    disabled={isSaving || isRowSaving}
                    onChange={(event) =>
                      void togglePermission(member, 'club_boss', event.target.checked)
                    }
                    data-testid={`member-${member.userId}-boss`}
                  />
                  <span>Boss (schema + närvaro)</span>
                </label>
              </div>
            </div>
          )
        })}
      </div>

      {filteredMembers.length === 0 && (
        <p className="text-sm text-muted-foreground">Inga konton matchade sökningen.</p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void loadMembers()}
        disabled={isSaving || savingUserId != null}
      >
        Uppdatera lista
      </Button>
    </div>
  )
}
