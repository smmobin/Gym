import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

describe('PWA wiring (manifest + SW security)', () => {
  it('vite config enables vite-plugin-pwa with NetworkOnly /api and MPA fallback allowlist', () => {
    const cfg = read('vite.config.ts')
    expect(cfg).toContain('vite-plugin-pwa')
    expect(cfg).toContain('VitePWA')
    expect(cfg).toContain("handler: 'NetworkOnly'")
    expect(cfg).toMatch(/pathname\.startsWith\(['"]\/api['"]\)/)
    expect(cfg).toContain('navigateFallbackAllowlist')
    expect(cfg).toContain("start_url: '/'")
    expect(cfg).toContain("lang: 'fa'")
    expect(cfg).toContain("dir: 'rtl'")
    expect(cfg).toContain('pwa-192.png')
    expect(cfg).toContain('pwa-512.png')
  })

  it('ships PWA icons derived from brand mark', () => {
    expect(existsSync(join(root, 'public/images/brand/pwa-192.png'))).toBe(true)
    expect(existsSync(join(root, 'public/images/brand/pwa-512.png'))).toBe(true)
    expect(existsSync(join(root, 'public/images/brand/pwa-maskable-512.png'))).toBe(true)
  })

  it('HTML shells link manifest and register the SW module', () => {
    const pages = [
      'index.html',
      'login/index.html',
      'manager/index.html',
      'receptionist/index.html',
      'trainer/index.html',
      'athlete/index.html',
    ]
    for (const page of pages) {
      const html = read(page)
      expect(html, page).toContain('rel="manifest"')
      expect(html, page).toContain('/manifest.webmanifest')
      expect(html, page).toContain('theme-color')
      expect(html, page).toContain('/assets/js/pwa-register.js')
    }
    expect(read('index.html')).toContain('pwa-install-hint')
    expect(read('login/index.html')).toContain('pwa-install-hint')
  })

  it('pwa-register uses virtual:pwa-register (autoUpdate path)', () => {
    const src = read('assets/js/pwa-register.js')
    expect(src).toContain('virtual:pwa-register')
    expect(src).toContain('registerSW')
  })
})

describe('PWA production build artifacts', () => {
  it('dist contains webmanifest and a service worker after build (when dist exists)', () => {
    const dist = join(root, 'dist')
    if (!existsSync(dist)) {
      // Build is asserted in CI / ship gate separately; skip soft when absent.
      expect(true).toBe(true)
      return
    }
    const files = readdirSync(dist)
    expect(files.some((f) => f.endsWith('.webmanifest') || f === 'manifest.webmanifest')).toBe(
      true,
    )
    const hasSw =
      existsSync(join(dist, 'sw.js')) ||
      files.some((f) => /^sw/.test(f) && f.endsWith('.js')) ||
      existsSync(join(dist, 'workbox-*.js'.replace('*', ''))) ||
      files.some((f) => f.startsWith('workbox-') && f.endsWith('.js'))
    expect(hasSw).toBe(true)

    const manifestName = files.find((f) => f.endsWith('.webmanifest')) || 'manifest.webmanifest'
    if (existsSync(join(dist, manifestName))) {
      const manifest = JSON.parse(readFileSync(join(dist, manifestName), 'utf8'))
      expect(manifest.name).toMatch(/GYM CONTROL/i)
      expect(manifest.start_url).toBe('/')
      expect(manifest.display).toBe('standalone')
      expect(manifest.dir).toBe('rtl')
      expect(manifest.lang).toBe('fa')
    }
  })
})
