import { APIGatewayProxyEvent } from 'aws-lambda'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://staffcheck.spangatbk.se',
  'https://staging.d3jub8c52hgrc6.amplifyapp.com',
  'https://main.d3jub8c52hgrc6.amplifyapp.com',
]

// Amplify also serves PR/preview URLs on the same app id.
const AMPLIFY_APP_ORIGIN = /^https:\/\/[a-z0-9-]+\.d3jub8c52hgrc6\.amplifyapp\.com$/i

export function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.Origin || event.headers?.origin || ''
  if (
    requestOrigin &&
    (ALLOWED_ORIGINS.includes(requestOrigin) || AMPLIFY_APP_ORIGIN.test(requestOrigin))
  ) {
    return requestOrigin
  }
  return ALLOWED_ORIGINS[0]
}

export function corsJsonHeaders(origin: string, methods = 'GET, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Auth-Token',
  }
}
