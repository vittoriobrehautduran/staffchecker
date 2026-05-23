/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** Staging API URL; used by vite.config in development unless VITE_USE_PROD_API=true */
  readonly VITE_API_BASE_URL_STAGING?: string
  readonly VITE_USE_PROD_API?: string
  /** API path segment for report submit, e.g. submit-report-staging (Amplify staging only). */
  readonly VITE_REPORT_SUBMIT_PATH?: string
  readonly VITE_AWS_REGION?: string
  readonly VITE_COGNITO_USER_POOL_ID?: string
  readonly VITE_COGNITO_CLIENT_ID?: string
  readonly VITE_COGNITO_DOMAIN?: string
  readonly VITE_OAUTH_REDIRECT_SIGN_IN?: string
  readonly VITE_OAUTH_REDIRECT_SIGN_OUT?: string
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

