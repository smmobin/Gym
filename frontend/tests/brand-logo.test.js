import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

const markPath = '/images/brand/logo-mark.svg'
const pages = [
  'index.html',
  'login/index.html',
  'manager/index.html',
  'receptionist/index.html',
  'trainer/index.html',
  'athlete/index.html',
]

describe('GYM CONTROL brand logo assets', () => {
  it('ships mark SVG/PNG and favicon under public/', () => {
    expect(existsSync(join(root, 'public/images/brand/logo-mark.svg'))).toBe(true)
    expect(existsSync(join(root, 'public/images/brand/logo-mark.png'))).toBe(true)
    expect(existsSync(join(root, 'public/images/brand/apple-touch-icon.png'))).toBe(true)
    expect(existsSync(join(root, 'public/favicon.svg'))).toBe(true)
    expect(existsSync(join(root, 'public/favicon.png'))).toBe(true)

    const svg = read('public/images/brand/logo-mark.svg')
    expect(svg).toContain('viewBox="0 0 256 256"')
    expect(svg).toMatch(/#3EC7C2|#1F8FBF/i)
    expect(svg.toLowerCase()).not.toContain('863bff')
  })

  it('wires logo mark into landing, login, and all role panels', () => {
    for (const page of pages) {
      const html = read(page)
      expect(html, page).toContain(markPath)
      expect(html, page).toContain('rel="icon"')
      expect(html, page).toContain('/favicon.svg')
    }
    expect(read('login/index.html')).toContain('login-brand-mark')
  })
})
