// AI review of a parsed PDF schedule preview (boss-only). Uses OpenAI Chat Completions.

export type ScheduleImportReviewVerdict = 'ok' | 'needs_review' | 'likely_broken'

export type ScheduleImportReviewLesson = {
  sport: string
  weekday: number
  startTime: string
  endTime: string
  venue: string
  coachName: string | null
  playerCount: number
  samplePlayers: string[]
  status: string
  warnings: string[]
  included: boolean
}

export type ScheduleImportReviewInput = {
  pagesProcessed: number
  linesParsed: number
  lessonCount: number
  coachCount: number
  includedCount: number
  previewWarnings: string[]
  lessons: ScheduleImportReviewLesson[]
}

export type ScheduleImportReviewResult = {
  verdict: ScheduleImportReviewVerdict
  summary: string
  issues: string[]
  suggestions: string[]
  model: string
}

const WEEKDAY_SV = ['', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag']

function buildUserPrompt(input: ScheduleImportReviewInput): string {
  const byWeekday: Record<number, number> = {}
  for (const lesson of input.lessons) {
    if (!lesson.included) continue
    byWeekday[lesson.weekday] = (byWeekday[lesson.weekday] || 0) + 1
  }

  const weekdaySummary = Object.entries(byWeekday)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([day, count]) => `${WEEKDAY_SV[Number(day)] || day}: ${count}`)
    .join(', ')

  // Cap size so we don't blow token limits on huge PDFs.
  const lessonLines = input.lessons
    .filter((lesson) => lesson.included)
    .slice(0, 80)
    .map((lesson) => {
      const day = WEEKDAY_SV[lesson.weekday] || String(lesson.weekday)
      const players =
        lesson.samplePlayers.length > 0
          ? ` spelare[${lesson.playerCount}]: ${lesson.samplePlayers.join(', ')}`
          : ` spelare: ${lesson.playerCount}`
      const warn = lesson.warnings.length ? ` ⚠ ${lesson.warnings.join('; ')}` : ''
      return `- ${lesson.sport} ${day} ${lesson.startTime}-${lesson.endTime} ${lesson.venue} / ${lesson.coachName || 'ingen tränare'}${players}${warn}`
    })

  return [
    `PDF-förhandsgranskning av tennisskole-schema (Sverige).`,
    `Sidor: ${input.pagesProcessed}, textrader: ${input.linesParsed}, lektioner totalt: ${input.lessonCount}, valda: ${input.includedCount}, tränare: ${input.coachCount}.`,
    `Valda per veckodag: ${weekdaySummary || 'inga'}.`,
    input.previewWarnings.length
      ? `Parser-varningar: ${input.previewWarnings.slice(0, 15).join(' | ')}`
      : 'Inga globala parser-varningar.',
    `Stickprov av valda lektioner (max 80):`,
    ...lessonLines,
    input.includedCount > 80 ? `(… ${input.includedCount - 80} lektioner till utelämnade)` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const SYSTEM_PROMPT = `Du granskar resultatet av en regelbaserad PDF-import av ett klubbschema (tennis/bordtennis).
Du ska INTE importera något. Bedöm bara om parse-resultatet ser rimligt ut.

Svara ENDAST med giltig JSON (ingen markdown) i detta format:
{
  "verdict": "ok" | "needs_review" | "likely_broken",
  "summary": "1-3 meningar på svenska",
  "issues": ["korta punkter på svenska"],
  "suggestions": ["korta punkter på svenska"]
}

Regler:
- ok = ser ut som ett komplett, rimligt veckoschema
- needs_review = troligen användbart men med tydliga luckor/varningar att kolla
- likely_broken = parse verkar misslyckad (nästan tomt, konstiga tider, massor saknas)
- Ignorera personuppgifter utöver att notera om namn/tränares ser felaktiga ut (t.ex. telefonnummer som tränare)
- Var konkret och kort`

function parseModelJson(raw: string): Omit<ScheduleImportReviewResult, 'model'> {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')

  const parsed = JSON.parse(cleaned) as {
    verdict?: string
    summary?: string
    issues?: unknown
    suggestions?: unknown
  }

  const verdictRaw = String(parsed.verdict || 'needs_review')
  const verdict: ScheduleImportReviewVerdict =
    verdictRaw === 'ok' || verdictRaw === 'likely_broken' ? verdictRaw : 'needs_review'

  return {
    verdict,
    summary: String(parsed.summary || 'Ingen sammanfattning från modellen.').trim(),
    issues: Array.isArray(parsed.issues)
      ? parsed.issues.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
      : [],
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
      : [],
  }
}

export async function reviewScheduleImportWithAi(
  input: ScheduleImportReviewInput
): Promise<ScheduleImportReviewResult> {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY saknas på Lambda. Lägg nyckeln i .env.local och kör set-lambda-env.'
    )
  }

  if (!input.lessons?.length && input.lessonCount === 0) {
    return {
      verdict: 'likely_broken',
      summary: 'Inga lektioner hittades i förhandsgranskningen.',
      issues: ['Parse-resultatet är tomt.'],
      suggestions: [
        'Kontrollera att PDF:en är textbaserad (inte bara inskannad bild).',
        'Prova att lägga till klasser manuellt i veckoschemat.',
      ],
      model: 'local-heuristic',
    }
  }

  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(
      `AI-granskning misslyckades (${response.status})${errText ? `: ${errText.slice(0, 200)}` : ''}`
    )
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Tomt svar från AI-modellen')
  }

  const parsed = parseModelJson(content)
  return { ...parsed, model }
}
