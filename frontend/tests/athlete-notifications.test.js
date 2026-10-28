import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = readFileSync(path.join(here, '../assets/js/panels/athlete.js'), 'utf8')

describe('athlete notifications refresh', () => {
  it('reloads notifications after renew and when opening #notif', () => {
    expect(src).toContain('reloadAthleteNotifications')
    expect(src).toContain("location.hash.slice(1) === 'notif'")
    expect(src).toMatch(/renewal-requests[\s\S]*reloadAthleteNotifications/)
    // Mark-as-read should refresh the list, not force a full page reload.
    expect(src).toMatch(
      /notifications\/\$\{[^}]+\}\/read`\)[\s\S]*?reloadAthleteNotifications/,
    )
  })
})
