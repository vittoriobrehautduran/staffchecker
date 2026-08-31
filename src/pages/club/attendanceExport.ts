import type { AttendanceHistorySession } from '@/pages/club/clubAttendanceTypes'
import { formatSessionVenue } from '@/pages/club/clubAttendanceTypes'

const STATUS_LABELS: Record<string, string> = {
  present: 'Närvarande',
  absent: 'Frånvarande',
  unknown: 'Okänd',
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function exportHistoryToCsv(
  sessions: AttendanceHistorySession[],
  fromDate: string,
  toDate: string
) {
  const header = ['Datum', 'Tid', 'Sport', 'Plats', 'Grupp', 'Elev', 'Närvaro', 'Dag-tillägg']
  const rows = [header.join(';')]

  for (const session of sessions) {
    const venue = formatSessionVenue({
      resourceLabel: session.resourceLabel,
      resourceNumber: session.resourceNumber,
      resourceType: session.sport === 'tennis' ? 'court' : 'table',
    })
    const sport = session.sport === 'tennis' ? 'Tennis' : 'Bordtennis'
    const timeRange = `${session.startTime}–${session.endTime}`

    if (session.players.length === 0) {
      rows.push(
        [
          session.date,
          timeRange,
          sport,
          venue,
          session.className || '',
          '',
          '',
          '',
        ]
          .map(escapeCsvCell)
          .join(';')
      )
      continue
    }

    for (const player of session.players) {
      rows.push(
        [
          session.date,
          timeRange,
          sport,
          venue,
          session.className || '',
          player.name,
          STATUS_LABELS[player.status] || player.status,
          player.isDayAddition ? 'Ja' : 'Nej',
        ]
          .map(escapeCsvCell)
          .join(';')
      )
    }
  }

  const csv = `\uFEFF${rows.join('\n')}`
  downloadTextFile(`narvaro-${fromDate}-${toDate}.csv`, csv, 'text/csv;charset=utf-8')
}

export function exportHistoryToPdf(
  sessions: AttendanceHistorySession[],
  fromDate: string,
  toDate: string,
  clubName = 'Klubb'
) {
  const isSingleDay = fromDate === toDate
  const pageTitle = isSingleDay
    ? `Närvaro ${fromDate}`
    : `Närvarohistorik ${fromDate} – ${toDate}`
  const heading = isSingleDay
    ? `${clubName} — närvaro`
    : `${clubName} — närvarohistorik`
  const meta = isSingleDay
    ? `${fromDate} · ${sessions.length} lektioner`
    : `${fromDate} till ${toDate} · ${sessions.length} lektioner`

  const lines: string[] = [
    `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8">`,
    `<title>${pageTitle}</title>`,
    `<style>`,
    `body{font-family:system-ui,sans-serif;font-size:12px;margin:24px;color:#111}`,
    `h1{font-size:18px;margin:0 0 4px}`,
    `.meta{color:#555;margin-bottom:20px}`,
    `.session{margin-bottom:16px;page-break-inside:avoid}`,
    `.session h2{font-size:14px;margin:0 0 6px}`,
    `table{width:100%;border-collapse:collapse;margin-top:6px}`,
    `th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}`,
    `th{background:#f3f3f3}`,
    `</style></head><body>`,
    `<h1>${heading}</h1>`,
    `<p class="meta">${meta}</p>`,
  ]

  for (const session of sessions) {
    const venue = formatSessionVenue({
      resourceLabel: session.resourceLabel,
      resourceNumber: session.resourceNumber,
      resourceType: session.sport === 'tennis' ? 'court' : 'table',
    })
    const sport = session.sport === 'tennis' ? 'Tennis' : 'Bordtennis'
    const summary = `${session.summary.present} närvarande, ${session.summary.absent} frånvarande, ${session.summary.unknown} okänd`

    lines.push(`<div class="session">`)
    lines.push(
      `<h2>${session.date} ${session.startTime}–${session.endTime} · ${venue} · ${sport}</h2>`
    )
    lines.push(
      `<p>${session.className || 'Lektion'} · ${summary} (${session.summary.total} elever)</p>`
    )

    if (session.players.length > 0) {
      lines.push(`<table><thead><tr><th>Elev</th><th>Närvaro</th><th>Dag-tillägg</th></tr></thead><tbody>`)
      for (const player of session.players) {
        lines.push(
          `<tr><td>${player.name}</td><td>${STATUS_LABELS[player.status] || player.status}</td><td>${player.isDayAddition ? 'Ja' : 'Nej'}</td></tr>`
        )
      }
      lines.push(`</tbody></table>`)
    } else {
      lines.push(`<p>Inga elever registrerade.</p>`)
    }

    lines.push(`</div>`)
  }

  lines.push(`</body></html>`)

  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  printWindow.document.write(lines.join(''))
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

export function exportDayToCsv(
  sessions: AttendanceHistorySession[],
  date: string
) {
  exportHistoryToCsv(sessions, date, date)
}

export function exportDayToPdf(
  sessions: AttendanceHistorySession[],
  date: string,
  clubName = 'Klubb'
) {
  exportHistoryToPdf(sessions, date, date, clubName)
}
