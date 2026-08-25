import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { getAdminUserIdFromRequest } from './utils/cognito-auth'
import { corsJsonHeaders, getCorsOrigin } from './utils/cors'
import {
  CLEANUP_CONFIRM_PHRASE,
  getClubCleanupPreview,
  runClubCleanup,
} from './utils/club-cleanup'

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = getCorsOrigin(event)

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsJsonHeaders(origin, 'POST, OPTIONS'),
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsJsonHeaders(origin, 'POST, OPTIONS'),
      body: JSON.stringify({ message: 'Method not allowed' }),
    }
  }

  try {
    const adminUserId = await getAdminUserIdFromRequest(event)
    if (!adminUserId) {
      return {
        statusCode: 403,
        headers: corsJsonHeaders(origin, 'POST, OPTIONS'),
        body: JSON.stringify({ message: 'Admin access required' }),
      }
    }

    const body = JSON.parse(event.body || '{}') as {
      operation?: string
      clubSlug?: string
      retentionDays?: number
      confirmPhrase?: string
    }

    const operation = String(body.operation || 'preview').trim()
    const clubSlug = String(body.clubSlug || 'spanga').trim().toLowerCase()
    const retentionDays =
      body.retentionDays != null ? Number(body.retentionDays) : undefined

    if (operation === 'preview') {
      const preview = await getClubCleanupPreview(clubSlug, retentionDays)
      return {
        statusCode: 200,
        headers: corsJsonHeaders(origin, 'POST, OPTIONS'),
        body: JSON.stringify(preview),
      }
    }

    if (operation === 'execute') {
      const confirmPhrase = String(body.confirmPhrase || '').trim().toUpperCase()
      if (confirmPhrase !== CLEANUP_CONFIRM_PHRASE) {
        return {
          statusCode: 400,
          headers: corsJsonHeaders(origin, 'POST, OPTIONS'),
          body: JSON.stringify({
            message: `Skriv exakt "${CLEANUP_CONFIRM_PHRASE}" för att bekräfta`,
          }),
        }
      }

      const result = await runClubCleanup(clubSlug, retentionDays)
      return {
        statusCode: 200,
        headers: corsJsonHeaders(origin, 'POST, OPTIONS'),
        body: JSON.stringify({
          message: 'Rensning klar',
          deleted: result,
        }),
      }
    }

    return {
      statusCode: 400,
      headers: corsJsonHeaders(origin, 'POST, OPTIONS'),
      body: JSON.stringify({ message: 'operation must be preview or execute' }),
    }
  } catch (error: unknown) {
    const err = error as { message?: string }
    console.error('admin-club-cleanup error:', error)
    return {
      statusCode: 500,
      headers: corsJsonHeaders(origin, 'POST, OPTIONS'),
      body: JSON.stringify({
        message: err?.message || 'Internal server error',
      }),
    }
  }
}
