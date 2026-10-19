import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { ApiError, apiPost } from '@/lib/api'
import type { StaffUser } from '@/types/auth'
import type { DayGuestResponse } from '@/types/trialGuests'

const METHOD_LABEL: Record<string, string> = {
  cash: 'نقدی',
  pos: 'کارت‌خوان',
  transfer: 'انتقال',
  online: 'آنلاین (بدون درگاه)',
}

function formatToman(n: number): string {
  return `${n.toLocaleString('fa-IR')} تومان`
}

function GuestsContent({ user }: { user: StaffUser }) {
  const isDesk = user.role === 'manager' || user.role === 'receptionist'
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mobile, setMobile] = useState('')
  const [amount, setAmount] = useState('250000')
  const [method, setMethod] = useState('cash')
  const [payNow, setPayNow] = useState(true)
  const [result, setResult] = useState<DayGuestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!isDesk) {
    return (
      <main className="page">
        <p className="eyebrow">GYM CONTROL</p>
        <h1>مهمان روزانه</h1>
        <p className="err-msg">فقط منشی و مدیر می‌توانند مهمان ثبت کنند.</p>
        <p className="hint">
          <Link to="/">خانه</Link>
        </p>
      </main>
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const agreed = Number(amount)
      if (!Number.isFinite(agreed) || agreed < 0) {
        setError('مبلغ معتبر نیست.')
        return
      }
      const data = await apiPost<DayGuestResponse>('/api/v1/guests', {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        mobile: mobile.trim(),
        agreed_amount_toman: agreed,
        payment_method: method,
        pay_now: payNow,
      })
      setResult(data)
      setFirstName('')
      setLastName('')
      setMobile('')
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ثبت مهمان ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>مهمان روزانه</h1>
      <p className="lead">
        {user.full_name} · عضو موقت + اشتراک یک‌روزه (طرح «مهمان یک‌روزه»)
      </p>
      <p className="hint">
        اگر موبایل از قبل عضو باشد، همان عضو نگه داشته می‌شود و فقط عضویت یک‌روزهٔ جدید اضافه
        می‌شود.
      </p>

      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          نام
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </label>
        <label>
          نام خانوادگی
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
        </label>
        <label>
          موبایل
          <input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            inputMode="tel"
            minLength={10}
            required
          />
        </label>
        <label>
          مبلغ توافقی (تومان)
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          روش پرداخت
          <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={!payNow}>
            {Object.entries(METHOD_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={payNow}
            onChange={(e) => setPayNow(e.target.checked)}
          />{' '}
          پرداخت هم‌اکنون ثبت شود
        </label>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'در حال ثبت…' : 'ثبت مهمان'}
        </button>
      </form>

      {result ? (
        <section className="auth-panel" role="status">
          <p className="ok-msg">{result.message}</p>
          <p>
            {result.member.display_id} — {result.member.first_name} {result.member.last_name} ·{' '}
            {result.member.mobile}
          </p>
          <p>
            عضویت: {result.membership.start_date} → {result.membership.end_date} ·{' '}
            {formatToman(result.membership.agreed_amount_toman)}
            {result.membership.plan_name ? ` · ${result.membership.plan_name}` : ''}
          </p>
          {result.payment ? (
            <p>
              رسید {result.payment.receipt_number}: {formatToman(result.payment.amount_toman)}
            </p>
          ) : (
            <p className="hint">پرداخت ثبت نشد (pay_now خاموش).</p>
          )}
        </section>
      ) : null}

      {error ? (
        <p className="err-msg" role="alert">
          {error}
        </p>
      ) : null}

      <p className="hint">
        <Link to="/trial-leads">صف آزمایشی</Link>
        {' · '}
        <Link to="/members">اعضا</Link>
        {' · '}
        <Link to="/billing">مالی</Link>
        {' · '}
        <Link to="/">خانه</Link>
      </p>
    </main>
  )
}

export function GuestsPage() {
  return <RequireAuth>{(user) => <GuestsContent user={user} />}</RequireAuth>
}
