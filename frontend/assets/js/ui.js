import { ROLE_LABEL } from './format.js'

const TOAST_MS = {
  ok: 4200,
  error: 6500,
  loading: 0,
  '': 4200,
}

/**
 * @returns {HTMLElement}
 */
function ensureToastHost() {
  let host = document.getElementById('gym-toast-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'gym-toast-host'
    host.className = 'gym-toast-host'
    host.setAttribute('aria-live', 'polite')
    host.setAttribute('aria-relevant', 'additions text')
    document.body.appendChild(host)
  }
  return host
}

/**
 * @param {HTMLElement} el
 * @param {boolean} [animate]
 */
function dismissToast(el, animate = true) {
  if (!el || !el.isConnected || el.dataset.leaving === '1') return
  const timer = /** @type {any} */ (el)._toastTimer
  if (timer) clearTimeout(timer)
  if (!animate) {
    el.remove()
    return
  }
  el.dataset.leaving = '1'
  el.classList.remove('is-in')
  el.classList.add('is-out')
  window.setTimeout(() => el.remove(), 320)
}

function clearLoadingToasts() {
  const host = document.getElementById('gym-toast-host')
  if (!host) return
  host.querySelectorAll('.gym-toast.loading').forEach((node) => {
    if (node instanceof HTMLElement) dismissToast(node, false)
  })
}

/**
 * Floating toast (top-right). Used site-wide via setStatus.
 * @param {string} text
 * @param {'ok' | 'error' | 'loading' | ''} [kind]
 * @returns {HTMLElement | null}
 */
export function showToast(text, kind = 'ok') {
  if (!text || typeof document === 'undefined') return null
  const type = kind || 'ok'
  // Replace prior loading spinner toast whenever a new message arrives.
  clearLoadingToasts()

  const host = ensureToastHost()
  const el = document.createElement('div')
  el.className = `gym-toast ${type}`
  el.setAttribute('role', type === 'error' ? 'alert' : 'status')

  const msg = document.createElement('p')
  msg.className = 'gym-toast-text'
  msg.textContent = text

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'gym-toast-close'
  close.setAttribute('aria-label', 'بستن اعلان')
  close.textContent = '×'
  close.addEventListener('click', () => dismissToast(el))

  el.append(msg, close)
  host.appendChild(el)
  requestAnimationFrame(() => {
    el.classList.add('is-in')
  })

  const ms = TOAST_MS[type] ?? TOAST_MS.ok
  if (ms > 0) {
    /** @type {any} */ (el)._toastTimer = window.setTimeout(() => dismissToast(el), ms)
  }
  return el
}

/**
 * Site-wide status → floating toast (inline status-msg stays hidden).
 * @param {HTMLElement | null} el
 * @param {string} text
 * @param {'ok' | 'error' | 'loading' | ''} [kind]
 */
export function setStatus(el, text, kind = '') {
  if (el) {
    el.hidden = true
    el.textContent = ''
    el.className = 'status-msg'
  }
  if (!text) {
    clearLoadingToasts()
    return
  }
  showToast(text, kind || 'ok')
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
 * @param {any} m
 */
export function memberPickLabel(m) {
  const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.label || '—'
  return name
}

/**
 * Floating member picker rows: name, id, mobile, role, active subscription.
 * @param {HTMLElement} root
 * @param {Array<any>} items
 * @param {(id: number) => void} onPick
 * @param {{ showLockerEligibility?: boolean }} [opts]
 */
export function renderMemberPick(root, items, onPick, opts = {}) {
  root.innerHTML = ''
  root.classList.add('member-pick', 'is-overlay')
  if (!items.length) {
    root.innerHTML = '<p class="hint member-pick-empty">موردی یافت نشد.</p>'
    return
  }
  const list = document.createElement('div')
  list.className = 'member-pick-list'
  const showLocker = !!opts.showLockerEligibility
  items.forEach((m) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'member-pick-item'
    const name = memberPickLabel(m)
    const roleKey = m.role || 'athlete'
    const roleText = ROLE_LABEL[roleKey] || roleKey
    const hasSub = !!m.has_active_membership
    const subClass = hasSub ? 'ok' : 'warn'
    const subText = hasSub ? 'اشتراک فعال' : 'بدون اشتراک فعال'
    const canLocker = !!m.can_receive_locker
    const lockerBadge = showLocker
      ? `<span class="badge ${canLocker ? 'ok' : 'warn'}">${
          canLocker ? 'می‌تواند کمد بگیرد' : 'نمی‌تواند کمد بگیرد'
        }</span>`
      : ''
    const meta = [m.display_id, m.mobile].filter(Boolean).join(' · ')
    btn.innerHTML = `
      <span class="member-pick-main">
        <strong class="member-pick-name">${escapeHtml(name)}</strong>
        <span class="member-pick-sub hint">${escapeHtml(meta || '—')}</span>
      </span>
      <span class="member-pick-meta">
        <span class="badge">${escapeHtml(roleText)}</span>
        <span class="badge ${subClass}">${subText}</span>
        ${lockerBadge}
      </span>
    `
    btn.addEventListener('mousedown', (event) => {
      // Keep input focused long enough for click to register before blur-close.
      event.preventDefault()
    })
    btn.addEventListener('click', () => {
      root.querySelectorAll('.member-pick-item').forEach((b) => b.classList.remove('is-selected'))
      btn.classList.add('is-selected')
      onPick(m.id)
    })
    list.appendChild(btn)
  })
  root.appendChild(list)
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
