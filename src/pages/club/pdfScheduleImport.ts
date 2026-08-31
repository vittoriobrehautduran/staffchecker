import * as pdfjs from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { ClubPayload, LessonSport } from './clubTypes'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export type PdfImportPlayer = {
  name: string
  customerNo?: string
  phone?: string
  birthYear?: number
}

export type PdfImportLesson = {
  tempId: string
  sport: LessonSport
  weekday: number
  startTime: string
  durationMinutes: number
  endTime: string
  venueRaw: string
  resourceNumber: number
  coachNames: string[]
  players: PdfImportPlayer[]
  included: boolean
  status: 'ready' | 'needs_review'
  warnings: string[]
  /** Set during enrich from club data */
  coachIds?: number[]
  resourceId?: number
}

export type PdfImportCoach = {
  tempId: string
  name: string
  phone?: string
  sport: LessonSport
  existingCoachId?: number
}

export type PdfImportPreview = {
  pagesProcessed: number
  linesParsed: number
  coaches: PdfImportCoach[]
  lessons: PdfImportLesson[]
  warnings: string[]
}

const DAY_MAP: Record<string, number> = {
  må: 1,
  ma: 1,
  måndag: 1,
  mandag: 1,
  ti: 2,
  tis: 2,
  tisdag: 2,
  on: 3,
  ons: 3,
  onsdag: 3,
  to: 4,
  tor: 4,
  torsdag: 4,
  fr: 5,
  fre: 5,
  fredag: 5,
  lö: 6,
  lo: 6,
  lör: 6,
  lor: 6,
  lördag: 6,
  sö: 7,
  so: 7,
  sön: 7,
  son: 7,
  söndag: 7,
  sondag: 7,
}

const DAY_TOKEN =
  '(Må|Måndag|Ma|Mandag|Ti|Tisdag|Tis|Ons?|On|Onsdag|To|Torsdag|Tor|Fr|Fredag|Fre|Lö|Lör|Lördag|Lo|Lordag|Sö|Sön|Söndag|So|Sondag)'

/** Placeholder coach when PDF has no trainer for a court/slot. */
export const UNKNOWN_COACH_NAME = 'unknown'

const COACH_HEADER_RE = /^TRÄNARE\s+\d+\s+(.+)$/i

// Kundnr, name, birth suffix, phone, day, time, venue
const DATA_ROW_RE =
  /^(\d{3,6})\s+(.+?)\s+(-\d{2})\s+(.+?)\s+(Må|Ma|Ti|Ons?|On|To|Tor|Fr|Lö|Lör|Lo|Sö|So)\s+(\d{1,2}:\d{2})\s+(Bana|Bord)\s*(\d+)\s*$/i

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function weekdayFromDayToken(token: string): number | undefined {
  const normalized = token.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  if (DAY_MAP[normalized]) return DAY_MAP[normalized]
  const two = normalized.slice(0, 2)
  if (DAY_MAP[two]) return DAY_MAP[two]
  const three = normalized.slice(0, 3)
  return DAY_MAP[three]
}

function looksLikeUnparsedDataRow(line: string): boolean {
  const trimmed = normalizeSpaces(line)
  return (
    trimmed.length >= 12 &&
    /\d{1,2}:\d{2}/.test(trimmed) &&
    /(Bana|Bord)\s*\d+/i.test(trimmed) &&
    /\d{3,}/.test(trimmed)
  )
}

function parseDataRowRelaxed(trimmed: string): ParsedRow | null {
  const tailRe = new RegExp(
    `\\s+${DAY_TOKEN}\\s+(\\d{1,2}:\\d{2})\\s+(Bana|Bord)\\s*(\\d+)\\s*$`,
    'i'
  )
  const tailMatch = trimmed.match(tailRe)
  if (!tailMatch) return null

  const weekday = weekdayFromDayToken(tailMatch[1])
  if (!weekday) return null

  const startTime = normalizeTime(tailMatch[2])
  const venueType = tailMatch[3].toLowerCase() === 'bord' ? 'bordtennis' : 'tennis'
  const resourceNumber = Number(tailMatch[4])
  const head = trimmed.slice(0, tailMatch.index).trim()

  const withBirth = head.match(/^(\d{3,6})\s+(.+?)\s+(-\d{2})\s+(.+)$/)
  if (withBirth) {
    return {
      customerNo: withBirth[1],
      playerName: normalizeSpaces(withBirth[2]),
      birthYear: parseBirthYear(withBirth[3]),
      phone: normalizeSpaces(withBirth[4]),
      weekday,
      startTime,
      sport: venueType as LessonSport,
      resourceNumber,
      venueRaw: `${tailMatch[3]} ${tailMatch[4]}`,
      coachName: null,
    }
  }

  const withPhone = head.match(/^(\d{3,6})\s+(.+?)\s+((?:\+46|0)[\d][\d\s-]{7,})$/)
  if (withPhone) {
    return {
      customerNo: withPhone[1],
      playerName: normalizeSpaces(withPhone[2]),
      phone: normalizeSpaces(withPhone[3]),
      weekday,
      startTime,
      sport: venueType as LessonSport,
      resourceNumber,
      venueRaw: `${tailMatch[3]} ${tailMatch[4]}`,
      coachName: null,
    }
  }

  const minimal = head.match(/^(\d{3,6})\s+(.+)$/)
  if (minimal) {
    return {
      customerNo: minimal[1],
      playerName: normalizeSpaces(minimal[2]),
      phone: '',
      weekday,
      startTime,
      sport: venueType as LessonSport,
      resourceNumber,
      venueRaw: `${tailMatch[3]} ${tailMatch[4]}`,
      coachName: null,
    }
  }

  return null
}

/** Swedish mobile/landline — used to spot PDF lines where only a number was parsed as coach name. */
export function looksLikeSwedishPhone(value: string): boolean {
  const trimmed = normalizeSpaces(value)
  if (!trimmed) return false

  const letters = trimmed.match(/[a-zA-ZåäöÅÄÖ]/g)?.length ?? 0
  if (letters >= 3) return false

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 13) return false

  const compact = trimmed.replace(/[\s-]/g, '')
  if (/^(\+46|0046|0)/.test(compact)) return true
  if (/^[\d\s+\-()]+$/.test(trimmed)) return true

  return false
}

export function looksLikePersonName(value: string): boolean {
  const trimmed = normalizeSpaces(value)
  if (trimmed.length < 2) return false
  if (looksLikeSwedishPhone(trimmed)) return false

  const letters = trimmed.match(/[a-zA-ZåäöÅÄÖ]/g)?.length ?? 0
  if (letters < 2) return false

  const withoutSpace = trimmed.replace(/\s/g, '')
  const digitChars = trimmed.replace(/\D/g, '').length
  if (digitChars > 0 && digitChars / withoutSpace.length > 0.45) return false

  return true
}

function splitCoachNameAndPhone(remainder: string): { name: string | null; phone?: string } {
  const trimmed = normalizeSpaces(remainder)
  if (!trimmed) return { name: null }

  const trailingPhone = trimmed.match(/^(.+?)\s+((?:\+46|0)[\d][\d\s-]{7,})$/)
  if (trailingPhone && looksLikePersonName(trailingPhone[1])) {
    return {
      name: normalizeSpaces(trailingPhone[1]),
      phone: normalizeSpaces(trailingPhone[2]),
    }
  }

  if (looksLikeSwedishPhone(trimmed)) {
    return { name: null, phone: trimmed }
  }

  if (looksLikePersonName(trimmed)) {
    return { name: trimmed }
  }

  return { name: null }
}

function parseCoachHeaderLine(line: string): { name: string | null; phone?: string } | null {
  const trimmed = normalizeSpaces(line)
  const match = trimmed.match(COACH_HEADER_RE)
  if (!match) return null
  return splitCoachNameAndPhone(match[1])
}

function normalizeTime(value: string) {
  const [h, m] = value.split(':')
  return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`
}

function parseBirthYear(suffix: string): number | undefined {
  const n = Number(suffix.replace('-', ''))
  if (Number.isNaN(n)) return undefined
  return n <= 30 ? 2000 + n : 1900 + n
}

function addMinutesToTime(startTime: string, minutes: number): string {
  const [h, m] = startTime.split(':').map(Number)
  const total = h * 60 + m + minutes
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

function groupTextItemsIntoLines(items: TextItem[], yTolerance = 4): string[] {
  const positioned = items
    .filter((item) => item.str.trim().length > 0)
    .map((item) => ({
      x: item.transform[4],
      y: item.transform[5],
      str: item.str,
    }))

  positioned.sort((a, b) => b.y - a.y || a.x - b.x)

  const lines: { y: number; parts: { x: number; str: string }[] }[] = []

  for (const part of positioned) {
    const existing = lines.find((line) => Math.abs(line.y - part.y) <= yTolerance)
    if (existing) {
      existing.parts.push({ x: part.x, str: part.str })
    } else {
      lines.push({ y: part.y, parts: [{ x: part.x, str: part.str }] })
    }
  }

  return lines.map((line) => {
    line.parts.sort((a, b) => a.x - b.x)
    let text = ''
    let lastX = -1
    for (const part of line.parts) {
      if (lastX >= 0 && part.x - lastX > 18) {
        text += '\t'
      } else if (text.length > 0) {
        text += ' '
      }
      text += part.str
      lastX = part.x + part.str.length * 4
    }
    return normalizeSpaces(text.replace(/\t+/g, ' '))
  })
}

async function extractLinesFromPdf(file: File): Promise<{ pages: number; lines: string[] }> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const allLines: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const items = content.items.filter((item): item is TextItem => 'str' in item)
    const pageLines = groupTextItemsIntoLines(items)
    allLines.push(...pageLines)
  }

  return { pages: pdf.numPages, lines: allLines }
}

function parseLine(
  line: string,
  currentCoach: { name: string; phone?: string } | null
): { type: 'coach'; name: string; phone?: string } | { type: 'row'; row: ParsedRow } | null {
  const trimmed = normalizeSpaces(line)
  if (!trimmed || trimmed.length < 8) return null

  const coachHeader = parseCoachHeaderLine(trimmed)
  if (coachHeader) {
    return {
      type: 'coach',
      name: coachHeader.name ?? '',
      phone: coachHeader.phone,
    }
  }

  const rowMatch = trimmed.match(DATA_ROW_RE)
  if (rowMatch) {
    const weekday = weekdayFromDayToken(rowMatch[5])
    if (!weekday) return null

    const venueType = rowMatch[7].toLowerCase() === 'bord' ? 'bordtennis' : 'tennis'
    return {
      type: 'row',
      row: {
        customerNo: rowMatch[1],
        playerName: normalizeSpaces(rowMatch[2]),
        birthYear: parseBirthYear(rowMatch[3]),
        phone: normalizeSpaces(rowMatch[4]),
        weekday,
        startTime: normalizeTime(rowMatch[6]),
        sport: venueType as LessonSport,
        resourceNumber: Number(rowMatch[8]),
        venueRaw: `${rowMatch[7]} ${rowMatch[8]}`,
        coachName: currentCoach?.name ?? null,
      },
    }
  }

  const relaxed = parseDataRowRelaxed(trimmed)
  if (relaxed) {
    return {
      type: 'row',
      row: {
        ...relaxed,
        coachName: currentCoach?.name ?? relaxed.coachName,
      },
    }
  }

  return null
}

type ParsedRow = {
  customerNo: string
  playerName: string
  birthYear?: number
  phone: string
  weekday: number
  startTime: string
  sport: LessonSport
  resourceNumber: number
  venueRaw: string
  coachName: string | null
}

function importPlayerKey(player: PdfImportPlayer): string {
  const customerNo = player.customerNo?.trim()
  if (customerNo) return `c:${customerNo}`
  return `n:${player.name.trim().toLowerCase()}`
}

function addUniqueCoachName(lesson: PdfImportLesson, coachName: string | null) {
  if (!coachName?.trim()) return
  const normalized = coachName.trim().toLowerCase().replace(/\s+/g, ' ')
  const alreadyListed = lesson.coachNames.some(
    (name) => name.trim().toLowerCase().replace(/\s+/g, ' ') === normalized
  )
  if (alreadyListed) return
  lesson.coachNames.push(coachName.trim())
}

function groupRowsIntoLessons(rows: ParsedRow[], durationMinutes: number): PdfImportLesson[] {
  const groups = new Map<string, PdfImportLesson>()

  for (const row of rows) {
    const key = `${row.sport}|${row.weekday}|${row.startTime}|${row.resourceNumber}`

    if (!groups.has(key)) {
      groups.set(key, {
        tempId: key,
        sport: row.sport,
        weekday: row.weekday,
        startTime: row.startTime,
        durationMinutes,
        endTime: addMinutesToTime(row.startTime, durationMinutes),
        venueRaw: row.venueRaw,
        resourceNumber: row.resourceNumber,
        coachNames: [],
        players: [],
        included: true,
        status: 'needs_review',
        warnings: [],
      })
    }

    const lesson = groups.get(key)!
    addUniqueCoachName(lesson, row.coachName)

    const player = {
      name: row.playerName,
      customerNo: row.customerNo,
      phone: row.phone,
      birthYear: row.birthYear,
    }
    const playerKey = importPlayerKey(player)
    const alreadyOnLesson = lesson.players.some(
      (existing) => importPlayerKey(existing) === playerKey
    )
    if (!alreadyOnLesson) {
      lesson.players.push(player)
    }
  }

  for (const lesson of groups.values()) {
    if (lesson.coachNames.length === 0) {
      lesson.warnings.push('Tränare saknas — välj i listan innan import')
    } else {
      lesson.status = 'ready'
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) =>
      a.weekday - b.weekday ||
      a.startTime.localeCompare(b.startTime) ||
      a.resourceNumber - b.resourceNumber
  )
}

function coachTempIdFromName(name: string): string {
  return `coach-${name.trim().toLowerCase().replace(/\s+/g, ' ')}`
}

function collectCoaches(lessons: PdfImportLesson[]): PdfImportCoach[] {
  const map = new Map<string, PdfImportCoach>()

  for (const lesson of lessons) {
    for (const coachName of lesson.coachNames) {
      const tempId = coachTempIdFromName(coachName)
      if (!map.has(tempId)) {
        map.set(tempId, {
          tempId,
          name: coachName,
          sport: lesson.sport,
        })
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'sv'))
}

function sanitizeInvalidCoachNames(
  lessons: PdfImportLesson[],
  warnings: string[]
): PdfImportLesson[] {
  let invalidCoachCount = 0

  const sanitized = lessons.map((lesson) => {
    const validNames = lesson.coachNames.filter(
      (name) => looksLikePersonName(name) || normalizeCoachName(name) === UNKNOWN_COACH_NAME
    )
    const strippedCount = lesson.coachNames.length - validNames.length

    if (strippedCount === 0) {
      return lesson
    }

    invalidCoachCount += 1
    return {
      ...lesson,
      coachNames: validNames,
      status: 'needs_review' as const,
      warnings: [
        ...lesson.warnings,
        'Minst en tränare såg ut som telefonnummer — kopplas till "unknown" vid import',
      ],
    }
  })

  if (invalidCoachCount > 0) {
    warnings.push(
      `${invalidCoachCount} lektion(er) hade ogiltigt tränarnamn (ofta telefonnummer) och är avmarkerade.`
    )
  }

  return sanitized
}

export async function parseSchedulePdf(
  file: File,
  defaultDurationMinutes: number
): Promise<PdfImportPreview> {
  const warnings: string[] = []
  const { pages, lines } = await extractLinesFromPdf(file)

  let currentCoach: { name: string; phone?: string } | null = null
  const rows: ParsedRow[] = []
  let linesParsed = 0
  let unparsedCandidates = 0

  for (const line of lines) {
    const parsed = parseLine(line, currentCoach)
    if (!parsed) {
      if (looksLikeUnparsedDataRow(line)) {
        unparsedCandidates += 1
      }
      continue
    }

    if (parsed.type === 'coach') {
      // PDF sometimes has only a phone on the coach line — keep the previous real coach.
      if (parsed.name && looksLikePersonName(parsed.name)) {
        currentCoach = { name: parsed.name, phone: parsed.phone }
      }
      continue
    }

    linesParsed += 1
    rows.push(parsed.row)
  }

  if (linesParsed === 0) {
    warnings.push('Inga lektionsrader hittades. Kontrollera att PDF:en är textbaserad (inte skannad bild).')
  } else if (unparsedCandidates > 0) {
    warnings.push(
      `${unparsedCandidates} rad(er) såg ut som lektioner men kunde inte tolkas helt — granska att alla lektioner finns i listan.`
    )
  }

  let lessons = groupRowsIntoLessons(rows, defaultDurationMinutes)
  lessons = sanitizeInvalidCoachNames(lessons, warnings)
  const orphanCount = lessons.filter((lesson) => lesson.coachNames.length === 0).length
  if (orphanCount > 0) {
    warnings.push(
      `${orphanCount} lektion(er) saknade tränare i PDF — kopplas automatiskt till "${UNKNOWN_COACH_NAME}".`
    )
  }

  return {
    pagesProcessed: pages,
    linesParsed,
    coaches: collectCoaches(lessons),
    lessons,
    warnings,
  }
}

function normalizeCoachName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function findUnknownCoachId(coaches: { id: number; name: string }[]): number | undefined {
  return coaches.find((coach) => normalizeCoachName(coach.name) === UNKNOWN_COACH_NAME)?.id
}

export function lessonNeedsCoach(lesson: PdfImportLesson): boolean {
  if (lesson.coachIds && lesson.coachIds.length > 0) return false
  if (lesson.coachNames.some((name) => normalizeCoachName(name) === UNKNOWN_COACH_NAME)) {
    return false
  }
  return lesson.coachNames.length === 0 || lesson.coachNames.every((name) => !looksLikePersonName(name))
}

export function buildUnknownCoachPatch(
  lesson: PdfImportLesson,
  coaches: { id: number; name: string }[]
): Partial<PdfImportLesson> {
  const unknownCoachId = findUnknownCoachId(coaches)
  const hasResource = !!lesson.resourceId

  return {
    coachNames: [UNKNOWN_COACH_NAME],
    coachIds: unknownCoachId ? [unknownCoachId] : undefined,
    status: hasResource ? 'ready' : 'needs_review',
  }
}

export function enrichPdfPreview(preview: PdfImportPreview, club: ClubPayload): PdfImportPreview {
  const coachByName = new Map<string, number>()
  for (const coach of club.coaches) {
    coachByName.set(normalizeCoachName(coach.name), coach.id)
  }

  const resourceKey = (sport: LessonSport, number: number) => `${sport}:${number}`
  const resourceByKey = new Map<string, number>()
  for (const resource of club.resources) {
    const sport = resource.resource_type === 'court' ? 'tennis' : 'bordtennis'
    resourceByKey.set(resourceKey(sport, resource.resource_number), resource.id)
  }

  const coaches = preview.coaches.map((coach) => ({
    ...coach,
    existingCoachId: coachByName.get(normalizeCoachName(coach.name)),
  }))

  let autoUnknownCount = 0

  const lessons = preview.lessons.map((lesson) => {
    const warnings = [...lesson.warnings]
    let status = lesson.status
    const coachIds: number[] = []
    const coachNames: string[] = []

    for (const rawName of lesson.coachNames) {
      const coachName = rawName.trim()
      if (!coachName) continue

      if (!looksLikePersonName(coachName)) {
        warnings.push(`Tränare "${coachName}" ser ut som telefonnummer — använder "unknown"`)
        continue
      }

      coachNames.push(coachName)
      const resolvedId = coachByName.get(normalizeCoachName(coachName))
      if (resolvedId) {
        if (!coachIds.includes(resolvedId)) {
          coachIds.push(resolvedId)
        }
      } else if (normalizeCoachName(coachName) !== UNKNOWN_COACH_NAME) {
        warnings.push(`Tränare "${coachName}" finns inte i klubben ännu`)
        status = 'needs_review'
      }
    }

    const resourceId = resourceByKey.get(resourceKey(lesson.sport, lesson.resourceNumber))
    if (!resourceId) {
      warnings.push(`${lesson.venueRaw} saknas under Inställningar`)
      status = 'needs_review'
    }

    if (lesson.players.length === 0) {
      warnings.push('Inga spelare i lektionen')
      status = 'needs_review'
    }

    let result: PdfImportLesson = {
      ...lesson,
      coachNames,
      coachIds: coachIds.length > 0 ? coachIds : undefined,
      resourceId,
      status,
      warnings,
      included: lesson.included,
    }

    if (lessonNeedsCoach(result)) {
      const unknownPatch = buildUnknownCoachPatch(result, club.coaches)
      result = { ...result, ...unknownPatch }
      autoUnknownCount += 1
    }

    const hasBlockingIssue = !result.resourceId || result.players.length === 0
    const usesUnknownCoach = result.coachNames.some(
      (name) => normalizeCoachName(name) === UNKNOWN_COACH_NAME
    )

    if (!hasBlockingIssue && usesUnknownCoach) {
      result.status = 'ready'
      if (result.included !== false) {
        result.included = true
      }
    } else if (!hasBlockingIssue && (result.coachIds?.length || result.coachNames.length > 0)) {
      if (result.coachIds?.length && result.resourceId) {
        result.status = 'ready'
      }
    }

    return result
  })

  const previewWarnings = [...preview.warnings]
  if (autoUnknownCount > 0) {
    previewWarnings.push(
      `${autoUnknownCount} lektion(er) fick tränaren "${UNKNOWN_COACH_NAME}" automatiskt.`
    )
  }

  return {
    ...preview,
    coaches,
    lessons,
    warnings: [...previewWarnings, ...lessons.flatMap((lesson) => lesson.warnings)].filter(
      (value, index, arr) => arr.indexOf(value) === index
    ),
  }
}

export function buildImportPayload(lessons: PdfImportLesson[]) {
  return lessons.map((lesson) => ({
    sport: lesson.sport,
    weekday: lesson.weekday,
    startTime: lesson.startTime,
    durationMinutes: lesson.durationMinutes,
    resourceId: lesson.resourceId,
    resourceNumber: lesson.resourceNumber,
    venueRaw: lesson.venueRaw,
    coachIds: lesson.coachIds ?? [],
    coachNames: lesson.coachNames,
    playerNames: lesson.players.map((player) => player.name),
  }))
}
