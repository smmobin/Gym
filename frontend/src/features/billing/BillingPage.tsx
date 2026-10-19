import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { useMemberFileLock } from '@/hooks/useMemberFileLock'
import { ApiError, apiGet, apiPost } from '@/lib/api'
import { lockErrorMessage } from '@/lib/memberLock'
import type { StaffUser } from '@/types/auth'
import type {
  FreezeMembershipResponse,
  MembershipListResponse,
  MembershipPlan,
  MembershipPlanListResponse,
  MembershipRow,
  PaymentListResponse,
  PaymentMethod,
  PaymentMutationResponse,
  PaymentRow,
  RenewMembershipResponse,
} from '@/types/billing'
import type { Member, MemberListResponse } from '@/types/members'

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'نقدی',
  pos: 'کارت‌خوان',
  transfer: 'انتقال',
  online: 'آنلاین (بدون درگاه)',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'فعال',
  pending: 'در انتظار',
  frozen: 'توقف',
  expired: 'منقضی',
  cancelled: 'لغو',
  paid: 'پرداخت‌شده',
  refunded: 'برگشت‌خورده',
}

function formatToman(n: number): string {
  return `${n.toLocaleString('fa-IR')} تومان`
}

function BillingContent({ user }: { user: StaffUser }) {
  const isDesk = user.role === 'manager' || user.role === 'receptionist'
  const [q, setQ] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [selected, setSelected] = useState<Member | null>(null)
  const [plans, setPlans] = useState<MembershipPlan[]>([])
  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [debt, setDebt] = useState(0)
  const [freezeRemaining, setFreezeRemaining] = useState(14)
  const [freezeCap, setFreezeCap] = useState(14)
  const [freezeDays, setFreezeDays] = useState('3')
  const [freezeTargetId, setFreezeTargetId] = useState<number | ''>('')

  const [planId, setPlanId] = useState<number | ''>('')
  const [agreed, setAgreed] = useState('')
  const [baseMembershipId, setBaseMembershipId] = useState<number | ''>('')

  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [payMembershipId, setPayMembershipId] = useState<number | ''>('')
  const [printPayment, setPrintPayment] = useState<PaymentRow | null>(null)

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const {
    lock,
    lockError,
    lockHeldByMe,
    busy: lockBusy,
    release: releaseLock,
  } = useMemberFileLock(selected?.id ?? null)

  const loadPlans = useCallback(async () => {
    if (!isDesk) return
    const data = await apiGet<MembershipPlanListResponse>('/api/v1/membership-plans')
    setPlans(data.items)
    if (data.items.length && planId === '') {
      setPlanId(data.items[0].id)
      setAgreed(String(data.items[0].base_price_toman))
    }
  }, [isDesk, planId])

  const loadMemberFinance = useCallback(async (memberId: number) => {
    const [ms, ps] = await Promise.all([
      apiGet<MembershipListResponse>(`/api/v1/members/${memberId}/memberships`),
      apiGet<PaymentListResponse>(`/api/v1/members/${memberId}/payments`),
    ])
    setMemberships(ms.items)
    setPayments(ps.items)
    setDebt(ms.debt_toman)
    setFreezeCap(ms.freeze_annual_cap_days ?? 14)
    setFreezeRemaining(ms.remaining_freeze_days_this_year ?? 14)
    if (ms.items.length) {
      setBaseMembershipId(ms.items[0].id)
      setPayMembershipId(ms.items[0].id)
      const active = ms.items.find((row) => row.status === 'active')
      const frozen = ms.items.find((row) => row.status === 'frozen')
      setFreezeTargetId((frozen ?? active ?? ms.items[0]).id)
    } else {
      setBaseMembershipId('')
      setPayMembershipId('')
      setFreezeTargetId('')
    }
  }, [])

  useEffect(() => {
    void loadPlans().catch(() => setError('بارگذاری طرح‌ها ناموفق بود.'))
  }, [loadPlans])

  async function onSearch(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const data = await apiGet<MemberListResponse>(`/api/v1/members?${params.toString()}`)
      setMembers(data.items)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('جستجوی عضو ناموفق بود.')
    }
  }

  async function selectMember(member: Member) {
    setSelected(member)
    setMessage(null)
    setError(null)
    setPrintPayment(null)
    try {
      await loadMemberFinance(member.id)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('بارگذاری مالی عضو ناموفق بود.')
    }
  }

  async function onRenew(event: FormEvent) {
    event.preventDefault()
    if (!selected || planId === '') return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const agreedNum = Number(agreed)
      if (!Number.isFinite(agreedNum) || agreedNum < 0) {
        setError('مبلغ توافقی معتبر نیست.')
        return
      }
      const body: Record<string, unknown> = {
        plan_id: planId,
        agreed_amount_toman: agreedNum,
      }
      if (baseMembershipId !== '') body.base_membership_id = baseMembershipId
      const data = await apiPost<RenewMembershipResponse>(
        `/api/v1/members/${selected.id}/memberships/renew`,
        body,
      )
      setMessage(
        `تمدید ثبت شد از ${data.membership.start_date} تا ${data.membership.end_date}. بدهی: ${formatToman(data.debt_toman)}`,
      )
      await loadMemberFinance(selected.id)
    } catch (err) {
      setError(lockErrorMessage(err, 'تمدید ناموفق بود.'))
    } finally {
      setBusy(false)
    }
  }

  async function onPay(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const amount = Number(payAmount)
      if (!Number.isFinite(amount) || amount < 0) {
        setError('مبلغ پرداخت معتبر نیست.')
        return
      }
      const body: Record<string, unknown> = {
        member_id: selected.id,
        amount_toman: amount,
        method: payMethod,
        status: 'paid',
      }
      if (payMembershipId !== '') body.membership_id = payMembershipId
      const data = await apiPost<PaymentMutationResponse>('/api/v1/payments', body)
      setMessage(`پرداخت ${data.payment.receipt_number} ثبت شد. بدهی: ${formatToman(data.debt_toman)}`)
      setPrintPayment(data.payment)
      setPayAmount('')
      await loadMemberFinance(selected.id)
    } catch (err) {
      setError(lockErrorMessage(err, 'ثبت پرداخت ناموفق بود.'))
    } finally {
      setBusy(false)
    }
  }

  async function onFreeze(event: FormEvent) {
    event.preventDefault()
    if (!selected || freezeTargetId === '') return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const days = Number(freezeDays)
      if (!Number.isFinite(days) || days < 1) {
        setError('تعداد روز توقف معتبر نیست.')
        return
      }
      const data = await apiPost<FreezeMembershipResponse>(
        `/api/v1/memberships/${freezeTargetId}/freeze`,
        { days },
      )
      setFreezeRemaining(data.remaining_freeze_days_this_year)
      setMessage(
        `توقف ثبت شد تا ${data.membership.freeze_ends_at}. پایان عضویت الان ${data.membership.end_date}. باقی سقف: ${data.remaining_freeze_days_this_year} روز.`,
      )
      await loadMemberFinance(selected.id)
    } catch (err) {
      setError(lockErrorMessage(err, 'توقف عضویت ناموفق بود.'))
    } finally {
      setBusy(false)
    }
  }

  async function onUnfreeze(membershipId: number) {
    if (!selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const data = await apiPost<FreezeMembershipResponse>(
        `/api/v1/memberships/${membershipId}/unfreeze`,
      )
      setFreezeRemaining(data.remaining_freeze_days_this_year)
      setMessage(`توقف پایان یافت. وضعیت: فعال. باقی سقف: ${data.remaining_freeze_days_this_year} روز.`)
      await loadMemberFinance(selected.id)
    } catch (err) {
      setError(lockErrorMessage(err, 'پایان توقف ناموفق بود.'))
    } finally {
      setBusy(false)
    }
  }

  async function onRefund(paymentId: number) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const data = await apiPost<PaymentMutationResponse>(`/api/v1/payments/${paymentId}/refund`)
      setMessage(`برگشت ${data.payment.receipt_number} ثبت شد. بدهی: ${formatToman(data.debt_toman)}`)
      setPrintPayment(data.payment)
      if (selected) await loadMemberFinance(selected.id)
    } catch (err) {
      setError(lockErrorMessage(err, 'برگشت ناموفق بود.'))
    } finally {
      setBusy(false)
    }
  }

  function onPlanChange(id: number) {
    setPlanId(id)
    const plan = plans.find((p) => p.id === id)
    if (plan) setAgreed(String(plan.base_price_toman))
  }

  if (!isDesk) {
    return (
      <main className="page">
        <p className="eyebrow">GYM CONTROL</p>
        <h1>مالی و تمدید</h1>
        <p className="lead">این بخش فقط برای مدیر و منشی است.</p>
        <p className="hint">
          <Link to="/">خانه</Link>
        </p>
      </main>
    )
  }

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>مالی و تمدید</h1>
      <p className="lead">
        {user.full_name} · تمدید اشتراک، ثبت پرداخت، برگشت و چاپ رسید
      </p>

      <form className="auth-form" onSubmit={onSearch}>
        <label>
          جستجوی عضو
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام یا موبایل" />
        </label>
        <button type="submit" className="btn" disabled={busy}>
          جستجو
        </button>
      </form>

      {members.length > 0 && (
        <ul className="status-list">
          {members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="linkish"
                onClick={() => void selectMember(m)}
                disabled={busy}
              >
                {m.display_id} — {m.first_name} {m.last_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <section className="billing-block">
          <h2>
            {selected.display_id} — {selected.first_name} {selected.last_name}
          </h2>
          <p className="debt-line">بدهی فعلی: {formatToman(debt)}</p>
          <div className="lock-banner" role="status">
            {lockBusy ? (
              <p className="hint">در حال گرفتن قفل پرونده…</p>
            ) : lockHeldByMe ? (
              <p className="ok-msg">
                قفل پرونده دست شماست
                {lock?.expires_at
                  ? ` تا ${new Date(lock.expires_at).toLocaleString('fa-IR')}`
                  : ''}
                .{' '}
                <button
                  type="button"
                  className="linkish"
                  disabled={busy}
                  onClick={() => void releaseLock()}
                >
                  آزادسازی قفل
                </button>
              </p>
            ) : lockError ? (
              <p className="err-msg">{lockError}</p>
            ) : lock?.locked ? (
              <p className="err-msg">
                قفل دست {lock.locked_by_name ?? 'کاربر دیگر'}
                {lock.locked_by_mobile ? ` (${lock.locked_by_mobile})` : ''} است
                {lock.expires_at
                  ? ` — انقضا: ${new Date(lock.expires_at).toLocaleString('fa-IR')}`
                  : ''}
                .
              </p>
            ) : (
              <p className="hint">قفل فعالی نیست؛ برای کار هم‌زمان توصیه می‌شود قفل بگیرید.</p>
            )}
          </div>

          <h3>عضویت‌ها</h3>
          <p className="hint">
            سقف توقف سالانه: {freezeRemaining.toLocaleString('fa-IR')} از{' '}
            {freezeCap.toLocaleString('fa-IR')} روز باقی مانده
          </p>
          <ul className="status-list">
            {memberships.length === 0 && <li>عضویتی نیست.</li>}
            {memberships.map((m) => (
              <li key={m.id}>
                #{m.id} · {m.plan_name ?? `طرح ${m.plan_id}`} · {formatToman(m.agreed_amount_toman)} ·{' '}
                {m.start_date} → {m.end_date} · {STATUS_LABEL[m.status] ?? m.status}
                {m.status === 'frozen' ? (
                  <>
                    {' '}
                    (تا {m.freeze_ends_at}){' '}
                    <button
                      type="button"
                      className="linkish"
                      disabled={busy || !lockHeldByMe}
                      onClick={() => void onUnfreeze(m.id)}
                    >
                      پایان توقف
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>

          <form className="auth-form" onSubmit={onFreeze}>
            <h3>توقف عضویت (freeze)</h3>
            <p className="hint">
              روزهای توقف به پایان عضویت اضافه می‌شوند تا نسوزند. ورود با عضویت متوقف‌شده ممنوع است.
            </p>
            <label>
              عضویت فعال
              <select
                value={freezeTargetId}
                onChange={(e) =>
                  setFreezeTargetId(e.target.value ? Number(e.target.value) : '')
                }
              >
                <option value="">انتخاب کنید</option>
                {memberships
                  .filter((m) => m.status === 'active')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      #{m.id} · {m.plan_name ?? m.plan_id} تا {m.end_date}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              تعداد روز توقف
              <input
                type="number"
                min={1}
                max={freezeRemaining || 1}
                value={freezeDays}
                onChange={(e) => setFreezeDays(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn"
              disabled={busy || !lockHeldByMe || freezeRemaining < 1}
            >
              ثبت توقف
            </button>
          </form>

          <form className="auth-form" onSubmit={onRenew}>
            <h3>تمدید</h3>
            <label>
              طرح
              <select
                value={planId}
                onChange={(e) => onPlanChange(Number(e.target.value))}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatToman(p.base_price_toman)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              مبلغ توافقی (تومان)
              <input
                type="number"
                min={0}
                value={agreed}
                onChange={(e) => setAgreed(e.target.value)}
              />
            </label>
            <label>
              اشتراک مرجع (تمدید از پایان آن)
              <select
                value={baseMembershipId}
                onChange={(e) =>
                  setBaseMembershipId(e.target.value ? Number(e.target.value) : '')
                }
              >
                <option value="">خودکار (آخرین پایان)</option>
                {memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    #{m.id} تا {m.end_date}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn" disabled={busy}>
              ثبت تمدید
            </button>
          </form>

          <form className="auth-form" onSubmit={onPay}>
            <h3>ثبت پرداخت</h3>
            <label>
              مبلغ (تومان)
              <input
                type="number"
                min={0}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />
            </label>
            <label>
              روش
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              >
                {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((key) => (
                  <option key={key} value={key}>
                    {METHOD_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">
              پرداخت آنلاین / درگاه: هنوز آماده نیست — به درگاه بانکی وصل نیست؛ انتخاب «آنلاین» فقط روش را
              ثبت می‌کند و معمولاً همان لحظه paid می‌شود.
            </p>
            <label>
              عضویت مرتبط
              <select
                value={payMembershipId}
                onChange={(e) =>
                  setPayMembershipId(e.target.value ? Number(e.target.value) : '')
                }
              >
                <option value="">بدون پیوند مستقیم</option>
                {memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    #{m.id} · {formatToman(m.agreed_amount_toman)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn" disabled={busy}>
              ثبت پرداخت
            </button>
          </form>

          <h3>پرداخت‌ها</h3>
          <ul className="status-list">
            {payments.length === 0 && <li>پرداختی نیست.</li>}
            {payments.map((p) => (
              <li key={p.id}>
                {p.receipt_number} · {formatToman(p.amount_toman)} ·{' '}
                {METHOD_LABEL[p.method as PaymentMethod] ?? p.method} ·{' '}
                {STATUS_LABEL[p.status] ?? p.status}{' '}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => setPrintPayment(p)}
                >
                  چاپ
                </button>
                {p.status === 'paid' && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="linkish"
                      disabled={busy}
                      onClick={() => void onRefund(p.id)}
                    >
                      برگشت
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {printPayment && (
        <section className="receipt-print" id="receipt-print">
          <h2>رسید {printPayment.receipt_number}</h2>
          <p>عضو: {selected?.display_id} — {selected?.first_name} {selected?.last_name}</p>
          <p>مبلغ: {formatToman(printPayment.amount_toman)}</p>
          <p>روش: {METHOD_LABEL[printPayment.method as PaymentMethod] ?? printPayment.method}</p>
          <p>وضعیت: {STATUS_LABEL[printPayment.status] ?? printPayment.status}</p>
          <button type="button" className="btn" onClick={() => window.print()}>
            چاپ رسید
          </button>
        </section>
      )}

      {message && <p className="ok-msg">{message}</p>}
      {error && <p className="err-msg">{error}</p>}

      <p className="hint">
        <Link to="/">خانه</Link>
        {' · '}
        <Link to="/members">اعضا</Link>
        {' · '}
        <Link to="/attendance">حضور</Link>
      </p>
    </main>
  )
}

export function BillingPage() {
  return (
    <RequireAuth>
      {(user) => <BillingContent user={user} />}
    </RequireAuth>
  )
}
