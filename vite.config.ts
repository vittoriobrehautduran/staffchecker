import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Local dev defaults to staging API (Neon staging via staging Lambdas).
  // Set VITE_USE_PROD_API=true in .env.local to hit production API instead.
  const useProdApiLocally = env.VITE_USE_PROD_API === 'true'
  const stagingApiUrl = env.VITE_API_BASE_URL_STAGING?.trim()
  const apiBaseUrl =
    mode === 'development' && !useProdApiLocally && stagingApiUrl
      ? stagingApiUrl
      : env.VITE_API_BASE_URL?.trim()

  const define: Record<string, string> = {}
  if (apiBaseUrl) {
    define['import.meta.env.VITE_API_BASE_URL'] = JSON.stringify(apiBaseUrl)
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define,
  }
})
