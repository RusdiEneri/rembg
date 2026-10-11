const fs = require('fs')
const path = require('path')

const demoDataFile = path.join(__dirname, '..', 'src', 'lib', 'demo-data.js')
const content = fs.readFileSync(demoDataFile, 'utf8')

const beforeMatch = content.match(/DEMO_BEFORE_IMAGE\s*=\s*['"]data:image\/png;base64,([^'"]+)['"]/)
const afterMatch = content.match(/DEMO_AFTER_IMAGE\s*=\s*['"]data:image\/png;base64,([^'"]+)['"]/)

if (!beforeMatch || !afterMatch) {
  console.error('[write-samples] Failed to extract base64 data URLs from demo-data.js')
  process.exit(1)
}

const samplesDir = path.join(__dirname, '..', 'public', 'samples')
fs.mkdirSync(samplesDir, { recursive: true })

const beforeBuf = Buffer.from(beforeMatch[1], 'base64')
const afterBuf = Buffer.from(afterMatch[1], 'base64')

fs.writeFileSync(path.join(samplesDir, 'background-removal-before.png'), beforeBuf)
fs.writeFileSync(path.join(samplesDir, 'background-removal-after.png'), afterBuf)

console.log(`[write-samples] Wrote real binary PNG samples: before (${beforeBuf.length} B), after (${afterBuf.length} B)`)
