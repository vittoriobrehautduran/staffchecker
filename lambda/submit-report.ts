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
    'https://staffcheck.spangatbk.se',
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
      SELECT
        date,
        entry_type,
        time_from,
        time_to,
        work_type,
        leave_type,
        compensation_type,
        is_full_day_leave,
        mileage_km,
        compensation_amount,
        compensation_description,
        annat_specification,
        comment
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
      coaching_tennis: 'Coaching (Tennis)',
      coaching_bordtennis: 'Coaching (Bordtennis)',
      privat_traning: 'Privatträning',
      administration: 'Administration',
      cleaning: 'Städning',
      annat: 'Annat',
    }

    const leaveTypeLabels: Record<string, string> = {
      semester: 'Semester',
      tjanstledig: 'Tjänstledig',
      sjukdom: 'Sjukdom',
      vard_av_barn: 'Vård av barn',
      annan_ledighet: 'Annan ledighet',
    }

    const compensationTypeLabels: Record<string, string> = {
      milersattning: 'Milersättning',
      annan_ersattning: 'Annan ersättning',
    }

    // Return 0 for entries without a time interval (full-day leave and compensation).
    const calculateEntryHours = (entry: any): number => {
      if (!entry.time_from || !entry.time_to) {
        return 0
      }
      const fromTime = entry.time_from.substring(0, 5)
      const toTime = entry.time_to.substring(0, 5)
      const from = new Date(`2000-01-01T${fromTime}`)
      const to = new Date(`2000-01-01T${toTime}`)
      return (to.getTime() - from.getTime()) / (1000 * 60 * 60)
    }

    const totalWorkedHours = entries.reduce((sum, entry) => {
      if (entry.entry_type !== 'work') return sum
      return sum + calculateEntryHours(entry)
    }, 0)

    const totalLeaveHours = entries.reduce((sum, entry) => {
      if (entry.entry_type !== 'leave') return sum
      return sum + calculateEntryHours(entry)
    }, 0)

    const totalCompensationEntries = entries.filter(
      (entry) => entry.entry_type === 'compensation'
    ).length

    const totalCompensationAmount = entries.reduce((sum, entry) => {
      if (entry.entry_type !== 'compensation' || !entry.compensation_amount) return sum
      return sum + Number(entry.compensation_amount)
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

    <h2 style="color: #333; font-size: 18px; margin-top: 24px; margin-bottom: 10px; border-bottom: 1px solid #e0e0e0; padding-bottom: 6px;">
      Poster
    </h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <thead>
        <tr style="background-color: #f8f9fa;">
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e0e0e0;">Datum</th>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e0e0e0;">Tid</th>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e0e0e0;">Typ</th>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e0e0e0;">Detaljer</th>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e0e0e0;">Kommentar</th>
        </tr>
      </thead>
      <tbody>
`

    Object.keys(entriesByDate).sort().forEach(dateStr => {
      const dateEntries = entriesByDate[dateStr]
      const date = new Date(dateStr)
      const dateFormatted = date.toLocaleDateString('sv-SE', { 
        year: 'numeric',
        month: 'short',
        day: 'numeric' 
      })

      dateEntries.forEach(entry => {
        const hours = calculateEntryHours(entry)
        let typeLabel = 'Arbete'
        let timeLabel = '-'
        let detailsLabel = ''

        if (entry.entry_type === 'work') {
          const fromTime = entry.time_from?.substring(0, 5) || '--:--'
          const toTime = entry.time_to?.substring(0, 5) || '--:--'
          typeLabel = 'Arbete'
          timeLabel = `${fromTime} - ${toTime} (${hours.toFixed(1)}h)`
          detailsLabel = `${workTypeLabels[entry.work_type] || 'Arbete'}${entry.work_type === 'annat' && entry.annat_specification ? ` - ${entry.annat_specification}` : ''}`
        } else if (entry.entry_type === 'leave') {
          typeLabel = 'Ledighet'
          const leaveLabel = leaveTypeLabels[entry.leave_type] || 'Ledighet'
          timeLabel = entry.is_full_day_leave
            ? 'Hela dagen'
            : `${entry.time_from?.substring(0, 5) || '--:--'} - ${entry.time_to?.substring(0, 5) || '--:--'}`
          if (!entry.is_full_day_leave) {
            timeLabel += ` (${hours.toFixed(1)}h)`
          }
          detailsLabel = leaveLabel
        } else if (entry.entry_type === 'compensation') {
          typeLabel = 'Ersättning'
          const compensationLabel = compensationTypeLabels[entry.compensation_type] || 'Ersättning'
          const compensationDetails =
            entry.compensation_type === 'milersattning' && entry.mileage_km
              ? `${entry.mileage_km} km`
              : entry.compensation_type === 'annan_ersattning'
                ? `${entry.compensation_description || ''}${entry.compensation_amount ? ` (${entry.compensation_amount} SEK)` : ''}`
                : ''
          detailsLabel = `${compensationLabel}${compensationDetails ? ` - ${compensationDetails}` : ''}`
        }

        htmlBody += `
        <tr style="border-bottom: 1px solid #f0f0f0;">
          <td style="padding: 8px; vertical-align: top;">${dateFormatted}</td>
          <td style="padding: 8px; vertical-align: top;">${timeLabel}</td>
          <td style="padding: 8px; vertical-align: top;">${typeLabel}</td>
          <td style="padding: 8px; vertical-align: top;">${detailsLabel}</td>
          <td style="padding: 8px; vertical-align: top; color: #666;">${entry.comment || ''}</td>
        </tr>
`
      })
    })

    htmlBody += `
      </tbody>
    </table>
    <div style="background-color: #f8f9fa; color: #333; padding: 16px; border-radius: 6px; margin-top: 16px;">
      <p style="margin: 0 0 10px 0; font-size: 19px; font-weight: 700;">Månadssummering</p>
      <p style="margin: 6px 0; font-size: 18px;"><strong>Arbetade timmar:</strong> ${totalWorkedHours.toFixed(1)} timmar</p>
      <p style="margin: 6px 0; font-size: 18px;"><strong>Ledighetstimmar:</strong> ${totalLeaveHours.toFixed(1)} timmar</p>
      <p style="margin: 6px 0; font-size: 18px;"><strong>Ersättning:</strong> ${totalCompensationEntries} poster${totalCompensationAmount > 0 ? ` (${totalCompensationAmount.toFixed(2)} SEK)` : ''}</p>
    </div>
  </div>
  
  <p style="text-align: center; color: #888; font-size: 12px; margin-top: 20px;">
    Detta är en automatisk timrapport från Staffcheck
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
    textBody += `Poster:\n`
    textBody += `${'='.repeat(50)}\n\n`

    Object.keys(entriesByDate).sort().forEach(dateStr => {
      const dateEntries = entriesByDate[dateStr]
      const date = new Date(dateStr)
      const dateFormatted = date.toLocaleDateString('sv-SE', { 
        year: 'numeric',
        month: 'short',
        day: 'numeric' 
      })
      dateEntries.forEach(entry => {
        const hours = calculateEntryHours(entry)

        if (entry.entry_type === 'work') {
          const fromTime = entry.time_from?.substring(0, 5) || '--:--'
          const toTime = entry.time_to?.substring(0, 5) || '--:--'
          textBody += `- ${dateFormatted} | Arbete | ${fromTime}-${toTime} (${hours.toFixed(1)}h) | ${workTypeLabels[entry.work_type] || 'Arbete'}`
          if (entry.work_type === 'annat' && entry.annat_specification) {
            textBody += ` - ${entry.annat_specification}`
          }
          textBody += '\n'
        } else if (entry.entry_type === 'leave') {
          const leaveLabel = leaveTypeLabels[entry.leave_type] || 'Ledighet'
          if (entry.is_full_day_leave) {
            textBody += `- ${dateFormatted} | Ledighet | Hela dagen | ${leaveLabel}\n`
          } else {
            const fromTime = entry.time_from?.substring(0, 5) || '--:--'
            const toTime = entry.time_to?.substring(0, 5) || '--:--'
            textBody += `- ${dateFormatted} | Ledighet | ${fromTime}-${toTime} (${hours.toFixed(1)}h) | ${leaveLabel}\n`
          }
        } else if (entry.entry_type === 'compensation') {
          const compensationLabel = compensationTypeLabels[entry.compensation_type] || 'Ersättning'
          if (entry.compensation_type === 'milersattning') {
            textBody += `- ${dateFormatted} | Ersättning | - | ${compensationLabel}${entry.mileage_km ? ` - ${entry.mileage_km} km` : ''}\n`
          } else {
            textBody += `- ${dateFormatted} | Ersättning | - | ${compensationLabel}${entry.compensation_description ? ` - ${entry.compensation_description}` : ''}${entry.compensation_amount ? ` (${entry.compensation_amount} SEK)` : ''}\n`
          }
        }
        if (entry.comment) {
          textBody += `    Kommentar: ${entry.comment}\n`
        }
      })
    })

    textBody += `Månadssummering:\n`
    textBody += `- Arbetade timmar: ${totalWorkedHours.toFixed(1)} timmar\n`
    textBody += `- Ledighetstimmar: ${totalLeaveHours.toFixed(1)} timmar\n`
    textBody += `- Ersättning: ${totalCompensationEntries} poster${totalCompensationAmount > 0 ? ` (${totalCompensationAmount.toFixed(2)} SEK)` : ''}\n`

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

