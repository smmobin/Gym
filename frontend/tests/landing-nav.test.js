import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('landing site-nav layout', () => {
  it('keeps brand, section links, and desktop CTA pair in header', () => {
    const html = read('index.html')
    const header = html.match(/<header class="site-nav">[\s\S]*?<\/header>/)?.[0] || ''
    expect(header).toContain('class="site-brand"')
    expect(header).toContain('class="site-links"')
    expect(header).toContain('nav-cta-desktop')
    expect(header).toContain('nav-cta-pair')
    for (const label of ['رشته‌ها', 'عضویت', 'کلاس‌ها', 'مربیان', 'فضا']) {
      expect(header).toContain(label)
    }
    expect(header).toContain('ورود به سامانه')
    expect(header).toContain('جلسه آزمایشی')
  })

  it('groups links beside brand and pushes actions with margin-inline-start auto', () => {
    const css = read('assets/css/ocean.css')
    expect(css).toMatch(/\.landing-page\s+\.site-nav\s*\{[^}]*justify-content:\s*flex-start/s)
    expect(css).toMatch(/\.site-links\s*\{[^}]*justify-content:\s*flex-start/s)
    expect(css).toMatch(/\.site-links\s*\{[^}]*flex-wrap:\s*nowrap/s)
    expect(css).toMatch(/\.nav-cta-pair\s*\{[^}]*margin-inline-start:\s*auto/s)
    expect(css).toMatch(/\.nav-cta-pair\s*\{[^}]*border-inline-start:/s)
    expect(css).toMatch(/\.site-links\s*>\s*a:not\(\.btn\)\s*\{[^}]*border-radius:\s*999px/s)
  })
})
