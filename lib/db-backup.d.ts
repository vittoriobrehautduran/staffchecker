export function createDatabaseDumpSql(databaseUrl: string): Promise<string>
export function gzipSqlDump(sqlText: string): Buffer
export function uploadBackupToS3(options: {
  bucket: string
  prefix: string
  gzipBody: Buffer
  databaseUrl: string
  region?: string
}): Promise<{ bucket: string; key: string; sizeBytes: number }>
export function pruneOldBackups(options: {
  bucket: string
  prefix: string
  retentionDays: number
  region?: string
}): Promise<{ deleted: number }>
export function runDatabaseBackup(options?: {
  databaseUrl?: string
  bucket?: string
  prefix?: string
  retentionDays?: number
  region?: string
}): Promise<{
  bucket: string
  key: string
  sizeBytes: number
  sqlBytes: number
  pruned: { deleted: number }
  retentionDays: number
}>
