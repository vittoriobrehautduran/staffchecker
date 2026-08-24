import pg from 'pg'
import { gzipSync } from 'zlib'
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'

const { Client } = pg

function cleanDatabaseUrl(url) {
  if (!url) {
    throw new Error('DATABASE_URL is not set')
  }

  let cleaned = url.replace(/^psql\s+['"]?/, '')
  cleaned = cleaned.replace(/['"]\s*$/, '')
  cleaned = cleaned.trim().replace(/^['"]|['"]$/g, '')

  if (!cleaned.startsWith('postgresql://') && !cleaned.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must start with postgresql:// or postgres://')
  }

  return cleaned
}

function sqlLiteral(value, udtName) {
  if (value === null || value === undefined) return 'NULL'

  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'bigint') return String(value)

  if (value instanceof Date) {
    return `'${value.toISOString().replace('T', ' ').replace('Z', '+00')}'`
  }

  if (Array.isArray(value)) {
    if (udtName === 'json' || udtName === 'jsonb') {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::${udtName}`
    }
    const items = value.map((item) => {
      if (item === null) return 'NULL'
      return `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    })
    return `'{${items.join(',')}}'`
  }

  if (typeof value === 'object') {
    if (udtName === 'json' || udtName === 'jsonb') {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::${udtName}`
    }
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  }

  return `'${String(value).replace(/'/g, "''")}'`
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

async function listPublicTables(client) {
  const result = await client.query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname ASC
  `)

  return result.rows.map((row) => row.table_name)
}

// Parents before children so INSERT respects foreign keys.
async function getInsertTableOrder(client, tables) {
  const fkResult = await client.query(`
    SELECT
      src.relname AS child_table,
      tgt.relname AS parent_table
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class tgt ON tgt.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = src.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
  `)

  const parentsByChild = new Map()
  for (const row of fkResult.rows) {
    if (!tables.includes(row.child_table) || !tables.includes(row.parent_table)) continue
    const parents = parentsByChild.get(row.child_table) || new Set()
    parents.add(row.parent_table)
    parentsByChild.set(row.child_table, parents)
  }

  const ordered = []
  const pending = new Set(tables)

  while (pending.size > 0) {
    const ready = [...pending].filter((table) => {
      const parents = parentsByChild.get(table)
      if (!parents || parents.size === 0) return true
      return [...parents].every((parent) => !pending.has(parent))
    })

    if (ready.length === 0) {
      ordered.push(...pending)
      break
    }

    ready.sort()
    for (const table of ready) {
      ordered.push(table)
      pending.delete(table)
    }
  }

  return ordered
}

async function getTableColumns(client, tableName) {
  const result = await client.query(
    `
    SELECT column_name, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position ASC
    `,
    [tableName]
  )

  return result.rows
}

// Build a SQL dump (schema note + data). Schema lives in database/schema.sql in git.
export async function createDatabaseDumpSql(databaseUrl) {
  const client = new Client({
    connectionString: cleanDatabaseUrl(databaseUrl),
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  try {
    const lines = []
    const now = new Date().toISOString()

    lines.push('-- Staffcheck / Timrapport database backup')
    lines.push(`-- Created: ${now}`)
    lines.push('-- Restore: apply database/schema.sql first on empty DB, then this file')
    lines.push('BEGIN;')
    lines.push("SET session_replication_role = 'replica';")

    const tables = await listPublicTables(client)
    const insertOrder = await getInsertTableOrder(client, tables)

    if (insertOrder.length > 0) {
      lines.push('')
      lines.push('-- Clear existing rows before restore')
      lines.push(
        `TRUNCATE ${insertOrder.map(quoteIdent).join(', ')} RESTART IDENTITY CASCADE;`
      )
    }

    for (const tableName of insertOrder) {
      const columns = await getTableColumns(client, tableName)
      if (columns.length === 0) continue

      const columnNames = columns.map((col) => col.column_name)
      const quotedColumns = columnNames.map(quoteIdent).join(', ')

      lines.push('')
      lines.push(`-- Table: ${tableName}`)

      const dataResult = await client.query(`SELECT * FROM ${quoteIdent(tableName)}`)
      for (const row of dataResult.rows) {
        const values = columnNames.map((name, index) =>
          sqlLiteral(row[name], columns[index].udt_name)
        )
        lines.push(
          `INSERT INTO ${quoteIdent(tableName)} (${quotedColumns}) VALUES (${values.join(', ')});`
        )
      }
    }

    lines.push("SET session_replication_role = 'origin';")
    lines.push('COMMIT;')
    lines.push('')

    return lines.join('\n')
  } finally {
    await client.end()
  }
}

export function gzipSqlDump(sqlText) {
  return gzipSync(Buffer.from(sqlText, 'utf8'))
}

function backupObjectKey(prefix, timestamp = new Date()) {
  const safePrefix = prefix.replace(/\/+$/, '')
  const stamp = timestamp.toISOString().replace(/[:.]/g, '-')
  return `${safePrefix}/${stamp}.sql.gz`
}

export async function uploadBackupToS3({
  bucket,
  prefix,
  gzipBody,
  databaseUrl,
  region,
}) {
  if (!bucket) {
    throw new Error('BACKUP_S3_BUCKET is not set')
  }

  const s3 = new S3Client({ region: region || process.env.AWS_REGION || 'eu-north-1' })
  const key = backupObjectKey(prefix || 'timrapport/db')
  const hostHint = cleanDatabaseUrl(databaseUrl).replace(/\/\/([^@/]+@)?/, '//***@')

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: gzipBody,
      ContentType: 'application/gzip',
      Metadata: {
        source: 'timrapport-db-backup',
        'database-host': hostHint.slice(0, 256),
      },
    })
  )

  return { bucket, key, sizeBytes: gzipBody.length }
}

function parseBackupTimestamp(key) {
  const match = key.match(/\/(\d{4}-\d{2}-\d{2}T[\d-]+Z)\.sql\.gz$/)
  if (!match) return null
  const iso = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/, 'T$1:$2:$3.$4Z')
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function pruneOldBackups({ bucket, prefix, retentionDays, region }) {
  if (!bucket || !retentionDays || retentionDays <= 0) {
    return { deleted: 0 }
  }

  const s3 = new S3Client({ region: region || process.env.AWS_REGION || 'eu-north-1' })
  const safePrefix = `${(prefix || 'timrapport/db').replace(/\/+$/, '')}/`
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000

  let continuationToken
  const keysToDelete = []

  do {
    const listing = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: safePrefix,
        ContinuationToken: continuationToken,
      })
    )

    for (const item of listing.Contents || []) {
      if (!item.Key) continue
      const created = item.LastModified || parseBackupTimestamp(item.Key)
      if (created && created.getTime() < cutoff) {
        keysToDelete.push({ Key: item.Key })
      }
    }

    continuationToken = listing.IsTruncated ? listing.NextContinuationToken : undefined
  } while (continuationToken)

  if (keysToDelete.length === 0) {
    return { deleted: 0 }
  }

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keysToDelete },
    })
  )

  return { deleted: keysToDelete.length }
}

export async function runDatabaseBackup(options = {}) {
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL
  const bucket = options.bucket || process.env.BACKUP_S3_BUCKET
  const prefix = options.prefix || process.env.BACKUP_S3_PREFIX || 'timrapport/db'
  const retentionDays = Number(
    options.retentionDays ?? process.env.BACKUP_RETENTION_DAYS ?? 40
  )
  const region = options.region || process.env.AWS_REGION || 'eu-north-1'

  const sql = await createDatabaseDumpSql(databaseUrl)
  const gzipBody = gzipSqlDump(sql)
  const uploaded = await uploadBackupToS3({
    bucket,
    prefix,
    gzipBody,
    databaseUrl,
    region,
  })
  const pruned = await pruneOldBackups({ bucket, prefix, retentionDays, region })

  return {
    ...uploaded,
    sqlBytes: Buffer.byteLength(sql, 'utf8'),
    pruned,
    retentionDays,
  }
}
