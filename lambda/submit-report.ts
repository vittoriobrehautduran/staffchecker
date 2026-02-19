import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromCognitoSession } from './utils/cognito-auth'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const sesClient = new SESClient({
  region: process.env.SES_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY || '',
  },
})

// Helper function to get CORS origin from request
function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.Origin || event.headers?.origin || '*'
  const allowedOrigins = [
    'http://localhost:5173',
    'https://main.d3jub8c52hgrc6.amplifyapp.com',
  ]
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Handle OPTIONS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    const origin = getCorsOrigin(event)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,Cookie,X-Auth-Token',
        'Access-Control-Max-Age': '86400', // 24 hours
      },
      body: '',
    }
  }

  const httpMethod = event.httpMethod || 'POST'
  const origin = getCorsOrigin(event)
  
  if (httpMethod !== 'POST') {
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
    // Get user ID from Better Auth session
    const userId = await getUserIdFromCognitoSession(event)
    
    if (!userId) {
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

    const body = JSON.parse(event.body || '{}')
    const { month, year } = body

    if (!month || !year) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Month and year are required' }),
      }
    }

    // Get user from database
    const userResult = await sql`
      SELECT id, name, last_name, email, personnummer FROM users WHERE id = ${userId} LIMIT 1
    `

    if (userResult.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'User not found' }),
      }
    }

    const user = userResult[0]

    // Get report
    const reportResult = await sql`
      SELECT id, status FROM reports 
      WHERE user_id = ${userId} AND month = ${month} AND year = ${year}
      LIMIT 1
    `

    if (reportResult.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Report not found' }),
      }
    }

    const report = reportResult[0]

    if (report.status === 'submitted') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Report already submitted' }),
      }
    }

    // Get all entries for this report
    const entries = await sql`
      SELECT date, time_from, time_to, work_type, annat_specification, comment
      FROM entries
      WHERE report_id = ${report.id}
      ORDER BY date, time_from
    `

    if (entries.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: JSON.stringify({ message: 'Cannot submit empty report' }),
      }
    }

    // Update report status
    await sql`
      UPDATE reports
      SET status = 'submitted',
          submitted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${report.id}
    `

    // Format email content
    const monthNames = [
      'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
      'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'
    ]
    const monthName = monthNames[month - 1]

    // Group entries by date
    const entriesByDate: Record<string, typeof entries> = {}
    entries.forEach(entry => {
      if (!entriesByDate[entry.date]) {
        entriesByDate[entry.date] = []
      }
      entriesByDate[entry.date].push(entry)
    })

    const workTypeLabels: Record<string, string> = {
      cafe: 'Cafe',
      coaching: 'Coaching',
      administration: 'Administration',
      cleaning: 'Städning',
      annat: 'Annat',
    }

    // Calculate total hours
    const totalHours = entries.reduce((sum, entry) => {
      const fromTime = entry.time_from.substring(0, 5)
      const toTime = entry.time_to.substring(0, 5)
      const from = new Date(`2000-01-01T${fromTime}`)
      const to = new Date(`2000-01-01T${toTime}`)
      return sum + (to.getTime() - from.getTime()) / (1000 * 60 * 60)
    }, 0)

    // Generate HTML email body
    let htmlBody = `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Timrapport - ${monthName} ${year}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="color: #1a73e8; margin-top: 0; margin-bottom: 10px; font-size: 28px; border-bottom: 3px solid #1a73e8; padding-bottom: 10px;">
      Timrapport
    </h1>
    <p style="color: #666; font-size: 18px; margin-top: 5px; margin-bottom: 30px;">
      ${monthName} ${year}
    </p>
    
    <div style="background-color: #f8f9fa; border-left: 4px solid #1a73e8; padding: 15px; margin-bottom: 30px; border-radius: 4px;">
      <p style="margin: 5px 0;"><strong style="color: #333;">Anställd:</strong> <span style="color: #1a73e8;">${user.name} ${user.last_name}</span></p>
      <p style="margin: 5px 0;"><strong style="color: #333;">E-post:</strong> ${user.email}</p>
      ${user.personnummer ? `<p style="margin: 5px 0;"><strong style="color: #333;">Personnummer:</strong> ${user.personnummer}</p>` : ''}
    </div>

    <h2 style="color: #333; font-size: 20px; margin-top: 30px; margin-bottom: 15px; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px;">
      Tidsregistreringar
    </h2>
`

    Object.keys(entriesByDate).sort().forEach(dateStr => {
      const dateEntries = entriesByDate[dateStr]
      const date = new Date(dateStr)
      const dateFormatted = date.toLocaleDateString('sv-SE', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
      
      let dateTotal = 0
      dateEntries.forEach(entry => {
        const fromTime = entry.time_from.substring(0, 5)
        const toTime = entry.time_to.substring(0, 5)
        const from = new Date(`2000-01-01T${fromTime}`)
        const to = new Date(`2000-01-01T${toTime}`)
        const hours = (to.getTime() - from.getTime()) / (1000 * 60 * 60)
        dateTotal += hours
      })

      htmlBody += `
    <div style="margin-bottom: 25px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden;">
      <div style="background-color: #1a73e8; color: white; padding: 12px 15px; font-weight: 600; font-size: 16px;">
        ${dateFormatted}
      </div>
      <div style="padding: 15px;">
        <table style="width: 100%; border-collapse: collapse;">
`

      dateEntries.forEach(entry => {
        const fromTime = entry.time_from.substring(0, 5)
        const toTime = entry.time_to.substring(0, 5)
        const from = new Date(`2000-01-01T${fromTime}`)
        const to = new Date(`2000-01-01T${toTime}`)
        const hours = (to.getTime() - from.getTime()) / (1000 * 60 * 60)

        htmlBody += `
          <tr style="border-bottom: 1px solid #f0f0f0;">
            <td style="padding: 10px 0; width: 140px;">
              <strong style="color: #333;">${fromTime} - ${toTime}</strong>
            </td>
            <td style="padding: 10px 0; width: 80px;">
              <span style="background-color: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 13px;">
                ${hours.toFixed(1)}h
              </span>
            </td>
            <td style="padding: 10px 0;">
              <span style="color: #666;">${workTypeLabels[entry.work_type]}${entry.work_type === 'annat' && entry.annat_specification ? ` - ${entry.annat_specification}` : ''}</span>
            </td>
          </tr>
`
        if (entry.comment) {
          htmlBody += `
          <tr>
            <td colspan="3" style="padding: 5px 0 10px 0;">
              <span style="color: #888; font-style: italic; font-size: 14px;">💬 ${entry.comment}</span>
            </td>
          </tr>
`
        }
      })

      htmlBody += `
        </table>
        <div style="margin-top: 12px; padding-top: 12px; border-top: 2px solid #e0e0e0;">
          <strong style="color: #333; font-size: 15px;">Totalt för dagen: <span style="color: #1a73e8;">${dateTotal.toFixed(1)} timmar</span></strong>
        </div>
      </div>
    </div>
`
    })

    htmlBody += `
    <div style="background-color: #1a73e8; color: white; padding: 20px; border-radius: 6px; margin-top: 30px; text-align: center;">
      <p style="margin: 0; font-size: 24px; font-weight: 600;">
        Totalt för månaden: ${totalHours.toFixed(1)} timmar
      </p>
    </div>
  </div>
  
  <p style="text-align: center; color: #888; font-size: 12px; margin-top: 20px;">
    Detta är en automatisk timrapport från Staff Checker
  </p>
</body>
</html>
`

    // Plain text version for email clients that don't support HTML
    let textBody = `Timrapport för ${monthName} ${year}\n\n`
    textBody += `Anställd: ${user.name} ${user.last_name}\n`
    textBody += `E-post: ${user.email}\n`
    if (user.personnummer) {
      textBody += `Personnummer: ${user.personnummer}\n`
    }
    textBody += '\n'
    textBody += `Timmar:\n`
    textBody += `${'='.repeat(50)}\n\n`

    Object.keys(entriesByDate).sort().forEach(dateStr => {
      const dateEntries = entriesByDate[dateStr]
      const date = new Date(dateStr)
      const dateFormatted = date.toLocaleDateString('sv-SE', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
      
      textBody += `${dateFormatted}\n`
      
      let dateTotal = 0
      dateEntries.forEach(entry => {
        const fromTime = entry.time_from.substring(0, 5)
        const toTime = entry.time_to.substring(0, 5)
        const from = new Date(`2000-01-01T${fromTime}`)
        const to = new Date(`2000-01-01T${toTime}`)
        const hours = (to.getTime() - from.getTime()) / (1000 * 60 * 60)
        dateTotal += hours

        textBody += `  ${fromTime} - ${toTime} (${hours.toFixed(1)}h) - ${workTypeLabels[entry.work_type]}`
        if (entry.work_type === 'annat' && entry.annat_specification) {
          textBody += ` - ${entry.annat_specification}`
        }
        textBody += '\n'
        if (entry.comment) {
          textBody += `    Kommentar: ${entry.comment}\n`
        }
      })
      
      textBody += `  Totalt för dagen: ${dateTotal.toFixed(1)} timmar\n\n`
    })

    textBody += `Totalt för månaden: ${totalHours.toFixed(1)} timmar\n`

    // Send email via AWS SES
    const bossEmail = process.env.BOSS_EMAIL_ADDRESS
    if (bossEmail) {
      try {
        const emailCommand = new SendEmailCommand({
          Source: user.email,
          Destination: {
            ToAddresses: [bossEmail],
          },
          Message: {
            Subject: {
              Data: `Timrapport - ${user.name} ${user.last_name} - ${monthName} ${year}`,
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: htmlBody,
                Charset: 'UTF-8',
              },
              Text: {
                Data: textBody,
                Charset: 'UTF-8',
              },
            },
          },
        })

        await sesClient.send(emailCommand)
      } catch (emailError: any) {
        console.error('Error sending email:', emailError)
        // Don't fail the submission if email fails - just log it
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ 
        message: 'Report submitted successfully',
        submittedAt: new Date().toISOString(),
      }),
    }
  } catch (error: any) {
    console.error('Error:', error)
    const errorOrigin = getCorsOrigin(event)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': errorOrigin,
        'Access-Control-Allow-Credentials': 'true',
      },
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

