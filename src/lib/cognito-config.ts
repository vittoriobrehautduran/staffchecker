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
      },
    },
  },
}

// Configure Amplify
Amplify.configure(cognitoConfig, {
  ssr: true,
})

export default cognitoConfig

