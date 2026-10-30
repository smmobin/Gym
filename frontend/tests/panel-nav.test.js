import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { applyNavIcons, NAV_ICON_BY_HASH, navIconSvg } from '../assets/js/nav-icons.js'
import { bindHashNav } from '../assets/js/ui.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readPanelHtml(name) {
  return readFileSync(join(root, name, 'index.html'), 'utf8')
}

describe('receptionist has no settings UI', () => {
  it('HTML has no settings nav or mount', () => {
    const html = readPanelHtml('receptionist')
    expect(html).not.toMatch(/href="#settings"/)
    expect(html).not.toMatch(/id="mount-settings"/)
    expect(html).not.toMatch(/data-section="settings"/)
  })

  it('receptionist panel module does not mount settings', async () => {
    const src = readFileSync(join(root, 'assets/js/panels/receptionist.js'), 'utf8')
    expect(src).not.toMatch(/mountSettings/)
    expect(src).not.toMatch(/settings:\s*\(/)
  })
})

describe('manager keeps settings', () => {
  it('HTML still exposes settings for manager', () => {
    const html = readPanelHtml('manager')
    expect(html).toMatch(/href="#settings"/)
    expect(html).toMatch(/id="mount-settings"/)
    expect(html).toMatch(/data-section="settings"/)
  })
})

describe('sidebar nav icons', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    history.replaceState(null, '', ' ')
  })

  it('navIconSvg and hash map cover core panel routes', () => {
    expect(navIconSvg('users')).toContain('nav-item-icon')
    expect(navIconSvg('users')).toContain('viewBox="0 0 24 24"')
    expect(NAV_ICON_BY_HASH.dash).toBe('gauge')
    expect(NAV_ICON_BY_HASH.settings).toBe('gear')
    expect(NAV_ICON_BY_HASH.notif).toBe('bell')
    expect(NAV_ICON_BY_HASH.lockers).toBe('lock')
  })

  it('applyNavIcons adds outline svg beside label on all four panel nav shapes', () => {
    document.body.innerHTML = `
      <aside class="sidebar">
        <nav class="nav">
          <a class="nav-item" href="#dash">داشبورد</a>
          <a class="nav-item" href="#members">اعضا</a>
          <a class="nav-item" href="#settings">تنظیمات</a>
          <a class="nav-item" href="#notif">اعلان‌ها</a>
        </nav>
      </aside>`
    applyNavIcons(document)
    const items = [...document.querySelectorAll('.nav-item')]
    expect(items).toHaveLength(4)
    items.forEach((a) => {
      expect(a.querySelector('svg.nav-item-icon')).toBeTruthy()
      expect(a.querySelector('.nav-item-label')?.textContent?.trim().length).toBeGreaterThan(0)
    })
    expect(document.querySelector('[href="#settings"] .nav-item-label')?.textContent).toContain('تنظیمات')
    applyNavIcons(document)
    expect(document.querySelectorAll('.nav-item-icon')).toHaveLength(4)
  })

  it('bindHashNav falls back when section missing (receptionist #settings)', () => {
    document.body.innerHTML = `
      <aside class="sidebar">
        <nav class="nav">
          <a class="nav-item" href="#dash">داشبورد</a>
          <a class="nav-item" href="#sms">پیامک</a>
        </nav>
      </aside>
      <div class="topbar-title"><h1>عنوان</h1></div>
      <div data-section="dash" data-title="داشبورد">dash</div>
      <div data-section="sms" data-title="پیامک" hidden>sms</div>`
    location.hash = '#settings'
    bindHashNav('dash')
    expect(location.hash).toBe('#dash')
    expect(document.querySelector('[data-section="dash"]')?.hidden).toBe(false)
    expect(document.querySelector('[data-section="sms"]')?.hidden).toBe(true)
    expect(document.querySelector('.topbar-title h1')?.textContent).toBe('داشبورد')
  })
})
