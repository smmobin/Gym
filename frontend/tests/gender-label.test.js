import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { GENDER_LABEL, genderLabelFa } from '../assets/js/format.js'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('class gender label', () => {
  it('maps API values to Persian labels', () => {
    expect(genderLabelFa('mixed')).toBe('مختلط')
    expect(genderLabelFa('women')).toBe('بانوان')
    expect(genderLabelFa('men')).toBe('آقایان')
    expect(genderLabelFa(null)).toBe('—')
    expect(Object.keys(GENDER_LABEL)).toEqual(['mixed', 'women', 'men'])
  })

  it('classes form uses select options, not free-text input', () => {
    const src = readFileSync(path.join(here, '../assets/js/classes.js'), 'utf8')
    expect(src).toContain('name="gender_label"')
    expect(src).toContain('<select name="gender_label"')
    expect(src).not.toMatch(/name="gender_label"[^>]*>[\s\S]*?placeholder=/)
    expect(src).toContain('value="mixed">مختلط')
    expect(src).toContain('value="women">بانوان')
    expect(src).toContain('value="men">آقایان')
    expect(src).toContain('GymCustomSelect?.refresh')
  })
})
