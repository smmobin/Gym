import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  THEME_BOOT_SCRIPT,
  THEME_DARK,
  THEME_KEY,
  THEME_LIGHT,
  getTheme,
  initThemeToggle,
  setTheme,
  toggleTheme,
} from '../assets/js/theme.js'

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
    document.body.innerHTML = ''
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.body.innerHTML = ''
  })

  it('defaults to dark when storage is empty', () => {
    expect(getTheme()).toBe(THEME_DARK)
  })

  it('setTheme persists light and updates html', () => {
    setTheme(THEME_LIGHT)
    expect(localStorage.getItem(THEME_KEY)).toBe(THEME_LIGHT)
    expect(document.documentElement.getAttribute('data-theme')).toBe(THEME_LIGHT)
    expect(document.documentElement.style.colorScheme).toBe(THEME_LIGHT)
  })

  it('toggleTheme flips dark ↔ light', () => {
    setTheme(THEME_DARK)
    expect(toggleTheme()).toBe(THEME_LIGHT)
    expect(toggleTheme()).toBe(THEME_DARK)
  })

  it('reads stored light preference', () => {
    localStorage.setItem(THEME_KEY, THEME_LIGHT)
    expect(getTheme()).toBe(THEME_LIGHT)
  })

  it('initThemeToggle mounts switch and toggles on click', () => {
    document.body.innerHTML = `<div data-theme-mount></div>`
    initThemeToggle(document)
    const btn = document.querySelector('[data-theme-toggle]')
    expect(btn).toBeTruthy()
    expect(btn.getAttribute('role')).toBe('switch')
    expect(btn.getAttribute('aria-checked')).toBe('false')
    btn.click()
    expect(document.documentElement.getAttribute('data-theme')).toBe(THEME_LIGHT)
    expect(btn.getAttribute('aria-checked')).toBe('true')
    expect(btn.textContent).toContain('تم روشن')
  })

  it('syncThemeImages swaps data-src variants', () => {
    document.documentElement.setAttribute('data-theme', THEME_DARK)
    document.body.innerHTML = `<img data-src-dark="/images/a.jpg" data-src-light="/images/a-light.jpg" src="/images/a.jpg" />`
    const img = document.querySelector('img')
    setTheme(THEME_LIGHT)
    expect(img.getAttribute('src')).toBe('/images/a-light.jpg')
    setTheme(THEME_DARK)
    expect(img.getAttribute('src')).toBe('/images/a.jpg')
  })

  it('boot script string sets dark by default', () => {
    expect(THEME_BOOT_SCRIPT).toContain("localStorage.getItem('gym-theme')")
    expect(THEME_BOOT_SCRIPT).toContain("t='dark'")
    expect(THEME_BOOT_SCRIPT).not.toContain('prefers-color-scheme')
  })

  it('manager and landing markup host theme mount + boot', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const manager = readFileSync(resolve(__dirname, '../manager/index.html'), 'utf8')
    const landing = readFileSync(resolve(__dirname, '../index.html'), 'utf8')
    const login = readFileSync(resolve(__dirname, '../login/index.html'), 'utf8')
    for (const text of [manager, landing, login]) {
      expect(text).toContain('data-theme-mount')
      expect(text).toContain('gym-theme')
    }
  })
})
