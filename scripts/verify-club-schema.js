/**
 * Checks that Neon has the club tables/columns närvaro + veckoschema need.
 * Usage: DATABASE_URL=... node scripts/verify-club-schema.js
 * Or: DATABASE_URL_STAGING=... node scripts/verify-club-schema.js
 */
import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_STAGING
if (!databaseUrl) {
  console.error('Set DATABASE_URL (or DATABASE_URL_STAGING) before running.')
  process.exit(1)
}

const requiredTables = [
  'clubs',
  'user_club_memberships',
  'club_coaches',
  'club_classes',
  'club_class_players',
  'club_resources',
  'club_schedule_template',
  'club_schedule_template_coaches',
  'club_sessions',
  'club_session_players',
  'club_session_coaches',
  'club_attendance',
  'club_audit_log',
  'club_notifications',
  'club_closure_ranges',
]

const requiredColumns = [
  { table: 'clubs', column: 'tennis_enabled' },
  { table: 'clubs', column: 'bordtennis_enabled' },
  { table: 'club_schedule_template', column: 'sport' },
  { table: 'club_attendance', column: 'session_player_id' },
  { table: 'club_cancelled_days', column: 'closure_type' },
]

const sql = postgres(databaseUrl, { max: 1, ssl: 'require' })

try {
  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `
  const tableSet = new Set(tables.map((row) => row.table_name))

  const missingTables = requiredTables.filter((name) => !tableSet.has(name))
  const missingColumns = []

  for (const { table, column } of requiredColumns) {
    if (!tableSet.has(table)) continue
    const cols = await sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
      LIMIT 1
    `
    if (!cols.length) missingColumns.push(`${table}.${column}`)
  }

  if (missingTables.length || missingColumns.length) {
    console.error('Club schema is incomplete.')
    if (missingTables.length) {
      console.error('Missing tables:', missingTables.join(', '))
    }
    if (missingColumns.length) {
      console.error('Missing columns:', missingColumns.join(', '))
    }
    console.error(
      'Apply database/migration-add-club-module.sql then migration-club-schedule-ui.sql, migration-club-attendance-ui.sql, migration-club-closures.sql, migration-club-default-memberships.sql'
    )
    process.exit(2)
  }

  console.log('Club schema looks complete.')
} finally {
  await sql.end({ timeout: 5 })
}
