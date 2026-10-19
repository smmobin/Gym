import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ApiError, apiGet, apiPost } from '@/lib/api'
import type { AthleteMember } from '@/types/athlete'

type MeResponse = { member: AthleteMember }
type LoginResponse = { member: AthleteMember }

export function AthleteLoginPage() {
  const navigate = useNavigate()
  const [mobile, setMobile] = useState('09121111001')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiGet<MeResponse>('/api/v1/athlete/auth/me')
      .then(() => navigate('/athlete', { replace: true }))
      .catch(() => undefined)
  }, [navigate])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await apiPost<LoginResponse>('/api/v1/athlete/auth/login', {
        mobile: mobile.trim(),
        password,
      })
      navigate('/athlete', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ورود ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page athlete-page">
      <p className="eyebrow">GYM CONTROL · ورزشکار</p>
      <h1>ورود ورزشکار</h1>
      <p className="lead">
        با موبایل و رمزی که میز برایتان ست کرده وارد شوید. پیامک و OTP هنوز فعال نیست.
      </p>

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

      <p className="hint">
        <Link to="/">خانه عمومی</Link>
        {' · '}
        <Link to="/login">ورود کارکنان</Link>
      </p>
    </main>
  )
}
