import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '@/services/api'
import { Button } from '@/components/ui/button'
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
  isSaving: boolean
}

function memberLabel(member: ClubMember): string {
  const fullName = `${member.name} ${member.lastName}`.trim()
  return fullName || member.email
}

export function ClubPermissionsPanel({ isSaving }: Props) {
  const { toast } = useToast()
  const [members, setMembers] = useState<ClubMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState<number | null>(null)

  const loadMembers = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await apiRequest<{ members: ClubMember[] }>('/club-admin', {
        method: 'POST',
        body: JSON.stringify({ operation: 'get_club_members' }),
      })
      setMembers(result.members || [])
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast({
        title: 'Kunde inte ladda medlemmar',
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
      toast({ title: 'Behörigheter uppdaterade' })
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
        <span className="text-sm text-muted-foreground">Laddar medlemmar…</span>
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Inga registrerade medlemmar i klubben ännu.
      </p>
    )
  }

  return (
    <div className="space-y-3" data-testid="club-permissions-panel">
      {members.map((member) => {
        const isBoss = member.permissions.includes('club_boss')
        const isCoach = member.permissions.includes('club_coach')
        const isRowSaving = savingUserId === member.userId

        return (
          <div
            key={member.userId}
            className="rounded-lg border border-border/60 p-3"
            data-testid={`club-member-${member.userId}`}
          >
            <div className="mb-2">
              <p className="text-sm font-medium">{memberLabel(member)}</p>
              <p className="text-xs text-muted-foreground">{member.email}</p>
            </div>
            <div className="flex flex-wrap gap-4">
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
                <span>Boss (schema, inställningar)</span>
              </label>
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
                <span>Tränare (närvaro)</span>
              </label>
            </div>
          </div>
        )
      })}
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
