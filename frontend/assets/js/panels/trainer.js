import { apiErrorMessage, apiGet } from '../api.js'
import { createAutoRefresh } from '../auto-refresh.js'
import { requireStaff } from '../auth-staff.js'
import { mountAttendance } from '../attendance.js'
import { createListPager } from '../pagination.js'
import { mountWorkouts } from '../workouts.js'
import { setStatus } from '../ui.js'
import { initStaffShell } from './shell.js'

async function main() {
  const user = await requireStaff(['trainer'])
  if (!user) return

  await initStaffShell({ user, defaultHash: 'dash' })

  const mounts = {
    trainees: () => mountTrainees(el('mount-trainees')),
    checkin: () => mountAttendance(el('mount-attendance'), user),
    workouts: () => mountWorkouts(el('mount-workouts'), user),
  }

  /** @type {Set<string>} */
  const loaded = new Set()
  function ensure(hash) {
    const key = hash || 'dash'
    if (loaded.has(key)) return
    const fn = mounts[key]
    if (fn) {
      fn()
      loaded.add(key)
    }
  }

  ensure((location.hash || '#dash').slice(1))
  window.addEventListener('hashchange', () => ensure(location.hash.slice(1)))

  try {
    const [members, today] = await Promise.all([
      apiGet('/api/v1/members'),
      apiGet('/api/v1/attendances/today'),
    ])
    const traineeCount = (members.items || members.members || []).length
    const todayCount = (today.items || today.attendances || []).length
    const toFa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
    const elTr = document.querySelector('[data-stat-trainees]')
    const elToday = document.querySelector('[data-stat-today]')
    if (elTr) elTr.textContent = toFa(traineeCount)
    if (elToday) elToday.textContent = toFa(todayCount)
  } catch {
    // ignore dash stats failures
  }
}

/** @param {HTMLElement} root */
function mountTrainees(root) {
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>شاگردان من</h2></header>
      <div class="status-msg" data-status hidden></div>
      <div class="list" data-list></div>
      <div data-pager class="list-pager-host" hidden></div>
    </article>
  `
  const status = root.querySelector('[data-status]')
  const list = root.querySelector('[data-list]')
  const pager = createListPager(root.querySelector('[data-pager]'))

  /**
   * @param {{ silent?: boolean }} [ctx]
   */
  async function load(ctx = {}) {
    const silent = !!ctx.silent
    try {
      const data = await apiGet('/api/v1/members')
      const items = data.items || data.members || []
      if (!silent) pager.reset()
      pager.paint(items, (rows) => {
        list.innerHTML = rows.length
          ? rows
              .map(
                (m) => `<div class="row-item"><div>
            <h3>${m.first_name} ${m.last_name}</h3>
            <p class="hint">${m.display_id} · <span dir="ltr">${m.mobile}</span> · ${m.status}</p>
          </div>
          <a class="btn small ghost" href="#workouts">برنامه</a>
          </div>`,
              )
              .join('')
          : '<p class="hint">شاگرد تخصیص‌یافته‌ای ندارید.</p>'
      })
      setStatus(status, `${items.length.toLocaleString('fa-IR')} شاگرد`, 'ok')
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'خطا در بارگذاری شاگردان'), 'error')
      list.innerHTML = ''
      throw err
    }
  }

  createAutoRefresh(root, load, {
    intervalMs: 30_000,
    retryBaseMs: 2_500,
    retryMaxMs: 45_000,
  })
}

/** @param {string} id */
function el(id) {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node
}

void main()
