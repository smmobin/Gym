import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const js = (rel) => readFileSync(path.join(here, rel), 'utf8')

/** Count/log success toasts after list load — must stay gone (A1–A8). */
const FORBIDDEN = [
  { file: '../assets/js/members.js', re: /setStatus\([^,]+,\s*`\$\{[^}]+\} عضو`/ },
  { file: '../assets/js/staff.js', re: /setStatus\([^,]+,\s*`\$\{[^}]+\} نفر`/ },
  { file: '../assets/js/plans.js', re: /setStatus\([^,]+,\s*`\$\{[^}]+\} طرح`/ },
  { file: '../assets/js/lockers.js', re: /setStatus\([^,]+,\s*`\$\{[^}]+\} کمد`,\s*'ok'\)/ },
  { file: '../assets/js/desk-dashboard.js', re: /خلاصهٔ امروز به‌روز شد/ },
  { file: '../assets/js/panels/trainer.js', re: /setStatus\([^,]+,\s*`\$\{[^}]+\} شاگرد`/ },
  { file: '../assets/js/trial.js', re: /setStatus\([^,]+,\s*`\$\{[^}]+\} درخواست`/ },
  { file: '../assets/js/settings.js', re: /بارگذاری شد\./ },
]

describe('quiet list/load status (no floating count toasts)', () => {
  it.each(FORBIDDEN)('A-code: $file has no load-success count/log toast', ({ file, re }) => {
    expect(js(file)).not.toMatch(re)
  })

  it('manual load clears status without ok count (classes pattern still holds)', () => {
    const classes = js('../assets/js/classes.js')
    expect(classes).toContain("if (!silent) setStatus(status, '')")
    expect(classes).not.toMatch(/setStatus\([^,]+,\s*`\$\{[^}]+\} کلاس`/)
  })
})
