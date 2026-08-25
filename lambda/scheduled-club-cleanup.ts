import { ScheduledEvent } from 'aws-lambda'
import { runScheduledCleanupForAllClubs } from './utils/club-cleanup'

// EventBridge cron: runs retention cleanup for all clubs (uses clubs.retention_days).
export const handler = async (_event: ScheduledEvent) => {
  try {
    const results = await runScheduledCleanupForAllClubs()
    console.log(
      'scheduled-club-cleanup done:',
      JSON.stringify({
        clubsProcessed: results.length,
        results: results.map((row) => ({
          club: row.clubSlug,
          sessions: row.deleted.sessions,
          audit: row.deleted.auditLogEntries,
          notifications: row.deleted.notifications,
        })),
      })
    )
    return { statusCode: 200, body: JSON.stringify({ ok: true, results }) }
  } catch (error) {
    console.error('scheduled-club-cleanup error:', error)
    throw error
  }
}
