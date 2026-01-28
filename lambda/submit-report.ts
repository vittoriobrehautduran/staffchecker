import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { sql } from './utils/database'
import { getUserIdFromBetterAuthSession } from './utils/auth'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const sesClient = new SESClient({
  region: process.env.AWS_SES_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY || '',
  },
})

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const httpMethod = event.httpMethod || 'POST'
  
  if (httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    // Get user ID from Better Auth session
    const userId = await getUserIdFromBetterAuthSession(event)
    
    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
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
          'Access-Control-Allow-Origin': '*',
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
          'Access-Control-Allow-Origin': '*',
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
          'Access-Control-Allow-Origin': '*',
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
          'Access-Control-Allow-Origin': '*',
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
          'Access-Control-Allow-Origin': '*',
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

    let emailBody = `Timrapport för ${monthName} ${year}\n\n`
    emailBody += `Anställd: ${user.name} ${user.last_name}\n`
    emailBody += `E-post: ${user.email}\n`
    emailBody += `Personnummer: ${user.personnummer}\n\n`
    emailBody += `Timmar:\n`
    emailBody += `${'='.repeat(50)}\n\n`

    Object.keys(entriesByDate).sort().forEach(dateStr => {
      const dateEntries = entriesByDate[dateStr]
      const date = new Date(dateStr)
      const dateFormatted = date.toLocaleDateString('sv-SE', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
      
      emailBody += `${dateFormatted}\n`
      
      let dateTotal = 0
      dateEntries.forEach(entry => {
        const fromTime = entry.time_from.substring(0, 5)
        const toTime = entry.time_to.substring(0, 5)
        const from = new Date(`2000-01-01T${fromTime}`)
        const to = new Date(`2000-01-01T${toTime}`)
        const hours = (to.getTime() - from.getTime()) / (1000 * 60 * 60)
        dateTotal += hours

        emailBody += `  ${fromTime} - ${toTime} (${hours.toFixed(1)}h) - ${workTypeLabels[entry.work_type]}`
        if (entry.work_type === 'annat' && entry.annat_specification) {
          emailBody += ` - ${entry.annat_specification}`
        }
        emailBody += '\n'
        if (entry.comment) {
          emailBody += `    Kommentar: ${entry.comment}\n`
        }
      })
      
      emailBody += `  Totalt för dagen: ${dateTotal.toFixed(1)} timmar\n\n`
    })

    const totalHours = entries.reduce((sum, entry) => {
      const fromTime = entry.time_from.substring(0, 5)
      const toTime = entry.time_to.substring(0, 5)
      const from = new Date(`2000-01-01T${fromTime}`)
      const to = new Date(`2000-01-01T${toTime}`)
      return sum + (to.getTime() - from.getTime()) / (1000 * 60 * 60)
    }, 0)

    emailBody += `Totalt för månaden: ${totalHours.toFixed(1)} timmar\n`

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
              Text: {
                Data: emailBody,
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
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ 
        message: 'Report submitted successfully',
        submittedAt: new Date().toISOString(),
      }),
    }
  } catch (error: any) {
    console.error('Error:', error)
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

