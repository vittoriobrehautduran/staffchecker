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
    const { email, firstName, lastName, personnummer, clerkUserId } = body

    console.log('Received data:', { 
      email: email ? 'present' : 'missing',
      firstName: firstName ? 'present' : 'missing',
      lastName: lastName ? 'present' : 'missing',
      personnummer: personnummer ? 'present' : 'missing',
      clerkUserId: clerkUserId ? 'present' : 'missing',
    })

    if (!email || !firstName || !lastName || !personnummer || !clerkUserId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          message: 'All fields are required',
          received: {
            email: !!email,
            firstName: !!firstName,
            lastName: !!lastName,
            personnummer: !!personnummer,
            clerkUserId: !!clerkUserId,
          }
        }),
      }
    }

    const result = await sql`
      INSERT INTO users (clerk_user_id, name, last_name, personnummer, email)
      VALUES (${clerkUserId}, ${firstName}, ${lastName}, ${personnummer}, ${email})
      ON CONFLICT (clerk_user_id) DO UPDATE
      SET name = EXCLUDED.name,
          last_name = EXCLUDED.last_name,
          personnummer = EXCLUDED.personnummer,
          email = EXCLUDED.email,
          updated_at = CURRENT_TIMESTAMP
      RETURNING id, email, name, last_name
    `

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result[0]),
    }
  } catch (error: any) {
    console.error('Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

