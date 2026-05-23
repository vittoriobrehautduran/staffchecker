type EntryRow = {
  entry_type: string
  time_from: string | null
  time_to: string | null
}

function calculateHours(from: string, to: string): number {
  const fromTime = new Date(`2000-01-01T${from}`)
  const toTime = new Date(`2000-01-01T${to}`)
  const diffMs = toTime.getTime() - fromTime.getTime()
  if (Number.isNaN(diffMs) || diffMs <= 0) {
    return 0
  }
  return diffMs / (1000 * 60 * 60)
}

export function summarizeReportEntries(entries: EntryRow[]) {
  let workedHours = 0
  let leaveHours = 0
  const dayKeys = new Set<string>()

  for (const entry of entries) {
    if (entry.time_from && entry.time_to) {
      const from = entry.time_from.substring(0, 5)
      const to = entry.time_to.substring(0, 5)
      const hours = calculateHours(from, to)

      if (entry.entry_type === 'work') {
        workedHours += hours
      }
      if (entry.entry_type === 'leave') {
        leaveHours += hours
      }
    }
  }

  return {
    workedHours: Math.round(workedHours * 10) / 10,
    leaveHours: Math.round(leaveHours * 10) / 10,
    entryCount: entries.length,
  }
}
