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

