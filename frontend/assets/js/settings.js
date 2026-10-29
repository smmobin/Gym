import { ApiError, apiGet, apiPatch } from './api.js'
import { toTimeInput } from './format.js'
import { setStatus } from './ui.js'

/** @param {HTMLElement} root @param {{ role: string }} user */
export function mountSettings(root, user) {
  const canPatch = user.role === 'manager'
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>تنظیمات باشگاه</h2></header>
      <div class="status-msg" data-status hidden></div>
      <form data-form class="form-grid">
        <label>نام باشگاه<input name="gym_name" ${canPatch ? '' : 'readonly'} /></label>
        <label>تلفن<input name="phone" ${canPatch ? '' : 'readonly'} /></label>
        <label class="full">نشانی<input name="address" ${canPatch ? '' : 'readonly'} /></label>
        <label>ساعت پایان روز<input name="day_end_time" type="time" ${canPatch ? '' : 'readonly'} /></label>
        <label>هشدار انقضا (روز)<input name="expiry_warning_days" type="number" min="1" ${canPatch ? '' : 'readonly'} /></label>
        <label>سقف توقف سالانه (روز)<input name="freeze_annual_cap_days" type="number" min="0" ${canPatch ? '' : 'readonly'} /></label>
        <label class="full">یادداشت ساعت کاری<textarea name="working_hours_note" ${canPatch ? '' : 'readonly'}></textarea></label>
        <label class="full">قوانین تمدید<textarea name="renewal_rules_note" ${canPatch ? '' : 'readonly'}></textarea></label>
        ${canPatch ? '<button class="btn" type="submit">ذخیره</button>' : '<p class="hint">منشی فقط مشاهده دارد؛ ویرایش فقط مدیر.</p>'}
      </form>
    </article>
  `
  const status = root.querySelector('[data-status]')
  const form = /** @type {HTMLFormElement} */ (root.querySelector('[data-form]'))

  async function load() {
    setStatus(status, 'بارگذاری…', 'loading')
    try {
      const s = await apiGet('/api/v1/gym-settings')
      form.gym_name.value = s.gym_name || ''
      form.phone.value = s.phone || ''
      form.address.value = s.address || ''
      form.day_end_time.value = toTimeInput(s.day_end_time)
      form.expiry_warning_days.value = s.expiry_warning_days ?? 7
      form.freeze_annual_cap_days.value = s.freeze_annual_cap_days ?? 14
      form.working_hours_note.value = s.working_hours_note || ''
      form.renewal_rules_note.value = s.renewal_rules_note || ''
      setStatus(status, '')
    } catch (err) {
      setStatus(status, err instanceof ApiError ? err.message : 'خطا', 'error')
    }
  }

  if (canPatch) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(form)
      try {
        await apiPatch('/api/v1/gym-settings', {
          gym_name: String(fd.get('gym_name')).trim(),
          phone: String(fd.get('phone')).trim() || null,
          address: String(fd.get('address')).trim() || null,
          day_end_time: String(fd.get('day_end_time')),
          expiry_warning_days: Number(fd.get('expiry_warning_days')),
          freeze_annual_cap_days: Number(fd.get('freeze_annual_cap_days')),
          working_hours_note: String(fd.get('working_hours_note') || '').trim() || null,
          renewal_rules_note: String(fd.get('renewal_rules_note') || '').trim() || null,
        })
        setStatus(status, 'ذخیره شد.', 'ok')
      } catch (err) {
        setStatus(status, err instanceof ApiError ? err.message : 'ذخیره ناموفق', 'error')
      }
    })
  }

  void load()
}
