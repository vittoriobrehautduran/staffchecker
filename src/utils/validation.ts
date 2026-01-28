export function validatePersonnummer(personnummer: string): boolean {
  const cleaned = personnummer.replace(/\D/g, '')
  return cleaned.length === 10 || cleaned.length === 12
}

export function maskPersonnummer(personnummer: string): string {
  const cleaned = personnummer.replace(/\D/g, '')
  if (cleaned.length <= 4) {
    return '*'.repeat(cleaned.length)
  }
  const visible = cleaned.slice(0, -4)
  const masked = '*'.repeat(4)
  return visible + masked
}

export function formatPersonnummerInput(value: string): string {
  const cleaned = value.replace(/\D/g, '')
  if (cleaned.length <= 4) {
    return cleaned
  }
  const visible = cleaned.slice(0, -4)
  const lastFour = cleaned.slice(-4)
  return visible + lastFour
}

export function validateTimeRange(from: string, to: string): boolean {
  if (!from || !to) return false
  const fromTime = new Date(`2000-01-01T${from}`)
  const toTime = new Date(`2000-01-01T${to}`)
  return toTime > fromTime
}

export function calculateHours(from: string, to: string): number {
  if (!from || !to) return 0
  const fromTime = new Date(`2000-01-01T${from}`)
  const toTime = new Date(`2000-01-01T${to}`)
  const diffMs = toTime.getTime() - fromTime.getTime()
  return diffMs / (1000 * 60 * 60)
}

