// Tách mockup (bundle hai tầng) thành các file HTML đọc được.
// Dùng: node scripts/extract-mockup.mjs "<file mockup>.html" <thư mục đích>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'

const [src, outDir] = process.argv.slice(2)
if (!src || !outDir) {
  console.error('Usage: node scripts/extract-mockup.mjs <mockup.html> <outDir>')
  process.exit(1)
}

// Dùng indexOf thay regex: regex không khớp được trên khối script hàng MB.
function scriptBlock(html, type) {
  const open = html.indexOf(`<script type="${type}"`)
  if (open < 0) return null
  const start = html.indexOf('>', open) + 1
  const end = html.indexOf('</script>', start)
  return end < 0 ? null : html.slice(start, end)
}

function decodeEntry(entry) {
  const buf = Buffer.from(entry.data, 'base64')
  return (entry.compressed ? gunzipSync(buf) : buf).toString('utf8')
}

// Bỏ ký tự không hợp lệ trong tên file Windows.
function safeName(title) {
  return title
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const root = readFileSync(src, 'utf8')
const manifestText = scriptBlock(root, '__bundler/manifest')
if (!manifestText) {
  console.error('Không tìm thấy __bundler/manifest trong file gốc')
  process.exit(1)
}
const manifest = JSON.parse(manifestText)
mkdirSync(outDir, { recursive: true })

const used = new Set()
let count = 0
for (const [uuid, entry] of Object.entries(manifest)) {
  if (entry.mime !== 'text/html') continue
  const inner = decodeEntry(entry)
  const tplText = scriptBlock(inner, '__bundler/template')
  if (!tplText) {
    console.warn(`Bỏ qua ${uuid}: không có __bundler/template`)
    continue
  }
  const template = JSON.parse(tplText)
  const title = template.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? uuid
  let name = safeName(title) || uuid
  while (used.has(name.toLowerCase())) name += `-${uuid.slice(0, 4)}`
  used.add(name.toLowerCase())
  writeFileSync(join(outDir, `${name}.html`), template)
  console.log(name)
  count++
}
console.log(`Đã ghi ${count} file vào ${outDir}`)
