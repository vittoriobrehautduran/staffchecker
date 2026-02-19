import { EventBridgeEvent, Context } from 'aws-lambda'
import { sql } from './utils/database'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const sesClient = new SESClient({
  region: process.env.SES_REGION || 'eu-north-1',
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
  <title>Timrapport - ${monthName} ${lastMonthYear}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="color: #1a73e8; margin-top: 0; margin-bottom: 10px; font-size: 28px; border-bottom: 3px solid #1a73e8; padding-bottom: 10px;">
      Timrapport
    </h1>
    <p style="color: #666; font-size: 18px; margin-top: 5px; margin-bottom: 30px;">
      ${monthName} ${lastMonthYear}
    </p>
    
    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin-bottom: 30px; border-radius: 4px;">
      <p style="margin: 0; color: #856404; font-weight: 600;">⚠️ Automatiskt skickad</p>
    </div>
    
    <div style="background-color: #f8f9fa; border-left: 4px solid #1a73e8; padding: 15px; margin-bottom: 30px; border-radius: 4px;">
      <p style="margin: 5px 0;"><strong style="color: #333;">Anställd:</strong> <span style="color: #1a73e8;">${report.name} ${report.last_name}</span></p>
      <p style="margin: 5px 0;"><strong style="color: #333;">E-post:</strong> ${report.email}</p>
      ${report.personnummer ? `<p style="margin: 5px 0;"><strong style="color: #333;">Personnummer:</strong> ${report.personnummer}</p>` : ''}
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

        // Plain text version
        let textBody = `Timrapport för ${monthName} ${lastMonthYear}\n\n`
        textBody += `⚠️ Automatiskt skickad\n\n`
        textBody += `Anställd: ${report.name} ${report.last_name}\n`
        textBody += `E-post: ${report.email}\n`
        if (report.personnummer) {
          textBody += `Personnummer: ${report.personnummer}\n`
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

