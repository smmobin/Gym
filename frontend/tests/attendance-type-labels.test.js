import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('attendance type option copy', () => {
  it('includes short explanations next to سالن / کلاس / جلسه مربی', () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../assets/js/attendance.js'),
      'utf8',
    )
    expect(src).toMatch(/value="gym"[^>]*>سالن —/)
    expect(src).toMatch(/value="class"[^>]*>کلاس —/)
    expect(src).toMatch(/value="pt"[^>]*>جلسه مربی —/)
    expect(src).toContain('تمرین آزاد')
    expect(src).toContain('کلاس گروهی')
    expect(src).toContain('مصرف جدا')
  })
})
