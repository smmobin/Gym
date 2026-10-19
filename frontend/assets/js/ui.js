/**
 * @param {HTMLElement | null} el
 * @param {string} text
 * @param {'ok' | 'error' | 'loading' | ''} [kind]
 */
export function setStatus(el, text, kind = '') {
  if (!el) return
  el.textContent = text || ''
  el.className = 'status-msg' + (kind ? ` ${kind}` : '')
  el.hidden = !text
}

/** @param {HTMLElement | null} el @param {boolean} on */
export function setBusy(el, on) {
  if (!el) return
  el.classList.toggle('busy-overlay', on)
  el.querySelectorAll('button, input, select, textarea').forEach((node) => {
    if (on) {
      if (!node.hasAttribute('data-was-disabled')) {
        node.setAttribute('data-was-disabled', node.disabled ? '1' : '0')
      }
      node.disabled = true
    } else {
      const was = node.getAttribute('data-was-disabled')
      if (was != null) {
        node.disabled = was === '1'
        node.removeAttribute('data-was-disabled')
      }
    }
  })
}

/** @param {string} id @param {boolean} show */
export function showView(id, show = true) {
  const el = document.getElementById(id)
  if (el) el.hidden = !show
}

/** Close mobile sidebar when nav clicked */
export function bindSidebarClose() {
  const toggle = document.getElementById('side-toggle')
  if (!toggle) return
  document.querySelectorAll('.sidebar .nav-item, .sidebar-foot a').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 1100px)').matches) {
        toggle.checked = false
      }
    })
  })
}

/**
 * Hash-based section navigation for panel pages.
 * @param {string} defaultHash
 */
export function bindHashNav(defaultHash = 'dash') {
  const items = [...document.querySelectorAll('.sidebar .nav-item[href^="#"]')]
  function activate() {
    const hash = (location.hash || `#${defaultHash}`).slice(1)
    items.forEach((a) => {
      const href = a.getAttribute('href') || ''
      a.classList.toggle('active', href === `#${hash}`)
    })
    document.querySelectorAll('[data-section]').forEach((sec) => {
      const id = sec.getAttribute('data-section')
      sec.hidden = id !== hash
    })
    const title = document.querySelector(`[data-section="${hash}"]`)?.getAttribute('data-title')
    const h1 = document.querySelector('.topbar-title h1')
    if (title && h1) h1.textContent = title
  }
  window.addEventListener('hashchange', activate)
  if (!location.hash) location.hash = `#${defaultHash}`
  activate()
}

/**
 * @param {HTMLElement} root
 * @param {Array<{id:number, label:string}>} items
 * @param {(id: number) => void} onPick
 */
export function renderMemberPick(root, items, onPick) {
  root.innerHTML = ''
  if (!items.length) {
    root.innerHTML = '<p class="hint">موردی یافت نشد.</p>'
    return
  }
  items.forEach((m) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = m.label
    btn.addEventListener('click', () => {
      root.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'))
      btn.classList.add('is-selected')
      onPick(m.id)
    })
    root.appendChild(btn)
  })
}

/** @param {HTMLElement | null} banner */
export function showApiDown(banner, down) {
  if (!banner) return
  banner.classList.toggle('is-visible', down)
  banner.hidden = !down
  if (down) {
    banner.textContent =
      'اتصال به API برقرار نیست. بک‌اند را روی پورت ۸۰۰۰ روشن کنید — تا آن زمان داده‌ها بارگذاری نمی‌شوند.'
  }
}
