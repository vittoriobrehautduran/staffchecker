import { sql } from './database'

// Get numeric user ID from Better Auth user ID
export async function getUserIdFromBetterAuthId(betterAuthUserId: string): Promise<number | null> {
  try {
    const result = await sql`
      SELECT id FROM users 
      WHERE better_auth_user_id = ${betterAuthUserId}
      LIMIT 1
    `

    if (result.length === 0) {
      return null
    }

    return result[0].id
  } catch (error) {
    console.error('Error getting user ID:', error)
    return null
  }
}

