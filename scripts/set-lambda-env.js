/**
 * Pushar miljövariabler från .env.local till listade Lambdas.
 * - timrapport-submit-report (prod): BOSS_EMAIL_ADDRESS ändras aldrig härifrån (behåll värdet i AWS).
 * - timrapport-submit-report-staging: BOSS från BOSS_EMAIL_ADDRESS_STAGING eller BOSS_EMAIL_ADDRESS.
 * - Saknad Lambda: varning + hoppa över (deploya funktionen först).
 */
import { LambdaClient, UpdateFunctionConfigurationCommand, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Parse .env.local file manually
function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {}
  }
  
  const content = readFileSync(filePath, 'utf8')
  const env = {}
  
  content.split('\n').forEach(line => {
    line = line.trim()
    // Skip comments and empty lines
    if (!line || line.startsWith('#')) {
      return
    }
    
    // Handle export statements
    if (line.startsWith('export ')) {
      line = line.replace(/^export\s+/, '')
    }
    
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      let value = match[2].trim()
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      
      env[key] = value
    }
  })
  
  return env
}

// Load environment variables from .env.local
const envPath = join(projectRoot, '.env.local')
const envVars = parseEnvFile(envPath)

// Set environment variables from parsed file
Object.keys(envVars).forEach(key => {
  if (!process.env[key]) {
    process.env[key] = envVars[key]
  }
})

const LAMBDA_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1'
const PROJECT_NAME = 'timrapport'

const lambdaClient = new LambdaClient({ region: LAMBDA_REGION })

// Environment variables needed for all functions
const commonEnvVars = {
  DATABASE_URL: process.env.DATABASE_URL,
  COGNITO_REGION: process.env.COGNITO_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1',
  COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
  COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
}

// SES + keys shared by all report-email Lambdas (from .env.local)
const emailEnvVarsSesOnly = {
  SES_REGION: process.env.SES_REGION || 'eu-north-1',
  AWS_SES_ACCESS_KEY_ID: process.env.AWS_SES_ACCESS_KEY_ID,
  AWS_SES_SECRET_ACCESS_KEY: process.env.AWS_SES_SECRET_ACCESS_KEY,
}

// Environment variables for registration functions
const registrationEnvVars = {
  FRONTEND_URL: process.env.FRONTEND_URL,
  REGISTRATION_SECRET: process.env.REGISTRATION_SECRET,
}

// Functions that need email env vars for reports
const emailFunctions = ['submit-report', 'submit-report-staging']

// Functions that need registration env vars
const registrationFunctions = ['register-start']

async function setFunctionEnvironment(functionName) {
  const functionBaseName = functionName.replace(`${PROJECT_NAME}-`, '')

  try {
    // Get current configuration
    const currentConfig = await lambdaClient.send(
      new GetFunctionConfigurationCommand({ FunctionName: functionName })
    )

    const currentEnvVars = currentConfig.Environment?.Variables || {}

    // Merge with new env vars
    const newEnvVars = {
      ...currentEnvVars,
      ...commonEnvVars,
    }

    // Email-capable Lambdas: always refresh SES fields from .env.local
    if (emailFunctions.includes(functionBaseName)) {
      Object.assign(newEnvVars, emailEnvVarsSesOnly)

      if (functionBaseName === 'submit-report') {
        // Production report: never overwrite BOSS_EMAIL_ADDRESS from this script (set once in AWS Console).
        if (currentEnvVars.BOSS_EMAIL_ADDRESS !== undefined) {
          newEnvVars.BOSS_EMAIL_ADDRESS = currentEnvVars.BOSS_EMAIL_ADDRESS
        }
      } else if (functionBaseName === 'submit-report-staging') {
        const stagingBoss =
          process.env.BOSS_EMAIL_ADDRESS_STAGING || process.env.BOSS_EMAIL_ADDRESS
        if (stagingBoss) {
          newEnvVars.BOSS_EMAIL_ADDRESS = stagingBoss
        }
      }
    }

    // Add registration vars if needed
    if (registrationFunctions.includes(functionBaseName)) {
      Object.assign(newEnvVars, registrationEnvVars)
    }

    // Remove undefined values
    Object.keys(newEnvVars).forEach(key => {
      if (newEnvVars[key] === undefined) {
        delete newEnvVars[key]
      }
    })

    // Update function configuration
    await lambdaClient.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: functionName,
        Environment: {
          Variables: newEnvVars,
        },
      })
    )

    console.log(`✅ Updated environment variables for ${functionName}`)
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.warn(`⏭️  Skip ${functionName} (Lambda finns inte — kör deploy:lambda först)`)
      return
    }
    console.error(`❌ Error updating ${functionName}:`, error.message)
    throw error
  }
}

async function setAllFunctionEnvironments() {
  const functions = [
    `${PROJECT_NAME}-create-entry`,
    `${PROJECT_NAME}-delete-entry`,
    `${PROJECT_NAME}-get-entries`,
    `${PROJECT_NAME}-get-report`,
    `${PROJECT_NAME}-get-user-info`,
    `${PROJECT_NAME}-update-user-preferences`,
    `${PROJECT_NAME}-cognito-pre-signup`,
    `${PROJECT_NAME}-register-start`,
    `${PROJECT_NAME}-revert-report`,
    `${PROJECT_NAME}-submit-report`,
    `${PROJECT_NAME}-submit-report-staging`,
    `${PROJECT_NAME}-update-entry`,
    `${PROJECT_NAME}-validate-registration-token`,
  ]
  
  console.log(`\n🔧 Setting environment variables for ${functions.length} Lambda functions...\n`)
  
  // Check required env vars
  if (!commonEnvVars.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env.local')
    process.exit(1)
  }
  
  if (!commonEnvVars.COGNITO_USER_POOL_ID) {
    console.error('❌ COGNITO_USER_POOL_ID not found in .env.local')
    process.exit(1)
  }
  
  if (!commonEnvVars.COGNITO_CLIENT_ID) {
    console.error('❌ COGNITO_CLIENT_ID not found in .env.local')
    process.exit(1)
  }
  
  const errors = []
  
  for (const func of functions) {
    try {
      await setFunctionEnvironment(func)
    } catch (error) {
      errors.push({ function: func, error: error.message })
    }
  }
  
  console.log('\n' + '='.repeat(50))
  
  if (errors.length === 0) {
    console.log('✅ All environment variables set successfully!')
    console.log('\n📝 Cognito variables set:')
    console.log(`   COGNITO_REGION: ${commonEnvVars.COGNITO_REGION}`)
    console.log(`   COGNITO_USER_POOL_ID: ${commonEnvVars.COGNITO_USER_POOL_ID}`)
    console.log(`   COGNITO_CLIENT_ID: ${commonEnvVars.COGNITO_CLIENT_ID}`)
  } else {
    console.log(`⚠️  Set ${functions.length - errors.length}/${functions.length} functions`)
    errors.forEach(({ function: func, error }) => {
      console.log(`  ❌ ${func}: ${error}`)
    })
  }
}

setAllFunctionEnvironments().catch(error => {
  console.error('\n❌ Failed:', error.message)
  process.exit(1)
})
