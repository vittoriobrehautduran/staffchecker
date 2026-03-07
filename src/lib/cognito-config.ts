/// <reference types="vite/client" />
import { Amplify } from 'aws-amplify'

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
          domain: import.meta.env.VITE_COGNITO_DOMAIN || '',
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: [
            import.meta.env.VITE_OAUTH_REDIRECT_SIGN_IN || 'http://localhost:5173',
            'https://main.d3jub8c52hgrc6.amplifyapp.com',
          ],
          redirectSignOut: [
            import.meta.env.VITE_OAUTH_REDIRECT_SIGN_OUT || 'http://localhost:5173',
            'https://main.d3jub8c52hgrc6.amplifyapp.com',
          ],
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

