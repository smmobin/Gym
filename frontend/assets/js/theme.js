/** Client-only theme preference (no server sync). Default always dark. */

export const THEME_KEY = 'gym-theme'
export const THEME_DARK = 'dark'
export const THEME_LIGHT = 'light'

/** @returns {'dark' | 'light'} */
export function getTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw === THEME_LIGHT || raw === THEME_DARK) return raw
  } catch {
    /* private mode / blocked storage */
  }
  return THEME_DARK
}

/**
 * @param {'dark' | 'light'} theme
 * @param {{ persist?: boolean }} [opts]
 */
export function setTheme(theme, opts = {}) {
  const next = theme === THEME_LIGHT ? THEME_LIGHT : THEME_DARK
  const root = document.documentElement
  root.setAttribute('data-theme', next)
  root.style.colorScheme = next
  if (opts.persist !== false) {
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* ignore */
    }
  }
  syncThemeImages(document)
  syncThemeToggles(document)
  return next
}

/** @returns {'dark' | 'light'} */
export function toggleTheme() {
  return setTheme(getTheme() === THEME_LIGHT ? THEME_DARK : THEME_LIGHT)
}

/** Markup for a shared theme switch control. */
export function themeToggleMarkup() {
  return `<button type="button" class="theme-switch" role="switch" aria-checked="false" aria-label="تم تاریک" data-theme-toggle>
  <span class="theme-switch-track" aria-hidden="true">
    <span class="theme-switch-icon theme-switch-moon">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z"/></svg>
    </span>
    <span class="theme-switch-icon theme-switch-sun">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
    </span>
    <span class="theme-switch-thumb"></span>
  </span>
  <span class="theme-switch-label" data-theme-label>تم تاریک</span>
</button>`
}

/**
 * Swap landing images that declare data-src-dark / data-src-light.
 * @param {ParentNode} [scope]
 */
export function syncThemeImages(scope = document) {
  const theme = document.documentElement.getAttribute('data-theme') === THEME_LIGHT ? THEME_LIGHT : THEME_DARK
  scope.querySelectorAll('[data-src-dark][data-src-light]').forEach((node) => {
    if (!(node instanceof HTMLImageElement)) return
    const next = theme === THEME_LIGHT ? node.dataset.srcLight : node.dataset.srcDark
    if (next && node.getAttribute('src') !== next) node.setAttribute('src', next)
  })
}

/**
 * @param {ParentNode} [scope]
 */
export function syncThemeToggles(scope = document) {
  const theme = document.documentElement.getAttribute('data-theme') === THEME_LIGHT ? THEME_LIGHT : THEME_DARK
  const isLight = theme === THEME_LIGHT
  scope.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return
    btn.setAttribute('aria-checked', isLight ? 'true' : 'false')
    btn.setAttribute('aria-label', isLight ? 'تم روشن' : 'تم تاریک')
    btn.classList.toggle('is-light', isLight)
    const label = btn.querySelector('[data-theme-label]')
    if (label) label.textContent = isLight ? 'تم روشن' : 'تم تاریک'
  })
}

/**
 * Ensure stored theme is on <html>, wire click handlers, sync images/labels.
 * Empty `[data-theme-mount]` hosts get the shared switch markup.
 * @param {ParentNode} [scope]
 */
export function initThemeToggle(scope = document) {
  // Prefer attribute already set by boot script; fall back to storage / default dark.
  const current = document.documentElement.getAttribute('data-theme')
  if (current !== THEME_LIGHT && current !== THEME_DARK) {
    setTheme(getTheme(), { persist: false })
  } else {
    setTheme(current, { persist: false })
  }

  scope.querySelectorAll('[data-theme-mount]').forEach((host) => {
    if (!(host instanceof HTMLElement)) return
    if (!host.querySelector('[data-theme-toggle]')) {
      host.innerHTML = themeToggleMarkup()
    }
  })

  scope.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    if (!(btn instanceof HTMLElement) || btn.dataset.themeBound === '1') return
    btn.dataset.themeBound = '1'
    btn.addEventListener('click', () => {
      toggleTheme()
    })
  })

  syncThemeToggles(scope)
  syncThemeImages(scope)
}

/** Tiny boot snippet for `<head>` (also exported for tests). */
export const THEME_BOOT_SCRIPT =
  "(function(){try{var t=localStorage.getItem('gym-theme');if(t!=='light'&&t!=='dark')t='dark';document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute('data-theme','dark');document.documentElement.style.colorScheme='dark';}})();"
