import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { ApiError, apiPost } from '@/lib/api'

/**
 * Public trial request form — no login.
 * Does not create a Member; only queues a trial_leads row.
 */
export function TrialPublicPage() {
  const [fullName, setFullName] = useState('')
  const [mobile, setMobile] = useState('')
  const [preferredTime, setPreferredTime] = useState('')
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const data = await apiPost<{ id: number; message: string }>(
        '/api/v1/public/trial-leads',
        {
          full_name: fullName.trim(),
          mobile: mobile.trim(),
          preferred_time_note: preferredTime.trim() || null,
          message: message.trim() || null,
        },
      )
      setOk(data.message)
      setFullName('')
      setMobile('')
      setPreferredTime('')
      setMessage('')
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ارسال درخواست ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">باشگاه آذر</p>
      <h1>درخواست جلسه آزمایشی</h1>
      <p className="lead">
        فرم را پر کنید؛ منشی باشگاه با شما تماس می‌گیرد. عضویت خودکار ساخته نمی‌شود.
      </p>

      {ok ? (
        <p className="ok-msg" role="status">
          {ok}
        </p>
      ) : (
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            نام و نام خانوادگی
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <label>
            موبایل
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              inputMode="tel"
              required
              minLength={10}
            />
          </label>
          <label>
            زمان ترجیحی (اختیاری)
            <input
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
              placeholder="مثلاً عصرها"
            />
          </label>
          <label>
            پیام (اختیاری)
            <input value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          {error ? (
            <p className="err-msg" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'در حال ارسال…' : 'ارسال درخواست'}
          </button>
        </form>
      )}

      <p className="hint">
        <Link to="/">خانه</Link>
        {' · '}
        <Link to="/login">ورود کارکنان</Link>
      </p>
    </main>
  )
}
