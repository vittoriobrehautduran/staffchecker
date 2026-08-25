import { APIGatewayProxyEvent } from 'aws-lambda'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://staffcheck.spangatbk.se',
  'https://staging.d3jub8c52hgrc6.amplifyapp.com',
  'https://main.d3jub8c52hgrc6.amplifyapp.com',
]

export function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const requestOrigin = event.headers?.Origin || event.headers?.origin || '*'
  return ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0]
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
