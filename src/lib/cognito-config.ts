/// <reference types="vite/client" />
import { Amplify } from 'aws-amplify'

const getCurrentOrigin = (): string => {
  const maybeWindow = (globalThis as { window?: { location?: { origin?: string } } }).window
  if (maybeWindow?.location?.origin) {
    return maybeWindow.location.origin
  }
  return ''
}

const buildRedirectUrls = (envUrl: string | undefined): string[] => {
  const urls = [
    getCurrentOrigin(),
    envUrl || '',
    'https://staffcheck.spangatbk.se',
    'https://staging.d3jub8c52hgrc6.amplifyapp.com',
    'http://localhost:5173',
  ].filter(Boolean)

  // Keep order stable but remove duplicates so Cognito/Amplify uses the active origin first.
  return [...new Set(urls)]
}

// Cognito configuration
const cognitoConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
      region: import.meta.env.VITE_AWS_REGION || 'eu-north-1',
      loginWith: {
        email: true,
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN?.replace(/^https?:\/\//, '') || '',
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: buildRedirectUrls(import.meta.env.VITE_OAUTH_REDIRECT_SIGN_IN),
          redirectSignOut: buildRedirectUrls(import.meta.env.VITE_OAUTH_REDIRECT_SIGN_OUT),
          responseType: 'code' as const,
        },
      },
    },
  },
}

// Configure Amplify
Amplify.configure(cognitoConfig, {
  ssr: true,
})

export default cognitoConfig

