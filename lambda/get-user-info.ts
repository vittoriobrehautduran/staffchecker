import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromCognitoSession, getCognitoUserIdFromRequest } from './utils/cognito-auth'

function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.Origin || event.headers?.origin || '*'
  const allowedOrigins = [
    'http://localhost:5173',
    'https://staffcheck.spangatbk.se',
    'https://staging.d3jub8c52hgrc6.amplifyapp.com',
  ]
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]
}

type MembershipRow = {
  permissions: string | null
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = getCorsOrigin(event)

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: '',
    }
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    const cognitoSub = await getCognitoUserIdFromRequest(event)
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Not authenticated' }),
      }
    }

    const userId = await getUserIdFromCognitoSession(event)

    if (!userId) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({
          code: 'USER_NOT_REGISTERED',
          message:
            'Det finns inget konto kopplat till den här inloggningen. Registrera dig först med samma e-postadress, eller använd e-post och lösenord om du redan har ett konto.',
        }),
      }
    }

    let userResult: {
      id: number
      email: string
      name: string
      last_name: string
      is_admin: boolean
      ui_theme: string | null
      is_salary_manager?: boolean
      is_report_boss?: boolean
    }[]

    try {
      userResult = (await sql`
        SELECT id, email, name, last_name, is_admin, ui_theme,
               is_salary_manager, is_report_boss
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `) as typeof userResult
    } catch (columnError: any) {
      if (columnError?.code !== '42703') {
        throw columnError
      }
      userResult = (await sql`
        SELECT id, email, name, last_name, is_admin, ui_theme
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `) as typeof userResult
    }

    if (userResult.length === 0) {
      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({
          code: 'USER_NOT_REGISTERED',
          message:
            'Det finns inget konto kopplat till den här inloggningen. Registrera dig först med samma e-postadress, eller använd e-post och lösenord om du redan har ett konto.',
        }),
      }
    }

    const user = userResult[0]
    const theme = user.ui_theme === 'dark' ? 'dark' : 'light'

    let clubPermissions: string[] = []

    try {
      const memberships = (await sql`
        SELECT DISTINCT unnest(m.permissions) AS permissions
        FROM user_club_memberships m
        WHERE m.user_id = ${userId}
      `) as MembershipRow[]
      clubPermissions = memberships
        .map((row) => row.permissions)
        .filter((permission): permission is string => typeof permission === 'string')
    } catch (membershipError: any) {
      if (membershipError?.code !== '42P01') {
        throw membershipError
      }
      clubPermissions = []
    }

    const hasClubBossAccess = clubPermissions.includes('club_boss')
    const hasClubCoachAccess = clubPermissions.includes('club_coach')
    const hasClubAccess = hasClubBossAccess || hasClubCoachAccess

    const bossEmail = (process.env.BOSS_EMAIL_ADDRESS || '').trim().toLowerCase()
    const userEmail = (user.email || '').trim().toLowerCase()
    const isSalaryManager = !!user.is_salary_manager
    const isReportBoss = !!user.is_report_boss
    const isBossEmail = bossEmail.length > 0 && userEmail === bossEmail
    const hasEmployeeReportsAccess =
      !!user.is_admin || isSalaryManager || isReportBoss || isBossEmail

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        lastName: user.last_name,
        isAdmin: user.is_admin || false,
        theme,
        clubPermissions,
        hasClubAccess,
        hasClubBossAccess,
        isSalaryManager,
        isReportBoss,
        hasEmployeeReportsAccess,
      }),
    }
  } catch (error: any) {
    console.error('Error getting user info:', error)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({
        message: 'Internal server error',
        error: error?.message || 'Unknown error',
      }),
    }
  }
}
