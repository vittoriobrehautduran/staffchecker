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
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || process.env.VITE_API_BASE_URL?.replace('/.netlify/functions', '') || '',
}

// Environment variables for email functions (SES for reports)
const emailEnvVars = {
  AWS_SES_REGION: process.env.AWS_SES_REGION || 'eu-north-1',
  AWS_SES_ACCESS_KEY_ID: process.env.AWS_SES_ACCESS_KEY_ID,
  AWS_SES_SECRET_ACCESS_KEY: process.env.AWS_SES_SECRET_ACCESS_KEY,
  BOSS_EMAIL_ADDRESS: process.env.BOSS_EMAIL_ADDRESS,
}

// Environment variables for auth function (SES for email verification)
// Note: AWS_REGION is reserved by Lambda, so we use SES_REGION instead
const authEmailEnvVars = {
  SES_FROM_EMAIL: process.env.SES_FROM_EMAIL || process.env.AWS_SES_FROM_EMAIL,
  SES_REGION: process.env.SES_REGION || process.env.AWS_SES_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1',
}

// Functions that need email env vars for reports
const emailFunctions = ['submit-report', 'auto-submit-reports']

// Functions that need SES for email verification
const authFunctions = ['auth']

async function setFunctionEnvironment(functionName) {
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
    
    // Add email vars if needed
    const functionBaseName = functionName.replace(`${PROJECT_NAME}-`, '')
    if (emailFunctions.includes(functionBaseName)) {
      Object.assign(newEnvVars, emailEnvVars)
    }
    
    // Add SES vars for auth function (email verification)
    if (authFunctions.includes(functionBaseName)) {
      Object.assign(newEnvVars, authEmailEnvVars)
      // Log what we're trying to set for debugging
      console.log(`  Setting SES vars for ${functionName}:`, {
        SES_FROM_EMAIL: authEmailEnvVars.SES_FROM_EMAIL ? 'SET' : 'NOT SET',
        SES_REGION: authEmailEnvVars.SES_REGION,
      })
    }
    
    // Remove undefined values (but keep empty strings for SES_REGION default)
    Object.keys(newEnvVars).forEach(key => {
      if (newEnvVars[key] === undefined) {
        delete newEnvVars[key]
      }
      // Keep SES_REGION even if it's the default value
      if (key === 'SES_REGION' && newEnvVars[key] === '') {
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
    
    // Show what was set for auth function
    if (authFunctions.includes(functionBaseName)) {
      const sesVars = Object.keys(newEnvVars).filter(key => key.includes('SES'))
      console.log(`✅ Updated environment variables for ${functionName}`)
      if (sesVars.length > 0) {
        console.log(`   SES variables: ${sesVars.join(', ')}`)
      } else {
        console.log(`   ⚠️  No SES variables found - make sure SES_FROM_EMAIL is set in .env.local`)
      }
    } else {
      console.log(`✅ Updated environment variables for ${functionName}`)
    }
  } catch (error) {
    console.error(`❌ Error updating ${functionName}:`, error.message)
    throw error
  }
}

async function setAllFunctionEnvironments() {
  const functions = [
    `${PROJECT_NAME}-auth`,
    `${PROJECT_NAME}-auth-personnummer-login`,
    `${PROJECT_NAME}-auto-submit-reports`,
    `${PROJECT_NAME}-cleanup-unverified-users`,
    `${PROJECT_NAME}-create-entry`,
    `${PROJECT_NAME}-create-user-better-auth`,
    `${PROJECT_NAME}-delete-entry`,
    `${PROJECT_NAME}-delete-unverified-user`,
    `${PROJECT_NAME}-get-entries`,
    `${PROJECT_NAME}-get-report`,
    `${PROJECT_NAME}-submit-report`,
    `${PROJECT_NAME}-update-entry`,
    `${PROJECT_NAME}-webauthn-register-start`,
    `${PROJECT_NAME}-webauthn-register-complete`,
    `${PROJECT_NAME}-webauthn-login-start`,
    `${PROJECT_NAME}-webauthn-login-complete`,
  ]
  
  console.log(`\n🔧 Setting environment variables for ${functions.length} Lambda functions...\n`)
  
  // Check required env vars
  if (!commonEnvVars.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env.local')
    process.exit(1)
  }
  
  if (!commonEnvVars.BETTER_AUTH_SECRET) {
    console.error('❌ BETTER_AUTH_SECRET not found in .env.local')
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
    console.log('\n⚠️  Note: Make sure to set BETTER_AUTH_URL after creating API Gateway')
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
