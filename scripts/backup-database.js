#!/usr/bin/env node
/**
 * Manual database backup → S3 (same logic as scheduled-db-backup Lambda).
 *
 * Requires in .env.local:
 *   DATABASE_URL
 *   BACKUP_S3_BUCKET
 * Optional:
 *   BACKUP_S3_PREFIX (default timrapport/db)
 *   BACKUP_RETENTION_DAYS (default 40)
 *   AWS_REGION (default eu-north-1)
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { runDatabaseBackup } from '../lib/db-backup.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const env = {}
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const cleaned = trimmed.replace(/^export\s+/, '')
    const match = cleaned.match(/^([^=]+)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[match[1].trim()] = value
  }
  return env
}

const envPath = join(projectRoot, '.env.local')
const envVars = parseEnvFile(envPath)

for (const [key, value] of Object.entries(envVars)) {
  if (!process.env[key]) process.env[key] = value
}

async function main() {
  const result = await runDatabaseBackup()
  console.log('Backup uploaded:')
  console.log(`  s3://${result.bucket}/${result.key}`)
  console.log(`  gzip size: ${result.sizeBytes} bytes (SQL ${result.sqlBytes} bytes)`)
  console.log(`  pruned old files: ${result.pruned.deleted}`)
}

main().catch((error) => {
  console.error('Backup failed:', error.message || error)
  process.exit(1)
})
