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
  precisePayloadMarkup,
  viewerMessage,
  viewerStateFromStatus,
} from '../dev-logs-logic.js'
import { formatDateTime, isoDateLocal, mountTodayDate, ROLE_LABEL } from '../format.js'
import { applyNavIcons } from '../nav-icons.js'
import { initThemeToggle } from '../theme.js'
import { bindHashNav, bindSidebarClose, setStatus } from '../ui.js'

const CATEGORIES = [
  ['', 'همه'],
  ['auth', 'ورود/خروج'],
  ['plans', 'طرح و قیمت'],
  ['memberships', 'عضویت'],
  ['payments', 'پرداخت'],
  ['settings', 'تنظیمات'],
  ['staff', 'کارکنان'],
  ['errors', 'خطای سرور'],
]

const host = document.querySelector('[data-dev-logs]')
if (host instanceof HTMLElement) mountDevLogs(host)

/**
 * @param {HTMLElement} host
 */
export function mountDevLogs(host) {
  initThemeToggle(document)
  applyNavIcons(document)
  bindSidebarClose()
  bindHashNav('activity')
  mountTodayDate()

  const gate = host.querySelector('[data-gate]')
  const gateMsg = host.querySelector('[data-gate-msg]')
  const tabs = host.querySelector('[data-tabs]')
  const view = host.querySelector('[data-view]')
  const meta = host.querySelector('[data-meta]')
  const filterForm = /** @type {HTMLFormElement | null} */ (host.querySelector('[data-filters]'))
  const preciseRoot = host.querySelector('[data-precise]')

  /** @type {string} */
  let file = 'access'
  /** @type {number | null} */
  let offset = null
  /** @type {any} */
  let page = null
  /** @type {number | null} */
  let timer = null
  let preciseStarted = false

  function token() {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || ''
  }

  function showGate(state) {
    document.querySelectorAll('[data-section]').forEach((sec) => {
      if (sec instanceof HTMLElement) sec.hidden = true
    })
    if (gate instanceof HTMLElement) gate.hidden = false
    const form = host.querySelector('[data-token-form]')
    if (form instanceof HTMLElement) form.hidden = state === 'off'
    if (gateMsg) {
      gateMsg.textContent =
        viewerMessage(state) || 'توکن بیننده را وارد کنید. مقدار فقط در sessionStorage همین زبانه می‌ماند.'
    }
  }

  function showShell() {
    if (gate instanceof HTMLElement) gate.hidden = true
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }

  async function apiGet(path, params) {
    const url = new URL(path, window.location.origin)
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
    return fetch(url.pathname + url.search, {
      headers: token() ? { 'X-Dev-Log-Token': token() } : {},
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
    meta.innerHTML = `
      <span class="activity-stat"><strong dir="ltr">${escapeHtml(file)}.log</strong></span>
      <span class="activity-stat"><strong>${Number(page.total_matched || 0).toLocaleString('fa-IR')}</strong> خط مطابق</span>
      ${from != null ? `<span class="activity-stat"><strong>${from}–${to}</strong> نمایش</span>` : ''}
      ${page.truncated_to_tail ? '<span class="activity-stat warn"><strong>دم</strong> برش‌خورده</span>' : ''}
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
    const response = await apiGet(
      '/api/v1/dev/logs/read',
      buildReadParams({
        file,
        offset,
        limit: DEFAULT_LIMIT,
        q: String(fd?.get('q') || ''),
        level: String(fd?.get('level') || ''),
        rid: String(fd?.get('rid') || ''),
      }),
    )
    const state = viewerStateFromStatus(response.status)
    if (state !== 'ready') {
      if (state === 'unauthorized') sessionStorage.removeItem(TOKEN_STORAGE_KEY)
      showGate(state)
      stopAuto()
      return
    }
    page = await response.json()
    showShell()
    renderLines()
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

  async function openWithToken(value) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, value.trim())
    const response = await apiGet('/api/v1/dev/logs/files')
    const state = viewerStateFromStatus(response.status)
    if (state !== 'ready') {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY)
      showGate(state)
      return
    }
    showShell()
    renderTabs()
    offset = null
    if (!preciseStarted && preciseRoot instanceof HTMLElement) {
      preciseStarted = true
      mountPrecise(preciseRoot)
    }
    await load()
  }

  host.querySelector('[data-token-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const form = /** @type {HTMLFormElement} */ (event.target)
    void openWithToken(String(new FormData(form).get('token') || ''))
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
  document.querySelector('[data-lock]')?.addEventListener('click', () => {
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

  function mountPrecise(root) {
    const form = /** @type {HTMLFormElement} */ (root.querySelector('[data-precise-filters]'))
    const chips = root.querySelector('[data-precise-chips]')
    const listEl = root.querySelector('[data-precise-list]')
    const statsEl = root.querySelector('[data-precise-stats]')
    const status = root.querySelector('[data-precise-status]')
    const moreEl = root.querySelector('[data-precise-more]')
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)
    if (form.from) form.from.value = isoDateLocal(start)
    if (form.to) form.to.value = isoDateLocal(today)
    let category = ''
    /** @type {any[]} */
    let items = []
    /** @type {string | null} */
    let nextCursor = null

    if (chips) {
      chips.innerHTML = CATEGORIES.map(
        ([id, label], index) =>
          `<button type="button" class="activity-chip${index ? '' : ' is-active'}" data-cat="${id}" aria-pressed="${index ? 'false' : 'true'}">${label}</button>`,
      ).join('')
    }

    function readFilters() {
      if (typeof window !== 'undefined' && window.GymDatePicker?.flush) window.GymDatePicker.flush(form)
      const fd = new FormData(form)
      return {
        from: String(fd.get('from') || ''),
        to: String(fd.get('to') || ''),
        q: String(fd.get('q') || ''),
        category,
      }
    }

    function paint() {
      const fails = items.filter((i) => i.outcome === 'fail').length
      const errors = items.filter((i) => i.source === 'error').length
      if (statsEl) {
        statsEl.innerHTML = `
          <span class="activity-stat"><strong>${items.length.toLocaleString('fa-IR')}</strong> رویداد</span>
          <span class="activity-stat ${fails ? 'warn' : ''}"><strong>${fails.toLocaleString('fa-IR')}</strong> ناموفق</span>
          <span class="activity-stat ${errors ? 'danger' : ''}"><strong>${errors.toLocaleString('fa-IR')}</strong> خطای سرور</span>
        `
      }
      if (!listEl) return
      if (!items.length) {
        listEl.innerHTML = '<p class="hint activity-empty">در این بازه رویدادی ثبت نشده است.</p>'
      } else {
        listEl.innerHTML = items.map(preciseRow).join('')
        listEl.querySelectorAll('[data-copy-rid]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(btn.getAttribute('data-copy-rid') || '')
            } catch {
              /* ignore */
            }
          })
        })
      }
      if (moreEl instanceof HTMLElement) moreEl.hidden = !nextCursor
    }

    async function loadPrecise(append = false) {
      const filters = readFilters()
      /** @type {Record<string, string>} */
      const params = {}
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      if (filters.q) params.q = filters.q
      if (filters.category) params.category = filters.category
      if (append && nextCursor) params.cursor = nextCursor
      if (status instanceof HTMLElement) setStatus(status, 'بارگذاری…', 'loading')
      const response = await apiGet('/api/v1/dev/logs/activity', params)
      const state = viewerStateFromStatus(response.status)
      if (state !== 'ready') {
        if (state === 'unauthorized') sessionStorage.removeItem(TOKEN_STORAGE_KEY)
        showGate(state)
        return
      }
      const data = await response.json()
      const fresh = Array.isArray(data.items) ? data.items : []
      items = append ? [...items, ...fresh] : fresh
      nextCursor = data.next_cursor || null
      paint()
      if (status instanceof HTMLElement) setStatus(status, '')
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      void loadPrecise(false)
    })
    chips?.querySelectorAll('[data-cat]').forEach((node) => {
      node.addEventListener('click', () => {
        category = node.getAttribute('data-cat') || ''
        chips.querySelectorAll('[data-cat]').forEach((chip) => {
          const on = chip === node
          chip.classList.toggle('is-active', on)
          chip.setAttribute('aria-pressed', on ? 'true' : 'false')
        })
        void loadPrecise(false)
      })
    })
    root.querySelector('[data-precise-older]')?.addEventListener('click', () => {
      if (nextCursor) void loadPrecise(true)
    })
    void loadPrecise(false)
  }

  if (token()) {
    void openWithToken(token())
  } else {
    void fetch('/api/v1/dev/logs/files', { cache: 'no-store' }).then((response) => {
      if (response.status === 404) showGate('off')
      else showGate('unauthorized')
    })
  }
}

/**
 * @param {any} item
 */
function preciseRow(item) {
  const fail = item.outcome === 'fail'
  const isError = item.source === 'error'
  const role = item.actor_role ? ROLE_LABEL[item.actor_role] || item.actor_role : ''
  const actor = [item.actor_name, role].filter(Boolean).join(' · ')
  const cat = CATEGORIES.find(([id]) => id === item.category)?.[1] || item.category
  const payload = precisePayloadMarkup(item)
  const entity = [item.entity_type, item.entity_id].filter(Boolean).join(' #')
  const errType = item.error_type ? ` · ${item.error_type}` : ''
  const path = item.path
    ? `<span class="activity-path en" dir="ltr">${escapeHtml(`${item.method || ''} ${item.path} → ${item.status_code ?? ''}`.trim())}</span>`
    : ''
  const rid = item.request_id
    ? `<button type="button" class="dev-log-copy" data-copy-rid="${escapeAttr(item.request_id)}">کپی rid</button> <code class="activity-rid en" dir="ltr">${escapeHtml(item.request_id)}</code>`
    : ''
  return `<article class="activity-row${fail ? ' is-fail' : ''}${isError ? ' is-error' : ''}">
    <span class="activity-dot" aria-hidden="true"></span>
    <div class="activity-main">
      <p class="activity-summary">${escapeHtml(item.summary || '')}</p>
      <p class="activity-meta hint">
        <code class="activity-rid en" dir="ltr">${escapeHtml(item.action || '')}</code>
        ${actor ? ` · ${escapeHtml(actor)}` : ''}
        ${entity ? ` · ${escapeHtml(entity)}` : ''}
        ${path ? ` · ${path}` : ''}
        ${escapeHtml(errType)}
        ${rid ? ` · ${rid}` : ''}
      </p>
      ${payload}
    </div>
    <div class="activity-side">
      <time class="activity-time" datetime="${escapeHtml(item.created_at || '')}">${escapeHtml(formatDateTime(item.created_at))}</time>
      <span class="activity-badges">
        <span class="badge">${escapeHtml(cat)}</span>
        <span class="badge ${fail ? 'danger' : 'ok'}">${fail ? 'ناموفق' : 'موفق'}</span>
      </span>
    </div>
  </article>`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}
