import { ScheduledEvent } from 'aws-lambda'
import { runDatabaseBackup } from '../lib/db-backup.js'

// EventBridge: weekly dump of Neon Postgres → S3.
// Suggested schedule: cron(0 2 ? * SUN *)  = Sunday 02:00 UTC.
// Backups older than BACKUP_RETENTION_DAYS (default 40) are deleted.
export const handler = async (_event: ScheduledEvent) => {
  try {
    const result = await runDatabaseBackup()
    console.log(
      'scheduled-db-backup done:',
      JSON.stringify({
        bucket: result.bucket,
        key: result.key,
        sizeBytes: result.sizeBytes,
        sqlBytes: result.sqlBytes,
        pruned: result.pruned.deleted,
        retentionDays: result.retentionDays,
      })
    )
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...result }) }
  } catch (error) {
    console.error('scheduled-db-backup error:', error)
    throw error
  }
}
