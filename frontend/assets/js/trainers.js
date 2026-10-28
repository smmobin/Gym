import { apiErrorMessage, apiGet, apiPost } from './api.js'
import { bindMemberSearch, personSelectRowHtml, setPersonChip } from './members.js'
import { setStatus } from './ui.js'

/**
 * Escape text for HTML text nodes.
 * @param {unknown} s
 */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {Array<{
 *   id: number,
 *   member_id: number,
 *   member_display_id?: string | null,
 *   member_first_name?: string,
 *   member_last_name?: string,
 *   member_mobile?: string,
 * }>} items
 * @param {{ allowEnd?: boolean }} [opts]
 */
export function trainerRosterHtml(items, opts = {}) {
  const allowEnd = opts.allowEnd !== false
  if (!items.length) {
    return '<p class="hint" data-roster-empty>شاگرد فعالی به این مربی وصل نیست.</p>'
  }
  return items
    .map((a) => {
      const name = `${a.member_first_name || ''} ${a.member_last_name || ''}`.trim() || '—'
      const meta = [a.member_display_id, a.member_mobile].filter(Boolean).join(' · ')
      const endBtn = allowEnd
        ? `<button type="button" class="btn small ghost" data-roster-end="${a.id}" data-member-id="${a.member_id}">قطع</button>`
        : '<em>—</em>'
      return `<div class="row-item"><div>
        <h3>${escapeHtml(name)}</h3>
        <p class="hint">${escapeHtml(meta)}</p></div>
        ${endBtn}</div>`
    })
    .join('')
}

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
      ${personSelectRowHtml({
        label: 'جستجوی عضو',
        chipAttr: 'data-sel',
        placeholder: 'نام یا موبایل',
        emptyText: 'عضوی انتخاب نشده',
      })}
      <label>مربی<select data-trainers></select></label>
      <button type="button" class="btn" data-assign style="margin-top:1rem">وصل مربی</button>
      <header class="panel-head" style="margin-top:1.25rem"><h3 data-roster-title>شاگردان مربی</h3></header>
      <div class="list" data-trainer-roster><p class="hint">یک مربی را از فهرست انتخاب کنید.</p></div>
      <header class="panel-head" style="margin-top:1.25rem"><h3>مربیان عضو انتخاب‌شده</h3></header>
      <div class="list" data-list><p class="hint">ابتدا عضو را جستجو و انتخاب کنید.</p></div>
    </article>
  `
  const status = root.querySelector('[data-status]')
  const rosterEl = root.querySelector('[data-trainer-roster]')
  const rosterTitle = root.querySelector('[data-roster-title]')
  /** @type {any[]} */ let trainers = []
  /** @type {any | null} */ let member = null

  function selectedTrainerId() {
    const sel = /** @type {HTMLSelectElement | null} */ (root.querySelector('[data-trainers]'))
    return sel?.value ? Number(sel.value) : null
  }

  function selectedTrainer() {
    const id = selectedTrainerId()
    return trainers.find((t) => t.id === id) || null
  }

  async function loadTrainers() {
    const data = await apiGet('/api/v1/trainers')
    trainers = (data.items || []).filter((t) => t.is_active)
    const sel = root.querySelector('[data-trainers]')
    if (!sel) return
    sel.innerHTML = trainers
      .map((t) => `<option value="${t.id}">${escapeHtml(t.full_name)} — ${escapeHtml(t.mobile)}</option>`)
      .join('')
    globalThis.GymCustomSelect?.sync?.(sel)
    await loadTrainerRoster()
  }

  async function loadTrainerRoster() {
    const tid = selectedTrainerId()
    const t = selectedTrainer()
    if (rosterTitle) {
      rosterTitle.textContent = t ? `شاگردان ${t.full_name}` : 'شاگردان مربی'
    }
    if (!tid || !rosterEl) {
      if (rosterEl) rosterEl.innerHTML = '<p class="hint">یک مربی را از فهرست انتخاب کنید.</p>'
      return
    }
    try {
      const data = await apiGet(`/api/v1/trainers/${tid}/members`)
      const items = (data.items || []).filter((a) => a.is_active)
      rosterEl.innerHTML = trainerRosterHtml(items)
      rosterEl.querySelectorAll('[data-roster-end]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const assignmentId = btn.getAttribute('data-roster-end')
          const memberId = btn.getAttribute('data-member-id')
          if (!assignmentId || !memberId) return
          try {
            await apiPost(`/api/v1/members/${memberId}/trainers/${assignmentId}/end`)
            setStatus(status, 'قطع شد.', 'ok')
            await loadTrainerRoster()
            if (member && String(member.id) === String(memberId)) await loadAssignments()
          } catch (err) {
            setStatus(status, apiErrorMessage(err, 'قطع ناموفق'), 'error')
          }
        })
      })
    } catch (err) {
      rosterEl.innerHTML = `<p class="hint">${apiErrorMessage(err, 'بارگذاری شاگردان ناموفق')}</p>`
    }
  }

  async function loadAssignments() {
    const listEl = root.querySelector('[data-list]')
    if (!listEl) return
    if (!member) {
      listEl.innerHTML = '<p class="hint">ابتدا عضو را جستجو و انتخاب کنید.</p>'
      return
    }
    const data = await apiGet(`/api/v1/members/${member.id}/trainers`)
    const items = (data.items || []).filter((a) => a.is_active)
    listEl.innerHTML = items.length
      ? items
          .map(
            (a) => `<div class="row-item"><div>
          <h3>${escapeHtml(a.trainer_full_name)}</h3>
          <p>${escapeHtml(a.trainer_mobile)}</p></div>
          <button type="button" class="btn small ghost" data-end="${a.id}">قطع</button></div>`,
          )
          .join('')
      : '<p class="hint">مربی فعالی وصل نیست.</p>'
    listEl.querySelectorAll('[data-end]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await apiPost(`/api/v1/members/${member.id}/trainers/${btn.getAttribute('data-end')}/end`)
          setStatus(status, 'قطع شد.', 'ok')
          await loadAssignments()
          await loadTrainerRoster()
        } catch (err) {
          setStatus(status, apiErrorMessage(err, 'خطا'), 'error')
        }
      }),
    )
  }

  bindMemberSearch(
    /** @type {HTMLElement} */ (root.querySelector('[data-pick]')),
    /** @type {HTMLInputElement} */ (root.querySelector('[data-q]')),
    async (m) => {
      member = m
      setPersonChip(root.querySelector('[data-sel]'), m)
      await loadAssignments()
    },
  )

  root.querySelector('[data-trainers]')?.addEventListener('change', () => {
    void loadTrainerRoster()
  })

  root.querySelector('[data-assign]')?.addEventListener('click', async () => {
    if (!member) {
      setStatus(status, 'اول عضو را انتخاب کنید.', 'error')
      return
    }
    const tid = selectedTrainerId()
    if (!tid) {
      setStatus(status, 'مربی را انتخاب کنید.', 'error')
      return
    }
    try {
      await apiPost(`/api/v1/members/${member.id}/trainers`, { trainer_user_id: tid })
      setStatus(status, 'وصل شد.', 'ok')
      await loadAssignments()
      await loadTrainerRoster()
    } catch (err) {
      setStatus(status, apiErrorMessage(err, 'وصل ناموفق'), 'error')
    }
  })

  void loadTrainers().catch((err) =>
    setStatus(status, apiErrorMessage(err, 'خطا'), 'error'),
  )
}
