import { ApiError, apiGet, apiPost } from './api.js'
import { bindMemberSearch } from './members.js'
import { setStatus } from './ui.js'

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountTrainers(root, user) {
  if (user.role !== 'manager' && user.role !== 'receptionist') {
    root.innerHTML =
      '<p class="status-msg error">واگذاری مربی فقط برای منشی یا مدیر است. مربیان به بخش برنامه بروند.</p>'
    return
  }
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>واگذاری مربی</h2></header>
      <div class="status-msg" data-status hidden></div>
      <label>جستجوی عضو<input type="search" data-q /></label>
      <div class="member-pick" data-pick></div>
      <p class="hint" data-sel>عضوی انتخاب نشده</p>
      <label>مربی<select data-trainers></select></label>
      <button type="button" class="btn" data-assign>وصل مربی</button>
      <div class="list" data-list style="margin-top:1rem"></div>
    </article>
  `
  const status = root.querySelector('[data-status]')
  /** @type {any[]} */ let trainers = []
  /** @type {any | null} */ let member = null

  async function loadTrainers() {
    const data = await apiGet('/api/v1/trainers')
    trainers = (data.items || []).filter((t) => t.is_active)
    const sel = root.querySelector('[data-trainers]')
    if (!sel) return
    sel.innerHTML = trainers
      .map((t) => `<option value="${t.id}">${t.full_name} — ${t.mobile}</option>`)
      .join('')
    globalThis.GymCustomSelect?.sync?.(sel)
  }

  async function loadAssignments() {
    if (!member) return
    const data = await apiGet(`/api/v1/members/${member.id}/trainers`)
    const items = (data.items || []).filter((a) => a.is_active)
    root.querySelector('[data-list]').innerHTML = items.length
      ? items
          .map(
            (a) => `<div class="row-item"><div>
          <h3>${a.trainer_full_name}</h3>
          <p>${a.trainer_mobile}</p></div>
          <button type="button" class="btn small ghost" data-end="${a.id}">قطع</button></div>`,
          )
          .join('')
      : '<p class="hint">مربی فعالی وصل نیست.</p>'
    root.querySelectorAll('[data-end]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await apiPost(`/api/v1/members/${member.id}/trainers/${btn.getAttribute('data-end')}/end`)
          setStatus(status, 'قطع شد.', 'ok')
          await loadAssignments()
        } catch (err) {
          setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
        }
      }),
    )
  }

  bindMemberSearch(
    (root.querySelector('[data-pick]')),
    (root.querySelector('[data-q]')),
    async (m) => {
      member = m
      root.querySelector('[data-sel]').textContent = `${m.first_name} ${m.last_name}`
      await loadAssignments()
    },
  )

  root.querySelector('[data-assign]')?.addEventListener('click', async () => {
    if (!member) return
    const tid = Number(/** @type {HTMLSelectElement} */ (root.querySelector('[data-trainers]')).value)
    try {
      await apiPost(`/api/v1/members/${member.id}/trainers`, { trainer_user_id: tid })
      setStatus(status, 'وصل شد.', 'ok')
      await loadAssignments()
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'وصل ناموفق', 'error')
    }
  })

  void loadTrainers().catch((err) =>
    setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error'),
  )
}
