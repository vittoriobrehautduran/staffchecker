import * as Sentry from '@sentry/aws-serverless'
import type { APIGatewayProxyResult, Handler } from 'aws-lambda'

let initialized = false

function ensureInit() {
  if (initialized || !process.env.SENTRY_DSN) return

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment:
      process.env.SENTRY_ENVIRONMENT ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      'lambda',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
  })

  initialized = true
}

function captureReturnedServerError(result: unknown) {
  if (!result || typeof result !== 'object' || !('statusCode' in result)) return

  const statusCode = Number((result as APIGatewayProxyResult).statusCode)
  if (!Number.isFinite(statusCode) || statusCode < 500) return

  const body = (result as APIGatewayProxyResult).body
  Sentry.captureMessage(`Lambda returned HTTP ${statusCode}`, {
    level: 'error',
    extra: {
      body: typeof body === 'string' ? body.slice(0, 2_000) : body,
    },
  })
}

// Wrap Lambda handlers so uncaught errors and 500 responses reach Sentry.
export function wrapLambdaHandler<T extends Handler>(handler: T): T {
  ensureInit()
  if (!process.env.SENTRY_DSN) return handler

  const monitoredHandler: Handler = async (event, context, callback) => {
    const result = await handler(event, context, callback)
    captureReturnedServerError(result)
    return result
  }

  return Sentry.wrapHandler(monitoredHandler) as T
}
