import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { NotificationBell } from '@/features/shell/NotificationBell'
import { ApiError, apiGet, apiPatch } from '@/lib/api'
import type { StaffUser } from '@/types/auth'
import type { GymSettings } from '@/types/settings'

function timeInputValue(isoOrTime: string): string {
  // API may return "22:30:00" or "22:30:00.000000"
  return isoOrTime.slice(0, 5)
}

function SettingsContent({ user }: { user: StaffUser }) {
  const isManager = user.role === 'manager'
  const [form, setForm] = useState<GymSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isManager) return
    apiGet<GymSettings>('/api/v1/gym-settings')
      .then(setForm)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message)
        else setError('بارگذاری تنظیمات ناموفق بود.')
      })
  }, [isManager])

  if (!isManager) {
    return (
      <main className="page">
        <p className="eyebrow">GYM CONTROL</p>
        <h1>تنظیمات باشگاه</h1>
        <p className="err-msg" role="alert">
          این صفحه فقط برای مدیر است. منشی می‌تواند تنظیمات را از API بخواند ولی ویرایش ندارد.
        </p>
        <p className="hint">
          <Link to="/">خانه</Link>
          {' · '}
          <Link to="/login">ورود</Link>
        </p>
      </main>
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await apiPatch<GymSettings>('/api/v1/gym-settings', {
        gym_name: form.gym_name,
        phone: form.phone || null,
        address: form.address || null,
        day_end_time: `${timeInputValue(form.day_end_time)}:00`,
        expiry_warning_days: Number(form.expiry_warning_days),
        freeze_annual_cap_days: Number(form.freeze_annual_cap_days),
        working_hours_note: form.working_hours_note || null,
        renewal_rules_note: form.renewal_rules_note || null,
      })
      setForm(updated)
      setMessage('ذخیره شد.')
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ذخیره ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">GYM CONTROL</p>
          <h1>تنظیمات باشگاه</h1>
        </div>
        <NotificationBell />
      </div>
      <p className="lead">نام، تماس، ساعت پایان روز، هشدار انقضا، سقف freeze. لوگو فعلاً نیست.</p>

      {!form ? (
        <p className="hint">در حال بارگذاری…</p>
      ) : (
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            نام باشگاه
            <input
              value={form.gym_name}
              onChange={(e) => setForm({ ...form, gym_name: e.target.value })}
              required
            />
          </label>
          <label>
            تلفن
            <input
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            نشانی
            <textarea
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
            />
          </label>
          <label>
            ساعت پایان روز
            <input
              type="time"
              value={timeInputValue(form.day_end_time)}
              onChange={(e) => setForm({ ...form, day_end_time: e.target.value })}
              required
            />
          </label>
          <label>
            روز هشدار انقضا
            <input
              type="number"
              min={1}
              max={90}
              value={form.expiry_warning_days}
              onChange={(e) =>
                setForm({ ...form, expiry_warning_days: Number(e.target.value) })
              }
              required
            />
          </label>
          <label>
            سقف freeze سالانه (روز)
            <input
              type="number"
              min={0}
              max={365}
              value={form.freeze_annual_cap_days}
              onChange={(e) =>
                setForm({ ...form, freeze_annual_cap_days: Number(e.target.value) })
              }
              required
            />
          </label>
          <label>
            ساعت کاری (یادداشت)
            <textarea
              value={form.working_hours_note ?? ''}
              onChange={(e) => setForm({ ...form, working_hours_note: e.target.value })}
              rows={2}
            />
          </label>
          <label>
            قوانین تمدید (یادداشت)
            <textarea
              value={form.renewal_rules_note ?? ''}
              onChange={(e) => setForm({ ...form, renewal_rules_note: e.target.value })}
              rows={3}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {message ? <p className="ok-msg">{message}</p> : null}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
        </form>
      )}

      <p className="hint">
        <Link to="/">خانه</Link>
        {' · '}
        <Link to="/sms-templates">قالب پیامک</Link>
        {' · '}
        <Link to="/reports">گزارش</Link>
      </p>
    </main>
  )
}

export function SettingsPage() {
  return <RequireAuth>{(user) => <SettingsContent user={user} />}</RequireAuth>
}
