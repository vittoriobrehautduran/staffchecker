#!/usr/bin/env node

// Tail CloudWatch logs for Lambda functions
// Usage: node scripts/tail-logs.js [function-name]
// Example: node scripts/tail-logs.js get-report
// Example: node scripts/tail-logs.js auth
// 
// Uses AWS CLI if available, otherwise falls back to AWS SDK

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const PROJECT_NAME = 'timrapport'
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-north-1'

const functionName = process.argv[2]

if (!functionName) {
  console.error('Usage: node scripts/tail-logs.js <function-name>')
  console.error('Example: node scripts/tail-logs.js get-report')
  console.error('Example: node scripts/tail-logs.js auth')
  console.error('\nAvailable functions:')
  console.error('  - auth')
  console.error('  - get-report')
  console.error('  - get-entries')
  console.error('  - submit-report')
  console.error('  - create-entry')
  console.error('  - update-entry')
  console.error('  - delete-entry')
  process.exit(1)
}

const fullFunctionName = functionName.includes('-') ? functionName : `${PROJECT_NAME}-${functionName}`
const logGroupName = `/aws/lambda/${fullFunctionName}`

console.log(`📋 Tailing logs for: ${fullFunctionName}`)
console.log(`📋 Log group: ${logGroupName}`)
console.log(`📋 Region: ${REGION}`)
console.log('---\n')

// Try using AWS CLI first (simpler and faster)
async function tailWithAWSCLI() {
  try {
    const command = `aws logs tail ${logGroupName} --follow --region ${REGION}`
    console.log(`Running: ${command}\n`)
    
    const child = exec(command, {
      stdio: 'inherit'
    })
    
    child.on('error', (error) => {
      if (error.message.includes('aws: command not found')) {
        console.error('❌ AWS CLI not found. Installing AWS SDK fallback...')
        tailWithSDK()
      } else {
        console.error('Error:', error.message)
        process.exit(1)
      }
    })
    
    process.on('SIGINT', () => {
      child.kill()
      console.log('\n\n👋 Stopped tailing logs')
      process.exit(0)
    })
  } catch (error) {
    console.error('Error:', error.message)
    tailWithSDK()
  }
}

// Fallback to AWS SDK
async function tailWithSDK() {
  try {
    const { CloudWatchLogsClient, FilterLogEventsCommand } = await import('@aws-sdk/client-cloudwatch-logs')
    const client = new CloudWatchLogsClient({ region: REGION })

    let startTime = Date.now() - 60000 // Start from 1 minute ago
    let nextToken = undefined

    async function fetchLogs() {
      try {
        const command = new FilterLogEventsCommand({
          logGroupName,
          startTime,
          nextToken,
        })

        const response = await client.send(command)

        if (response.events && response.events.length > 0) {
          response.events.forEach(event => {
            if (event.message) {
              const timestamp = new Date(event.timestamp).toISOString()
              console.log(`[${timestamp}] ${event.message}`)
            }
          })
          
          const latestTimestamp = response.events[response.events.length - 1]?.timestamp
          if (latestTimestamp) {
            startTime = latestTimestamp + 1
          }
        }

        nextToken = response.nextToken
        setTimeout(fetchLogs, 2000)
      } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
          console.error(`❌ Log group not found: ${logGroupName}`)
          console.error('   Make sure the Lambda function exists and has been invoked at least once.')
        } else {
          console.error('Error fetching logs:', error.message)
        }
        setTimeout(fetchLogs, 5000)
      }
    }

    fetchLogs()

    process.on('SIGINT', () => {
      console.log('\n\n👋 Stopped tailing logs')
      process.exit(0)
    })
  } catch (error) {
    console.error('Failed to load AWS SDK:', error.message)
    console.error('\nPlease install AWS SDK: npm install --save-dev @aws-sdk/client-cloudwatch-logs')
    process.exit(1)
  }
}

// Start with AWS CLI
tailWithAWSCLI()

