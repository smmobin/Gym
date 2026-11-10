import {
  DEFAULT_LIMIT,
  LOG_FILES,
  REFRESH_MS,
  TOKEN_STORAGE_KEY,
  buildReadParams,
  extractRequestIds,
  isTailPage,
  lineLevel,
  olderOffset,
  viewerMessage,
  viewerStateFromStatus,
} from '../dev-logs-logic.js'
import { initThemeToggle } from '../theme.js'

const root = document.querySelector('[data-dev-logs]')
if (root) mountDevLogs(root)
initThemeToggle(document)

/**
 * @param {HTMLElement} host
 */
export function mountDevLogs(host) {
  const gate = host.querySelector('[data-gate]')
  const gateMsg = host.querySelector('[data-gate-msg]')
  const app = host.querySelector('[data-app]')
  const tabs = host.querySelector('[data-tabs]')
  const view = host.querySelector('[data-view]')
  const meta = host.querySelector('[data-meta]')
  const filterForm = /** @type {HTMLFormElement | null} */ (host.querySelector('[data-filters]'))

  /** @type {string} */
  let file = 'access'
  /** @type {number | null} */
  let offset = null
  /** @type {any} */
  let page = null
  /** @type {number | null} */
  let timer = null

  function token() {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || ''
  }

  function showGate(state) {
    if (app instanceof HTMLElement) app.hidden = true
    if (gate instanceof HTMLElement) gate.hidden = false
    const form = host.querySelector('[data-token-form]')
    if (form instanceof HTMLElement) form.hidden = state === 'off'
    if (gateMsg && state !== 'ready') {
      gateMsg.textContent =
        viewerMessage(state) ||
        'توکن بیننده را وارد کنید. مقدار فقط در sessionStorage همین زبانه می‌ماند.'
    }
  }

  function showApp() {
    if (gate instanceof HTMLElement) gate.hidden = true
    if (app instanceof HTMLElement) app.hidden = false
  }

  async function apiGet(path, params) {
    const url = new URL(path, window.location.origin)
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    }
    return fetch(url.pathname + url.search, {
      headers: { 'X-Dev-Log-Token': token() },
      cache: 'no-store',
    })
  }

  function renderTabs() {
    if (!tabs) return
    tabs.innerHTML = LOG_FILES.map(
      (name) =>
        `<button type="button" class="activity-chip${name === file ? ' is-active' : ''}" data-file="${name}" aria-pressed="${name === file ? 'true' : 'false'}" dir="ltr">${name}</button>`,
    ).join('')
    tabs.querySelectorAll('[data-file]').forEach((btn) => {
      btn.addEventListener('click', () => {
        file = btn.getAttribute('data-file') || 'access'
        offset = null
        renderTabs()
        void load()
      })
    })
  }

  function renderMeta() {
    if (!meta || !page) return
    const lines = page.lines || []
    const from = lines[0]?.line
    const to = lines[lines.length - 1]?.line
    const range =
      from != null && to != null
        ? `<span class="activity-stat"><strong>${String(from)}–${String(to)}</strong> نمایش</span>`
        : ''
    const trunc = page.truncated_to_tail
      ? `<span class="activity-stat warn"><strong>دم فایل</strong> برش‌خورده</span>`
      : ''
    meta.innerHTML = `
      <span class="activity-stat"><strong dir="ltr">${escapeHtml(file)}.log</strong></span>
      <span class="activity-stat"><strong>${Number(page.total_matched || 0).toLocaleString('fa-IR')}</strong> خط مطابق</span>
      ${range}
      ${trunc}
    `
  }

  function renderLines() {
    if (!view || !page) return
    const lines = page.lines || []
    if (!lines.length) {
      view.innerHTML = '<p class="hint activity-empty">در این فیلتر خطی نیست.</p>'
      renderMeta()
      return
    }
    view.innerHTML = lines
      .map((row) => {
        const level = lineLevel(row.text)
        const ids = extractRequestIds(row.text)
        const copy = ids.length
          ? `<button type="button" class="dev-log-copy" data-rid="${escapeAttr(ids[0])}">کپی rid</button>`
          : '<span></span>'
        return `<div class="dev-log-line is-${level || 'INFO'}">
          <span class="dev-log-n">${row.line}</span>
          <p class="dev-log-text">${escapeHtml(row.text)}</p>
          ${copy}
        </div>`
      })
      .join('')
    view.querySelectorAll('[data-rid]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rid = btn.getAttribute('data-rid') || ''
        try {
          await navigator.clipboard.writeText(rid)
        } catch {
          /* ignore */
        }
      })
    })
    renderMeta()
  }

  async function load() {
    const fd = filterForm ? new FormData(filterForm) : null
    const params = buildReadParams({
      file,
      offset,
      limit: DEFAULT_LIMIT,
      q: String(fd?.get('q') || ''),
      level: String(fd?.get('level') || ''),
      rid: String(fd?.get('rid') || ''),
    })
    const response = await apiGet('/api/v1/dev/logs/read', params)
    const state = viewerStateFromStatus(response.status)
    if (state !== 'ready') {
      if (state === 'unauthorized') sessionStorage.removeItem(TOKEN_STORAGE_KEY)
      showGate(state)
      stopAuto()
      return
    }
    page = await response.json()
    showApp()
    renderLines()
  }

  async function openWithToken(value) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, value.trim())
    const response = await apiGet('/api/v1/dev/logs/files')
    const state = viewerStateFromStatus(response.status)
    if (state !== 'ready') {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY)
      showGate(state)
      return
    }
    showApp()
    renderTabs()
    offset = null
    await load()
  }

  function stopAuto() {
    if (timer != null) window.clearInterval(timer)
    timer = null
  }

  function syncAuto() {
    stopAuto()
    const box = host.querySelector('[data-auto]')
    if (!(box instanceof HTMLInputElement) || !box.checked) return
    timer = window.setInterval(() => {
      if (!page || !isTailPage(page)) return
      offset = null
      void load()
    }, REFRESH_MS)
  }

  host.querySelector('[data-token-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const form = /** @type {HTMLFormElement} */ (event.target)
    const value = String(new FormData(form).get('token') || '')
    void openWithToken(value)
  })

  filterForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    offset = null
    void load()
  })

  host.querySelector('[data-older]')?.addEventListener('click', () => {
    if (!page) return
    offset = olderOffset(page.offset || 0, page.limit || DEFAULT_LIMIT)
    void load()
  })
  host.querySelector('[data-tail]')?.addEventListener('click', () => {
    offset = null
    void load()
  })
  host.querySelector('[data-refresh]')?.addEventListener('click', () => void load())
  host.querySelector('[data-auto]')?.addEventListener('change', syncAuto)
  host.querySelector('[data-lock]')?.addEventListener('click', () => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    stopAuto()
    page = null
    showGate('unauthorized')
    if (gateMsg) gateMsg.textContent = 'توکن پاک شد. برای دیدن دوباره وارد کنید.'
  })

  async function download(full) {
    if (!token()) return
    /** @type {Record<string, string>} */
    const params = { file }
    if (!full && page?.lines?.length) {
      params.start_line = String(page.lines[0].line)
      params.end_line = String(page.lines[page.lines.length - 1].line)
    }
    const response = await apiGet('/api/v1/dev/logs/download', params)
    if (!response.ok) return
    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = full ? `${file}.log` : `${file}-view.log`
    link.click()
    URL.revokeObjectURL(link.href)
  }
  host.querySelector('[data-download-file]')?.addEventListener('click', () => void download(true))
  host.querySelector('[data-download-view]')?.addEventListener('click', () => void download(false))

  renderTabs()
  if (token()) {
    void openWithToken(token())
  } else {
    void fetch('/api/v1/dev/logs/files', { cache: 'no-store' }).then((response) => {
      if (response.status === 404) showGate('off')
    })
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}
