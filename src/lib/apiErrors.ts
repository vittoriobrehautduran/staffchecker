type AttendanceErrorContext = 'load' | 'save'

// Turn raw API/network errors into short Swedish messages coaches can understand.
export function attendanceErrorMessage(
  error: unknown,
  context: AttendanceErrorContext
): { title: string; description: string } {
  const raw = error instanceof Error ? error.message : ''
  const message = raw.trim()
  const lower = message.toLowerCase()

  const isLoad = context === 'load'
  const defaultTitle = isLoad ? 'Kunde inte ladda närvaro' : 'Kunde inte spara närvaro'

  if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
    return {
      title: defaultTitle,
      description: 'Ingen internetanslutning. Kontrollera nätverket och försök igen.',
    }
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed')
  ) {
    return {
      title: defaultTitle,
      description:
        'Nätverket svarade inte i tid. Det brukar fungera om du väntar en sekund och försöker igen.',
    }
  }

  if (
    lower.includes('internal server error') ||
    lower.includes('bad gateway') ||
    lower.includes('gateway timeout') ||
    lower.includes('service unavailable') ||
    lower.includes('504') ||
    lower.includes('502') ||
    lower.includes('503')
  ) {
    return {
      title: defaultTitle,
      description: 'Servern svarade inte just nu. Försök igen om en liten stund.',
    }
  }

  if (
    lower.includes('club_schema_outdated') ||
    lower.includes('saknar tabeller') ||
    lower.includes('club-migrationerna')
  ) {
    return {
      title: defaultTitle,
      description:
        'Produktionsdatabasen saknar klubb-migrationer. Kör SQL-filerna i database/ på Neon production.',
    }
  }

  if (message.includes('redan upptagen')) {
    if (isLoad) {
      return {
        title: 'Kunde inte ladda dagen',
        description:
          'Dagen höll på att skapas i bakgrunden (ofta vid snabb växling mellan datum). Vänta en sekund och välj datumet igen.',
      }
    }
    return {
      title: 'Kunde inte spara',
      description: message,
    }
  }

  if (message.includes('Sessionen har gått ut')) {
    return {
      title: 'Inloggningen har gått ut',
      description: 'Logga in igen och försök på nytt.',
    }
  }

  if (!message || message === 'Ett fel uppstod') {
    return {
      title: defaultTitle,
      description: 'Något gick fel. Försök igen om en liten stund.',
    }
  }

  if (isLoad) {
    return {
      title: defaultTitle,
      description: 'Något gick fel vid laddning. Försök välja datumet igen.',
    }
  }

  return {
    title: defaultTitle,
    description: message,
  }
}
