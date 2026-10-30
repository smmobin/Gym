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

  function extractSidebar(html) {
    const match = html.match(/<aside class="sidebar">[\s\S]*?<\/aside>/)
    expect(match).toBeTruthy()
    return match[0]
  }

  function assertEveryNavItemHasIcon() {
    const items = [...document.querySelectorAll('.sidebar .nav-item[href^="#"]')]
    expect(items.length).toBeGreaterThan(0)
    items.forEach((a) => {
      const hash = (a.getAttribute('href') || '').slice(1)
      expect(NAV_ICON_BY_HASH[hash], `missing icon map for #${hash}`).toBeTruthy()
      expect(a.querySelector('svg.nav-item-icon')).toBeTruthy()
      expect(a.querySelector('.nav-item-label')?.textContent?.trim().length).toBeGreaterThan(0)
    })
  }

  it('navIconSvg and hash map cover core panel routes', () => {
    expect(navIconSvg('users')).toContain('nav-item-icon')
    expect(navIconSvg('users')).toContain('viewBox="0 0 24 24"')
    expect(NAV_ICON_BY_HASH.dash).toBe('gauge')
    expect(NAV_ICON_BY_HASH.settings).toBe('gear')
    expect(NAV_ICON_BY_HASH.notif).toBe('bell')
    expect(NAV_ICON_BY_HASH.lockers).toBe('lock')
    expect(NAV_ICON_BY_HASH.trainees).toBe('user')
    expect(NAV_ICON_BY_HASH.plan).toBe('dumbbell')
  })

  it('shell (desk+trainer) and athlete panels wire applyNavIcons', () => {
    const shell = readFileSync(join(root, 'assets/js/panels/shell.js'), 'utf8')
    const athlete = readFileSync(join(root, 'assets/js/panels/athlete.js'), 'utf8')
    const trainer = readFileSync(join(root, 'assets/js/panels/trainer.js'), 'utf8')
    expect(shell).toMatch(/applyNavIcons/)
    expect(athlete).toMatch(/applyNavIcons/)
    expect(trainer).toMatch(/initStaffShell/)
  })

  it.each(['receptionist', 'manager', 'trainer', 'athlete'])(
    '%s sidebar gets an outline icon on every nav-item',
    (panel) => {
      document.body.innerHTML = extractSidebar(readPanelHtml(panel))
      applyNavIcons(document)
      assertEveryNavItemHasIcon()
      const before = document.querySelectorAll('.nav-item-icon').length
      applyNavIcons(document)
      expect(document.querySelectorAll('.nav-item-icon')).toHaveLength(before)
    },
  )

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
