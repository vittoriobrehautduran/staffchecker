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
    const { personnummer } = JSON.parse(event.body || '{}')

    if (!personnummer) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Personnummer is required' }),
      }
    }

    const result = await sql`
      SELECT email 
      FROM users 
      WHERE personnummer = ${personnummer}
      LIMIT 1
    `

    if (result.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'User not found' }),
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: result[0].email }),
    }
  } catch (error: any) {
    console.error('Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

