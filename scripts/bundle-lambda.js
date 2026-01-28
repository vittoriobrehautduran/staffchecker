import { build } from 'esbuild'
import { readdirSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Create output directory
const outputDir = join(projectRoot, 'dist', 'lambda')
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true })
}

// Get all TypeScript files in lambda directory (excluding utils for now)
const lambdaDir = join(projectRoot, 'lambda')
const functions = readdirSync(lambdaDir)
  .filter(f => f.endsWith('.ts') && !f.includes('utils'))

console.log(`Bundling ${functions.length} Lambda functions...\n`)

for (const func of functions) {
  const entryPoint = join(lambdaDir, func)
  const outputFile = join(outputDir, func.replace('.ts', '.js'))
  
  console.log(`Bundling ${func}...`)
  
  try {
    await build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      outfile: outputFile,
      external: ['aws-sdk', '@aws-sdk/*'],
      sourcemap: false,
      minify: false,
      banner: {
        js: '// Bundled Lambda function - do not edit directly\n'
      },
      mainFields: ['main', 'module'],
      conditions: ['require', 'node'],
      legalComments: 'none'
    })
    
    // Post-process: Clean up and ensure proper CommonJS export
    let bundledCode = readFileSync(outputFile, 'utf8')
    
    // Remove dead-code export annotations that esbuild sometimes adds
    bundledCode = bundledCode.replace(/\/\/ Annotate the CommonJS export names for ESM import in node:\s*\n\s*0\s*&&\s*\(module\.exports\s*=\s*\{[^}]+\}\);?\s*/g, '')
    
    // Check if handler is defined
    const hasHandler = /(?:var|const|let)\s+handler\s*=/.test(bundledCode)
    
    // Check if handler is already exported via module.exports.handler
    const hasDirectExport = /module\.exports\.handler\s*=/.test(bundledCode)
    
    // Always ensure handler is exported at the end, even if esbuild exported it earlier
    // This guarantees it works with Lambda's handler format (filename.handler)
    if (hasHandler && !hasDirectExport) {
      bundledCode = bundledCode.trim()
      // Remove trailing semicolon if present, we'll add our export
      if (bundledCode.endsWith(';')) {
        bundledCode = bundledCode.slice(0, -1).trim()
      }
      bundledCode += '\n\n// Export handler for Lambda (filename.handler format)\n'
      bundledCode += 'module.exports.handler = handler;\n'
    }
    
    writeFileSync(outputFile, bundledCode, 'utf8')
    
    console.log(`✓ ${func} → ${outputFile.replace(projectRoot, '.')}\n`)
  } catch (error) {
    console.error(`✗ Error bundling ${func}:`, error.message)
    process.exit(1)
  }
}

console.log('✅ All Lambda functions bundled successfully!')
console.log(`\nOutput directory: ${outputDir.replace(projectRoot, '.')}`)
console.log('\nNext steps:')
console.log('1. Go to AWS Lambda Console')
console.log('2. For each function, upload the corresponding .js file from dist/lambda/')
console.log('3. Set handler to: filename.handler (e.g., submit-report.handler)')

