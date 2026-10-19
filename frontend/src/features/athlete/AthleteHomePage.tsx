import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { ApiError, apiGet, apiPost } from '@/lib/api'
import type {
  AthleteMember,
  AthleteMembership,
  AthleteMembershipsResponse,
  AthleteNotification,
  AthleteNotificationListResponse,
  AthletePayment,
  AthletePaymentsResponse,
  AthleteWorkoutPlan,
  AthleteWorkoutPlansResponse,
} from '@/types/athlete'

function formatToman(n: number): string {
  return `${n.toLocaleString('fa-IR')} تومان`
}

function formatDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fa-IR')
}

export function AthleteHomePage() {
  const [member, setMember] = useState<AthleteMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [memberships, setMemberships] = useState<AthleteMembership[]>([])
  const [debt, setDebt] = useState(0)
  const [payments, setPayments] = useState<AthletePayment[]>([])
  const [plans, setPlans] = useState<AthleteWorkoutPlan[]>([])
  const [notifications, setNotifications] = useState<AthleteNotification[]>([])
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadAll = useCallback(async () => {
    const [me, ms, ps, ws, ns] = await Promise.all([
      apiGet<{ member: AthleteMember }>('/api/v1/athlete/auth/me'),
      apiGet<AthleteMembershipsResponse>('/api/v1/athlete/memberships'),
      apiGet<AthletePaymentsResponse>('/api/v1/athlete/payments'),
      apiGet<AthleteWorkoutPlansResponse>('/api/v1/athlete/workout-plans'),
      apiGet<AthleteNotificationListResponse>('/api/v1/athlete/notifications'),
    ])
    setMember(me.member)
    setMemberships(ms.items)
    setDebt(ms.debt_toman)
    setPayments(ps.items)
    setPlans(ws.items)
    setNotifications(ns.items)
  }, [])

  useEffect(() => {
    void loadAll()
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setMember(null)
        else setError(err instanceof ApiError ? err.message : 'بارگذاری ناموفق')
      })
      .finally(() => setLoading(false))
  }, [loadAll])

  async function onLogout() {
    setBusy(true)
    try {
      await apiPost('/api/v1/athlete/auth/logout')
      setMember(null)
    } catch {
      setError('خروج ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  async function onRenewal(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await apiPost<{ detail: string }>('/api/v1/athlete/renewal-requests', {
        note: note.trim() || null,
      })
      setMessage(res.detail)
      setNote('')
      await loadAll()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ثبت درخواست ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  async function onMarkRead(id: number) {
    try {
      await apiPost(`/api/v1/athlete/notifications/${id}/read`)
      await loadAll()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    }
  }

  if (loading) {
    return (
      <main className="page athlete-page">
        <p className="hint">در حال بررسی ورود ورزشکار…</p>
      </main>
    )
  }

  if (!member) {
    return <Navigate to="/athlete/login" replace />
  }

  return (
    <main className="page athlete-page">
      <p className="eyebrow">GYM CONTROL · پنل ورزشکار</p>
      <h1>
        سلام {member.first_name} {member.last_name}
      </h1>
      <p className="hint">
        {member.display_id} · {member.mobile}
      </p>
      <p className="lead">فقط دادهٔ خودتان را می‌بینید. رزرو کلاس از این پنل نیست.</p>

      {error ? (
        <p className="err-msg" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="ok-msg">{message}</p> : null}

      <section className="billing-block">
        <h2>اشتراک‌ها و بدهی</h2>
        <p className="debt-line">بدهی: {formatToman(debt)}</p>
        <p className="hint">بدهی ≠ درآمد گزارش باشگاه.</p>
        {memberships.length === 0 ? (
          <p className="hint">اشتراکی ثبت نشده.</p>
        ) : (
          <ul className="status-list">
            {memberships.map((m) => (
              <li key={m.id}>
                {m.plan_name ?? `طرح #${m.plan_id}`} · {m.status} · از{' '}
                {formatDate(m.start_date)} تا {formatDate(m.end_date)} ·{' '}
                {formatToman(m.agreed_amount_toman)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="billing-block">
        <h2>پرداخت‌های من</h2>
        {payments.length === 0 ? (
          <p className="hint">پرداختی نیست.</p>
        ) : (
          <ul className="status-list">
            {payments.map((p) => (
              <li key={p.id}>
                {formatToman(p.amount_toman)} · {p.method} · {p.status}
                {p.receipt_number ? ` · ${p.receipt_number}` : ''} ·{' '}
                {formatDate(p.paid_at ?? p.created_at)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="billing-block">
        <h2>برنامه تمرینی (فقط خواندن)</h2>
        {plans.length === 0 ? (
          <p className="hint">برنامه‌ای نیست.</p>
        ) : (
          <ul className="sms-list">
            {plans.map((p) => (
              <li key={p.id} className="sms-card">
                <h3>{p.title}</h3>
                {p.trainer_full_name ? (
                  <p className="hint">مربی: {p.trainer_full_name}</p>
                ) : null}
                {p.body ? <p>{p.body}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="billing-block">
        <h2>درخواست تمدید</h2>
        <p className="hint">
          تمدید خودکار و درگاه آنلاین هنوز آماده نیست — فقط اعلان برای میز ساخته می‌شود.
        </p>
        <form className="auth-form" onSubmit={onRenewal}>
          <label>
            یادداشت (اختیاری)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </label>
          <button type="submit" className="btn" disabled={busy}>
            ارسال درخواست تمدید
          </button>
        </form>
      </section>

      <section className="billing-block">
        <h2>اعلان‌های من</h2>
        {notifications.length === 0 ? (
          <p className="hint">اعلانی نیست.</p>
        ) : (
          <ul className="status-list">
            {notifications.map((n) => (
              <li key={n.id}>
                <strong>{n.title}</strong>
                {n.body ? ` — ${n.body}` : ''}
                {!n.is_read ? (
                  <>
                    {' '}
                    <button type="button" className="linkish" onClick={() => void onMarkRead(n.id)}>
                      خواندم
                    </button>
                  </>
                ) : (
                  <span className="hint"> · خوانده‌شده</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="hint">
        <button type="button" className="btn" onClick={() => void onLogout()} disabled={busy}>
          خروج
        </button>
        {' · '}
        <Link to="/">خانه عمومی</Link>
      </p>
    </main>
  )
}
