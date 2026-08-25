import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ListPanelSkeleton } from '@/components/ui/page-skeletons'
import type { AuditEntry, ClubNotification } from '@/pages/club/clubAttendanceTypes'

type Props = {
  auditEntries: AuditEntry[]
  notifications: ClubNotification[]
  isLoading: boolean
  onMarkAllRead: () => void
}

function formatChangeLine(change: {
  field: string
  before: unknown
  after: unknown
  isNew: boolean
}): string {
  if (change.field === 'attendance') {
    const after = change.after as { player: string; status: string }
    return `${after.player}: ${after.status}`
  }
  if (change.isNew) return `Ny: ${String(change.after)}`
  return `${change.field}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`
}

export function ClubChangesPanel({
  auditEntries,
  notifications,
  isLoading,
  onMarkAllRead,
}: Props) {
  const unreadCount = notifications.filter((n) => n.isUnread).length

  if (isLoading) {
    return <ListPanelSkeleton rows={4} />
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Meddelanden</h2>
          {unreadCount > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={onMarkAllRead}>
              Markera alla som lästa ({unreadCount})
            </Button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga meddelanden.</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <Card
                key={notification.id}
                className={notification.isUnread ? 'border-primary/40 bg-primary/5' : ''}
              >
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium">{notification.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {new Date(notification.createdAt).toLocaleString('sv-SE')}
                  </p>
                </CardHeader>
                <CardContent className="pb-3 pt-0">
                  <pre className="whitespace-pre-wrap font-sans text-sm">{notification.body}</pre>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ändringslogg (senaste 30 dagar)</h2>
        {auditEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga registrerade ändringar.</p>
        ) : (
          <div className="space-y-2">
            {auditEntries.map((entry) => {
              const changes = entry.payload?.changes || []
              return (
                <Card key={entry.id}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium">{entry.summary}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {entry.actorName} · {new Date(entry.createdAt).toLocaleString('sv-SE')}
                    </p>
                  </CardHeader>
                  {changes.length > 0 && (
                    <CardContent className="space-y-1 pb-3 pt-0">
                      {changes.map((change, index) => (
                        <p
                          key={`${entry.id}-${index}`}
                          className={`text-sm ${
                            change.isNew
                              ? 'rounded border border-amber-400/60 bg-amber-50/60 px-2 py-1 dark:bg-amber-950/20'
                              : ''
                          }`}
                        >
                          {formatChangeLine(change)}
                        </p>
                      ))}
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
