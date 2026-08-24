#!/usr/bin/env node
/**
 * Restore a .sql.gz backup into DATABASE_URL.
 *
 * Usage:
 *   node scripts/restore-database.js path/to/backup.sql.gz
 *   node scripts/restore-database.js --s3 s3://bucket/timrapport/db/2026-08-24T02-00-00-000Z.sql.gz
 *
 * Requires DATABASE_URL in .env.local or environment.
 * Apply database/schema.sql on an empty database before data-only restores if needed.
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { gunzipSync } from 'zlib'
import pg from 'pg'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const { Client } = pg
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

function cleanDatabaseUrl(url) {
  if (!url) throw new Error('DATABASE_URL is not set')
  let cleaned = url.replace(/^psql\s+['"]?/, '').replace(/['"]\s*$/, '').trim()
  cleaned = cleaned.replace(/^['"]|['"]$/g, '')
  return cleaned
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function loadBackupBuffer(sourceArg) {
  if (sourceArg.startsWith('--s3 ')) {
    const uri = sourceArg.replace('--s3 ', '').trim()
    const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/)
    if (!match) throw new Error('S3 URI must look like s3://bucket/key')

    const s3 = new S3Client({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1',
    })
    const response = await s3.send(
      new GetObjectCommand({ Bucket: match[1], Key: match[2] })
    )
    return streamToBuffer(response.Body)
  }

  const filePath = sourceArg
  if (!existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filePath}`)
  }
  return readFileSync(filePath)
}

function splitSqlStatements(sqlText) {
  const statements = []
  let current = ''
  let inSingleQuote = false

  for (let i = 0; i < sqlText.length; i += 1) {
    const char = sqlText[i]
    const next = sqlText[i + 1]

    if (char === "'" && !inSingleQuote) {
      inSingleQuote = true
      current += char
      continue
    }

    if (char === "'" && inSingleQuote) {
      if (next === "'") {
        current += "''"
        i += 1
        continue
      }
      inSingleQuote = false
      current += char
      continue
    }

    if (char === ';' && !inSingleQuote) {
      const trimmed = current.trim()
      if (trimmed && !trimmed.startsWith('--')) {
        statements.push(trimmed)
      }
      current = ''
      continue
    }

    current += char
  }

  const tail = current.trim()
  if (tail && !tail.startsWith('--')) {
    statements.push(tail)
  }

  return statements
}

async function main() {
  const sourceArg = process.argv[2]
  if (!sourceArg) {
    console.error('Usage: node scripts/restore-database.js <file.sql.gz>')
    console.error('   or: node scripts/restore-database.js --s3 s3://bucket/key.sql.gz')
    process.exit(1)
  }

  const envVars = parseEnvFile(join(projectRoot, '.env.local'))
  for (const [key, value] of Object.entries(envVars)) {
    if (!process.env[key]) process.env[key] = value
  }

  const databaseUrl = cleanDatabaseUrl(process.env.DATABASE_URL)
  const rawBuffer = await loadBackupBuffer(sourceArg)
  const sqlText = gunzipSync(rawBuffer).toString('utf8')
  const statements = splitSqlStatements(sqlText)

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  try {
    for (const statement of statements) {
      await client.query(statement)
    }
    console.log(`Restore complete (${statements.length} statements).`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Restore failed:', error.message || error)
  process.exit(1)
})
