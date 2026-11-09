import { readFileSync } from 'node:fs'

const s = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8')
const ok =
  s.includes('NetworkOnly') && (s.includes('/api') || s.includes('pathname.startsWith'))
if (!ok) {
  console.error('SW missing NetworkOnly /api guards')
  process.exit(1)
}
console.log('SW ok: NetworkOnly + /api present')
