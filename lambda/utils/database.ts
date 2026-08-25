import { neon } from '@neondatabase/serverless'

// Clean DATABASE_URL - remove psql prefix and quotes if present
function cleanDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  // Remove 'psql ' prefix if present
  let cleaned = url.replace(/^psql\s+['"]?/, '')
  
  // Remove trailing quotes
  cleaned = cleaned.replace(/['"]\s*$/, '')
  
  // Remove any remaining quotes at start/end
  cleaned = cleaned.trim().replace(/^['"]|['"]$/g, '')
  
  // Validate it's a valid postgres URL
  if (!cleaned.startsWith('postgresql://') && !cleaned.startsWith('postgres://')) {
    throw new Error(`Invalid DATABASE_URL format. Expected postgresql:// or postgres://, got: ${cleaned.substring(0, 20)}...`)
  }

  return cleaned
}

const databaseUrl = cleanDatabaseUrl(process.env.DATABASE_URL)
export const sql = neon(databaseUrl)

// Postgres SQLSTATE is five chars, e.g. 23505 unique_violation, 42P01 undefined_table.
export function postgresErrorCode(error: unknown): string | undefined {
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const record = current as { code?: unknown; cause?: unknown; source?: unknown }
    if (typeof record.code === 'string' && /^[0-9A-Z]{5}$/.test(record.code)) {
      return record.code
    }
    current = record.cause ?? record.source ?? null
  }

  return undefined
}

export function isUniqueViolation(error: unknown): boolean {
  return postgresErrorCode(error) === '23505'
}

export function isUndefinedTable(error: unknown): boolean {
  return postgresErrorCode(error) === '42P01'
}

