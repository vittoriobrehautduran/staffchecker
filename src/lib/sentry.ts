import * as Sentry from '@sentry/react'
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom'
import { useEffect } from 'react'

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()

function resolveEnvironment(): string {
  const configured = import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim()
  if (configured) return configured
  if (import.meta.env.DEV) return 'development'
  return import.meta.env.MODE || 'production'
}

export function initSentry() {
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: resolveEnvironment(),
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: Number(import.meta.env.VITE_SENTRY_REPLAY_SAMPLE_RATE ?? '1'),
    sendDefaultPii: false,
  })
}

export function isSentryEnabled(): boolean {
  return Boolean(dsn)
}

export function captureException(
  error: unknown,
  context?: {
    tags?: Record<string, string>
    extra?: Record<string, unknown>
  }
) {
  if (!dsn) return
  Sentry.captureException(error, context)
}

export function setSentryUser(user: { id: string; email?: string } | null) {
  if (!dsn) return
  Sentry.setUser(user)
}

export { Sentry }
