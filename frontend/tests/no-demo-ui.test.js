import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('public UI has no demo seed accounts', () => {
  it('login page has no demo-accounts or seed credentials', () => {
    const html = read('login/index.html')
    expect(html).not.toContain('demo-accounts')
    expect(html).not.toContain('demo-table')
    expect(html).not.toContain('ChangeMe123')
    expect(html).not.toContain('09120000001')
    expect(html).not.toContain('09120000002')
    expect(html).not.toContain('09120000003')
    expect(html).not.toContain('09121111001')
    expect(html).toContain('data-login-wizard')
    expect(html).toContain('data-mobile-form')
    expect(html).toContain('login-card-head')
    // Step 1 is mobile-only (password lives in a later hidden auth step).
    expect(html).toMatch(/data-step="mobile"[\s\S]*?data-mobile-form[\s\S]*?<\/form>/)
    const mobileForm = html.match(
      /data-step="mobile"[\s\S]*?data-mobile-form[\s\S]*?<\/form>/,
    )?.[0]
    expect(mobileForm).toBeTruthy()
    expect(mobileForm).not.toContain('password')
    expect(mobileForm).toContain('name="mobile"')
    expect(mobileForm).toContain('login-field-label')

  })

  it('landing has no #roles login block and dual CTAs in header', () => {
    const html = read('index.html')
    expect(html).not.toMatch(/id=["']roles["']/)
    expect(html).not.toContain('حساب‌های دمو')
    expect(html).not.toContain('ChangeMe123')
    expect(html).not.toContain('09120000001')
    expect(html).toContain('nav-cta-pair')
    expect(html).toMatch(/href=["']\/login\/["']/)
    expect(html).toContain('aria-label="ورود به سامانه"')
    expect(html).toContain('aria-label="رزرو جلسه آزمایشی"')
  })
})
