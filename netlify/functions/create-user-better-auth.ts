import { Handler } from '@netlify/functions'
import { sql } from './utils/database'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { email, firstName, lastName, personnummer, betterAuthUserId } = body

    if (!email || !firstName || !lastName || !personnummer || !betterAuthUserId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'All fields are required' }),
      }
    }

    const cleanPersonnummer = personnummer.replace(/\D/g, '')

    // Check if user already exists
    const existingUser = await sql`
      SELECT id FROM users 
      WHERE personnummer = ${cleanPersonnummer} OR email = ${email.trim().toLowerCase()}
      LIMIT 1
    `

    if (existingUser.length > 0) {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'Användaren finns redan' }),
      }
    }

    // Insert user
    await sql`
      INSERT INTO users (name, last_name, personnummer, email, better_auth_user_id)
      VALUES (${firstName}, ${lastName}, ${cleanPersonnummer}, ${email.trim().toLowerCase()}, ${betterAuthUserId})
    `

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: 'User created successfully' }),
    }
  } catch (error: any) {
    console.error('Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

