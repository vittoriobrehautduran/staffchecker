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
