import { EventBridgeEvent, Context } from 'aws-lambda'
import { sql } from './utils/database'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const sesClient = new SESClient({
  region: process.env.AWS_SES_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY || '',
  },
})

// This function runs on the 2nd of each month via EventBridge (CloudWatch Events)
// EventBridge event format is different from API Gateway
export const handler = async (
  event: EventBridgeEvent<'Scheduled Event', any>,
  context: Context
): Promise<{ statusCode: number; body: string }> => {
  try {
    const today = new Date()
    const lastMonth = today.getMonth() === 0 ? 12 : today.getMonth()
    const lastMonthYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()

    // Get all draft reports from last month
    const reports = await sql`
      SELECT r.id, r.user_id, r.month, r.year, u.name, u.last_name, u.email, u.personnummer
      FROM reports r
      JOIN users u ON r.user_id = u.id
      WHERE r.month = ${lastMonth}
        AND r.year = ${lastMonthYear}
        AND r.status = 'draft'
    `

    const bossEmail = process.env.BOSS_EMAIL_ADDRESS

    let submittedCount = 0

    for (const report of reports) {
      // Get entries for this report
      const entries = await sql`
        SELECT date, time_from, time_to, work_type, annat_specification, comment
        FROM entries
        WHERE report_id = ${report.id}
        ORDER BY date, time_from
      `

      // Only submit if there are entries
      if (entries.length > 0) {
        submittedCount++
        // Update report status
        await sql`
          UPDATE reports
          SET status = 'submitted',
              submitted_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${report.id}
        `

        // Format and send email
        const monthNames = [
          'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
          'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'
        ]
        const monthName = monthNames[lastMonth - 1]

        const entriesByDate: Record<string, typeof entries> = {}
        entries.forEach(entry => {
          if (!entriesByDate[entry.date]) {
            entriesByDate[entry.date] = []
          }
          entriesByDate[entry.date].push(entry)
        })

        const workTypeLabels = {
          cafe: 'Cafe',
          coaching: 'Coaching',
          administration: 'Administration',
          cleaning: 'Städning',
          annat: 'Annat',
        }

        let emailBody = `Timrapport för ${monthName} ${lastMonthYear}\n\n`
        emailBody += `Anställd: ${report.name} ${report.last_name}\n`
        emailBody += `E-post: ${report.email}\n`
        emailBody += `Personnummer: ${report.personnummer}\n\n`
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

        // Send email if boss email is configured
        if (bossEmail) {
          try {
            const emailCommand = new SendEmailCommand({
              Source: report.email,
              Destination: {
                ToAddresses: [bossEmail],
              },
              Message: {
                Subject: {
                  Data: `Timrapport (Automatisk) - ${report.name} ${report.last_name} - ${monthName} ${lastMonthYear}`,
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
            console.error(`Error sending email for report ${report.id}:`, emailError)
          }
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: `Processed ${reports.length} reports, submitted ${submittedCount}`,
      }),
    }
  } catch (error: any) {
    console.error('Error in auto-submit:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: error.message || 'Internal server error' }),
    }
  }
}

