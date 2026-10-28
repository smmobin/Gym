import { apiGet, apiPost } from './api.js'
import { formatDateTime } from './format.js'

/**
 * Mount staff notification bell into a container.
 * @param {HTMLElement} root
 */
export function mountNotificationBell(root) {
  root.innerHTML = `
    <div class="notif-bell">
      <button type="button" class="icon-btn" data-bell aria-label="اعلان‌ها">🔔</button>
      <span class="badge count" data-count hidden>0</span>
      <div class="notif-panel" data-panel hidden>
        <div class="notif-panel-head">
          <p class="hint" data-empty hidden>اعلانی نیست.</p>
          <button type="button" class="btn ghost small" data-read-all>همه خوانده شد</button>
        </div>
        <div data-list></div>
      </div>
    </div>
  `
  const bell = root.querySelector('[data-bell]')
  const countEl = root.querySelector('[data-count]')
  const panel = root.querySelector('[data-panel]')
  const list = root.querySelector('[data-list]')
  const emptyEl = root.querySelector('[data-empty]')
  const readAll = root.querySelector('[data-read-all]')

  /** @param {string} [msg] */
  function showEmpty(msg = 'اعلانی نیست.') {
    if (list) list.innerHTML = ''
    if (emptyEl instanceof HTMLElement) {
      emptyEl.textContent = msg
      emptyEl.hidden = false
    }
  }

  function hideEmpty() {
    if (emptyEl instanceof HTMLElement) emptyEl.hidden = true
  }

  async function load() {
    try {
      const data = await apiGet('/api/v1/notifications')
      const unread = data.unread_count || 0
      if (countEl) {
        countEl.textContent = String(unread)
        countEl.hidden = unread === 0
      }
      if (!list) return
      if (!data.items?.length) {
        showEmpty('اعلانی نیست.')
        return
      }
      hideEmpty()
      list.innerHTML = data.items
        .map(
          (n) => `
        <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
          <strong>${escapeHtml(n.title)}</strong>
          <p class="hint">${escapeHtml(n.body || '')}</p>
          <p class="hint">${formatDateTime(n.created_at)}</p>
          ${n.is_read ? '' : '<button type="button" class="btn ghost small" data-read>خواندم</button>'}
        </div>`,
        )
        .join('')
      list.querySelectorAll('[data-read]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          const item = /** @type {HTMLElement} */ (e.target).closest('[data-id]')
          const id = item?.getAttribute('data-id')
          if (!id) return
          await apiPost(`/api/v1/notifications/${id}/read`)
          await load()
        })
      })
    } catch (err) {
      if (err && err.status === 401) return
      showEmpty('بارگذاری اعلان‌ها ناموفق بود.')
    }
  }

  bell?.addEventListener('click', () => {
    if (!panel) return
    panel.hidden = !panel.hidden
    if (!panel.hidden) void load()
  })
  readAll?.addEventListener('click', async () => {
    await apiPost('/api/v1/notifications/read-all')
    await load()
  })
  document.addEventListener('click', (e) => {
    if (!root.contains(/** @type {Node} */ (e.target)) && panel) panel.hidden = true
  })
  void load()
  return { reload: load }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
