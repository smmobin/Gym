import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { ApiError, apiGet, apiPost } from '@/lib/api'
import type { LoginResponse, MeResponse, StaffUser } from '@/types/auth'

const ROLE_LABEL: Record<string, string> = {
  manager: 'مدیر',
  receptionist: 'منشی',
  trainer: 'مربی',
}

export function LoginPage() {
  const [mobile, setMobile] = useState('09120000001')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [user, setUser] = useState<StaffUser | null>(null)

  useEffect(() => {
    apiGet<MeResponse>('/api/v1/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const data = await apiPost<LoginResponse>('/api/v1/auth/login', {
        mobile: mobile.trim(),
        password,
      })
      setUser(data.user)
      setPassword('')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('ورود ناموفق بود. اتصال به سرور را بررسی کنید.')
      }
      setUser(null)
    } finally {
      setBusy(false)
    }
  }

  async function onLogout() {
    setError(null)
    setBusy(true)
    try {
      await apiPost('/api/v1/auth/logout')
      setUser(null)
    } catch {
      setError('خروج انجام نشد.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>ورود کارکنان</h1>
      <p className="lead">با موبایل و رمز وارد شوید. نشست روی سرور نگه داشته می‌شود.</p>

      {user ? (
        <section className="auth-panel" aria-live="polite">
          <p>
            شما وارد شده‌اید: <strong>{user.full_name}</strong>
          </p>
          <p>
            نقش: <strong>{ROLE_LABEL[user.role] ?? user.role}</strong>
          </p>
          <p className="hint">موبایل: {user.mobile}</p>
          <p className="hint">
            <Link to="/members">اعضا</Link>
            {' · '}
            <Link to="/attendance">حضور</Link>
            {' · '}
            <Link to="/classes">کلاس‌ها</Link>
          </p>
          <button type="button" className="btn" onClick={onLogout} disabled={busy}>
            خروج
          </button>
        </section>
      ) : (
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            موبایل
            <input
              name="mobile"
              inputMode="tel"
              autoComplete="username"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              required
            />
          </label>
          <label>
            رمز عبور
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'در حال ورود…' : 'ورود'}
          </button>
        </form>
      )}

      <p className="hint">
        <Link to="/">بازگشت به خانه</Link>
      </p>
    </main>
  )
}
