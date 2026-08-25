import type { PdfImportPreview } from './pdfScheduleImport'

export type AiScheduleReviewResult = {
  verdict: 'ok' | 'needs_review' | 'likely_broken'
  summary: string
  issues: string[]
  suggestions: string[]
  model: string
}

// Compact payload for AI check — no phones/customer numbers.
export function buildAiReviewPayload(preview: PdfImportPreview) {
  const included = preview.lessons.filter((lesson) => lesson.included)

  return {
    pagesProcessed: preview.pagesProcessed,
    linesParsed: preview.linesParsed,
    lessonCount: preview.lessons.length,
    coachCount: preview.coaches.length,
    includedCount: included.length,
    previewWarnings: preview.warnings.slice(0, 20),
    lessons: preview.lessons.slice(0, 120).map((lesson) => ({
      sport: lesson.sport,
      weekday: lesson.weekday,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      venue: lesson.venueRaw,
      coachName: lesson.coachName,
      playerCount: lesson.players.length,
      samplePlayers: lesson.players.slice(0, 3).map((player) => player.name),
      status: lesson.status,
      warnings: lesson.warnings.slice(0, 5),
      included: lesson.included,
    })),
  }
}
