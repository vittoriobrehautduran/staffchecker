import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { initSentry, isSentryEnabled, Sentry } from '@/lib/sentry'
import '@/lib/cognito-config'
import './index.css'
import App from './App.tsx'

initSentry()

function SentryFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="text-lg font-semibold">Något gick fel</h1>
        <p className="text-sm text-muted-foreground">
          Ett oväntat fel inträffade. Ladda om sidan och försök igen.
        </p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Ladda om
        </button>
      </div>
    </div>
  )
}

const app = (
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)

createRoot(document.getElementById('root')!).render(
  isSentryEnabled() ? (
    <Sentry.ErrorBoundary fallback={<SentryFallback />}>{app}</Sentry.ErrorBoundary>
  ) : (
    app
  )
)
