import { EventBridgeEvent, Context } from 'aws-lambda'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

// This function runs every 5 minutes via EventBridge (CloudWatch Events)
// Deletes unverified users older than 2 minutes
export const handler = async (
  event: EventBridgeEvent<'Scheduled Event', any>,
  context: Context
): Promise<{ statusCode: number; body: string }> => {
  try {
    console.log('Starting cleanup of unverified users...')
    
    // Find all unverified users created more than 2 minutes ago
    const unverifiedUsers = await sql`
      SELECT id, email, "createdAt", "emailVerified"
      FROM public."user"
      WHERE "emailVerified" = false
        AND "createdAt" < NOW() - INTERVAL '2 minutes'
    `

    console.log(`Found ${unverifiedUsers.length} unverified users older than 2 minutes`)

    let deletedCount = 0
    const errors: string[] = []

    for (const user of unverifiedUsers) {
      try {
        const betterAuthUserId = user.id
        
        // Delete from our users table first (if exists)
        await sql`
          DELETE FROM users
          WHERE better_auth_user_id = ${betterAuthUserId}
        `

        // Delete from Better Auth user table
        // This will cascade delete sessions, accounts, etc. due to foreign key constraints
        await sql`
          DELETE FROM public."user"
          WHERE id = ${betterAuthUserId}
        `

        deletedCount++
        console.log(`Deleted unverified user: ${user.email} (created: ${user.createdAt})`)
      } catch (error: any) {
        const errorMsg = `Error deleting user ${user.email}: ${error.message}`
        console.error(errorMsg)
        errors.push(errorMsg)
      }
    }

    const result = {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Cleanup completed',
        totalFound: unverifiedUsers.length,
        deleted: deletedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
    }

    console.log(`Cleanup completed: ${deletedCount}/${unverifiedUsers.length} users deleted`)
    
    return result
  } catch (error: any) {
    console.error('Error in cleanup-unverified-users:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Cleanup failed',
        error: error.message,
      }),
    }
  }
}

