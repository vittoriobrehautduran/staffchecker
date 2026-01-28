import { LambdaClient, GetFunctionCommand, CreateFunctionCommand, UpdateFunctionCodeCommand } from '@aws-sdk/client-lambda'
import { readdirSync, readFileSync, existsSync, unlinkSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import archiver from 'archiver'
import { createWriteStream } from 'fs'
import { homedir } from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Configuration
const LAMBDA_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1'
const LAMBDA_RUNTIME = 'nodejs22.x'
const LAMBDA_ROLE = process.env.LAMBDA_ROLE_ARN || '' // You'll need to set this
const PROJECT_NAME = 'timrapport'
const TIMEOUT = 30 // seconds
const MEMORY_SIZE = 512 // MB

// AWS SDK automatically uses the default credential provider chain:
// 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
// 2. AWS credentials file (~/.aws/credentials)
// 3. IAM roles (if running on EC2/Lambda)
const lambdaClient = new LambdaClient({ region: LAMBDA_REGION })

// Get Lambda execution role from an existing function
async function getLambdaRoleFromExistingFunction() {
  // Try to get role from any existing function
  const existingFunctions = [
    `${PROJECT_NAME}-auth`,
    `${PROJECT_NAME}-submit-report`,
    `${PROJECT_NAME}-auth-personnummer-login`,
    `${PROJECT_NAME}-auto-submit-reports`
  ]
  
  for (const funcName of existingFunctions) {
    try {
      const response = await lambdaClient.send(new GetFunctionCommand({ FunctionName: funcName }))
      if (response.Configuration?.Role) {
        return response.Configuration.Role
      }
    } catch (error) {
      // Continue to next function
      continue
    }
  }
  return null
}

// Create a zip file from the Lambda function code
function createZipFile(functionCode, outputPath, jsFileName) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    
    output.on('close', () => {
      resolve(readFileSync(outputPath))
    })
    
    archive.on('error', (err) => {
      reject(err)
    })
    
    archive.pipe(output)
    archive.append(functionCode, { name: jsFileName })
    archive.finalize()
  })
}

// Check if function exists
async function functionExists(functionName) {
  try {
    await lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName }))
    return true
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return false
    }
    throw error
  }
}

// Deploy a single Lambda function
async function deployFunction(functionFile, functionName, lambdaRoleOverride = null) {
  const functionCode = readFileSync(functionFile)
  const handler = `${basename(functionFile, '.js')}.handler`
  
  console.log(`\n📦 Deploying ${functionName}...`)
  console.log(`   Handler: ${handler}`)
  
  const exists = await functionExists(functionName)
  
  if (exists) {
    // Update existing function
    console.log(`   ✓ Function exists, updating code...`)
    
    try {
      // Create temporary zip file
      const tempZipPath = join(projectRoot, 'dist', 'lambda', `${basename(functionFile, '.js')}.zip`)
      const jsFileName = basename(functionFile)
      const zipBuffer = await createZipFile(functionCode, tempZipPath, jsFileName)
      
      await lambdaClient.send(new UpdateFunctionCodeCommand({
        FunctionName: functionName,
        ZipFile: zipBuffer,
      }))
      
      // Clean up temp zip
      if (existsSync(tempZipPath)) {
        unlinkSync(tempZipPath)
      }
      
      console.log(`   ✅ Updated ${functionName}`)
    } catch (error) {
      console.error(`   ❌ Error updating ${functionName}:`, error.message)
      throw error
    }
  } else {
    // Create new function
    console.log(`   ✓ Function doesn't exist, creating...`)
    
    // Get Lambda role from parameter (passed from main function)
    const lambdaRole = lambdaRoleOverride || LAMBDA_ROLE
    
    if (!lambdaRole) {
      throw new Error('LAMBDA_ROLE_ARN environment variable is required to create new functions. Set it to your Lambda execution role ARN, or the script will try to get it from an existing function.')
    }
    
    try {
      // Create temporary zip file
      const tempZipPath = join(projectRoot, 'dist', 'lambda', `${basename(functionFile, '.js')}.zip`)
      const jsFileName = basename(functionFile)
      const zipBuffer = await createZipFile(functionCode, tempZipPath, jsFileName)
      
      await lambdaClient.send(new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: LAMBDA_RUNTIME,
        Role: lambdaRole,
        Handler: handler,
        Code: { ZipFile: zipBuffer },
        Description: `${PROJECT_NAME} - ${basename(functionFile, '.js')}`,
        Timeout: TIMEOUT,
        MemorySize: MEMORY_SIZE,
        Environment: {
          Variables: {
            // Add default env vars here if needed
            // Or read from a config file
          }
        },
        Tags: {
          Project: PROJECT_NAME,
          ManagedBy: 'deploy-script'
        }
      }))
      
      // Clean up temp zip
      if (existsSync(tempZipPath)) {
        unlinkSync(tempZipPath)
      }
      
      console.log(`   ✅ Created ${functionName}`)
    } catch (error) {
      console.error(`   ❌ Error creating ${functionName}:`, error.message)
      throw error
    }
  }
}

// Main deployment function
async function deployAllFunctions() {
  const lambdaDir = join(projectRoot, 'dist', 'lambda')
  
  // Try to get Lambda role from existing function if not set
  let lambdaRole = LAMBDA_ROLE
  if (!lambdaRole) {
    console.log('🔍 LAMBDA_ROLE_ARN not set, trying to get it from existing function...')
    const existingRole = await getLambdaRoleFromExistingFunction()
    if (existingRole) {
      lambdaRole = existingRole
      console.log(`✓ Found Lambda role: ${lambdaRole}\n`)
    } else {
      console.log('⚠️  Could not find existing Lambda role automatically.\n')
    }
  }
  
  if (!existsSync(lambdaDir)) {
    console.error('❌ dist/lambda directory not found. Run "npm run build:lambda" first.')
    process.exit(1)
  }
  
  const functions = readdirSync(lambdaDir)
    .filter(f => f.endsWith('.js') && !f.endsWith('.zip'))
  
  if (functions.length === 0) {
    console.error('❌ No Lambda functions found in dist/lambda/. Run "npm run build:lambda" first.')
    process.exit(1)
  }
  
  console.log(`\n🚀 Deploying ${functions.length} Lambda function(s) to ${LAMBDA_REGION}...\n`)
  
  const errors = []
  
  for (const func of functions) {
    const functionFile = join(lambdaDir, func)
    const functionName = `${PROJECT_NAME}-${basename(func, '.js')}`
    
    try {
      await deployFunction(functionFile, functionName, lambdaRole)
    } catch (error) {
      errors.push({ function: functionName, error: error.message })
    }
  }
  
  console.log('\n' + '='.repeat(50))
  
  if (errors.length === 0) {
    console.log('✅ All functions deployed successfully!')
  } else {
    console.log(`⚠️  Deployed ${functions.length - errors.length}/${functions.length} functions`)
    console.log('\nErrors:')
    errors.forEach(({ function: func, error }) => {
      console.log(`  ❌ ${func}: ${error}`)
    })
    process.exit(1)
  }
}

// Run deployment
deployAllFunctions().catch(error => {
  console.error('\n❌ Deployment failed:', error.message)
  process.exit(1)
})
