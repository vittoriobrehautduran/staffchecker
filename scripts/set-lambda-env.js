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

// Environment variables for email functions
const emailEnvVars = {
  AWS_SES_REGION: process.env.AWS_SES_REGION || 'eu-north-1',
  AWS_SES_ACCESS_KEY_ID: process.env.AWS_SES_ACCESS_KEY_ID,
  AWS_SES_SECRET_ACCESS_KEY: process.env.AWS_SES_SECRET_ACCESS_KEY,
  BOSS_EMAIL_ADDRESS: process.env.BOSS_EMAIL_ADDRESS,
}

// Functions that need email env vars
const emailFunctions = ['submit-report', 'auto-submit-reports']

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
    
    // Remove undefined values
    Object.keys(newEnvVars).forEach(key => {
      if (newEnvVars[key] === undefined || newEnvVars[key] === '') {
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
    console.error(`❌ Error updating ${functionName}:`, error.message)
    throw error
  }
}

async function setAllFunctionEnvironments() {
  const functions = [
    `${PROJECT_NAME}-auth`,
    `${PROJECT_NAME}-auth-personnummer-login`,
    `${PROJECT_NAME}-auto-submit-reports`,
    `${PROJECT_NAME}-create-entry`,
    `${PROJECT_NAME}-delete-entry`,
    `${PROJECT_NAME}-get-entries`,
    `${PROJECT_NAME}-get-report`,
    `${PROJECT_NAME}-submit-report`,
    `${PROJECT_NAME}-update-entry`,
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
