// Times in 20-minute steps for lesson start/duration pickers.
export function buildTimeOptions(stepMinutes = 20): string[] {
  const options: string[] = []
  for (let minutes = 6 * 60; minutes <= 22 * 60; minutes += stepMinutes) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return options
}

export const DURATION_OPTIONS = [20, 40, 60, 80, 100, 120]

export function addMinutesToTime(startTime: string, minutes: number): string {
  const [hours, mins] = startTime.split(':').map(Number)
  const totalMinutes = hours * 60 + mins + minutes
  const nextHours = Math.floor(totalMinutes / 60) % 24
  const nextMins = totalMinutes % 60
  return `${String(nextHours).padStart(2, '0')}:${String(nextMins).padStart(2, '0')}`
}
