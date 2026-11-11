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

  it('maskable icon is full-bleed opaque brand (no letterbox corners)', async () => {
    const sharp = (await import('sharp')).default
    const file = join(root, 'public/images/brand/pwa-maskable-512.png')
    const img = sharp(file)
    const { width, height } = await img.metadata()
    expect(width).toBe(512)
    expect(height).toBe(512)
    const { data } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const px = (x, y) => {
      const i = (y * width + x) * 4
      return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }
    }
    for (const sample of [px(0, 0), px(width - 1, 0), px(0, height - 1), px(width - 1, height - 1)]) {
      expect(sample.a).toBe(255)
      // Not white/black letterbox — ocean teal/blue corners.
      expect(sample.r + sample.g + sample.b).toBeGreaterThan(200)
      expect(sample.r).toBeLessThan(120)
      expect(sample.g).toBeGreaterThan(100)
    }
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
    expect(read('login/index.html')).not.toContain('pwa-install-hint')
  })

  it('pwa-register uses virtual:pwa-register (autoUpdate path)', () => {
    const src = read('assets/js/pwa-register.js')
    expect(src).toContain('virtual:pwa-register')
    expect(src).toContain('registerSW')
  })

  it('wires soft install prompt module from pwa-register', () => {
    const reg = read('assets/js/pwa-register.js')
    const install = read('assets/js/pwa-install.js')
    expect(reg).toContain("from './pwa-install.js'")
    expect(reg).toContain('initPwaInstallPrompt')
    expect(install).toContain('beforeinstallprompt')
    expect(install).toContain('pwa-install-banner')
    expect(read('assets/css/live.css')).toContain('.pwa-install-banner')
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
