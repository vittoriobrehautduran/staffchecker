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

    // Check if personnummer already exists
    const existingUser = await sql`
      SELECT clerk_user_id, email FROM users WHERE personnummer = ${personnummer} LIMIT 1
    `

    if (existingUser.length > 0) {
      // Personnummer already exists
      if (existingUser[0].clerk_user_id === clerkUserId) {
        // Same user trying to register again - update the record
        const result = await sql`
          UPDATE users
          SET name = ${firstName},
              last_name = ${lastName},
              email = ${email},
              updated_at = CURRENT_TIMESTAMP
          WHERE clerk_user_id = ${clerkUserId}
          RETURNING id, email, name, last_name
        `
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(result[0]),
        }
      } else {
        // Different user with same personnummer - this is an error
        return {
          statusCode: 409,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            message: 'Detta personnummer är redan registrerat med ett annat konto',
            code: 'PERSONNUMMER_EXISTS'
          }),
        }
      }
    }

    // Check if clerk_user_id already exists (update existing user)
    const existingClerkUser = await sql`
      SELECT personnummer FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `

    if (existingClerkUser.length > 0) {
      // Update existing user
      const result = await sql`
        UPDATE users
        SET name = ${firstName},
            last_name = ${lastName},
            personnummer = ${personnummer},
            email = ${email},
            updated_at = CURRENT_TIMESTAMP
        WHERE clerk_user_id = ${clerkUserId}
        RETURNING id, email, name, last_name
      `
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(result[0]),
      }
    }

    // Create new user
    const result = await sql`
      INSERT INTO users (clerk_user_id, name, last_name, personnummer, email)
      VALUES (${clerkUserId}, ${firstName}, ${lastName}, ${personnummer}, ${email})
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
    
    // Handle duplicate key errors more gracefully
    if (error.code === '23505') {
      if (error.constraint === 'users_personnummer_key') {
        return {
          statusCode: 409,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            message: 'Detta personnummer är redan registrerat',
            code: 'PERSONNUMMER_EXISTS'
          }),
        }
      } else if (error.constraint === 'users_clerk_user_id_key') {
        return {
          statusCode: 409,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            message: 'Detta konto är redan registrerat',
            code: 'USER_EXISTS'
          }),
        }
      }
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

