import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { ApiError, apiGet, apiPost } from '@/lib/api'
import type { StaffUser } from '@/types/auth'
import type {
  ExpenseCategory,
  ExpenseListResponse,
  ExpenseRow,
  ProfitReportResponse,
} from '@/types/reports'

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  rent: 'اجاره',
  salary: 'حقوق',
  purchase: 'خرید',
  utilities: 'قبوض',
  other: 'سایر',
}

function formatToman(n: number): string {
  return `${n.toLocaleString('fa-IR')} تومان`
}

function monthBoundsIso(): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(y, m + 1, 0).getDate()
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  }
}

function ReportsContent({ user }: { user: StaffUser }) {
  const isManager = user.role === 'manager'
  const defaults = monthBoundsIso()
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [profit, setProfit] = useState<ProfitReportResponse | null>(null)
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [category, setCategory] = useState<ExpenseCategory>('other')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(defaults.to)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ from, to })
    const [p, e] = await Promise.all([
      apiGet<ProfitReportResponse>(`/api/v1/reports/profit?${params}`),
      apiGet<ExpenseListResponse>(`/api/v1/expenses?${params}`),
    ])
    setProfit(p)
    setExpenses(e.items)
  }, [from, to])

  useEffect(() => {
    if (!isManager) return
    void load().catch((err) => {
      if (err instanceof ApiError) setError(err.message)
      else setError('بارگذاری گزارش ناموفق بود.')
    })
  }, [isManager, load])

  if (!isManager) {
    return (
      <main className="page">
        <p className="eyebrow">GYM CONTROL</p>
        <h1>گزارش هزینه و سود</h1>
        <p className="err-msg" role="alert">
          این صفحه فقط برای مدیر است. منشی و مربی دسترسی ندارند.
        </p>
        <p className="hint">
          <Link to="/">خانه</Link>
          {' · '}
          <Link to="/billing">مالی میز</Link>
        </p>
      </main>
    )
  }

  async function onFilter(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      await load()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('بارگذاری گزارش ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const amountNum = Number(amount)
      if (!Number.isFinite(amountNum) || amountNum < 0) {
        setError('مبلغ معتبر نیست.')
        return
      }
      await apiPost('/api/v1/expenses', {
        category,
        amount_toman: amountNum,
        expense_date: expenseDate,
        note: note.trim() || null,
      })
      setMessage('هزینه ثبت شد.')
      setAmount('')
      setNote('')
      await load()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('ثبت هزینه ناموفق بود.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">GYM CONTROL</p>
      <h1>گزارش هزینه و سود</h1>
      <p className="lead">
        {user.full_name} · فقط مدیر · درآمد = پرداخت‌های paid (بدهی ≠ درآمد)
      </p>

      <form className="auth-form" onSubmit={onFilter}>
        <h2 className="form-title">بازه تاریخ</h2>
        <p className="hint">تاریخ‌ها به صورت میلادی (ISO) در فیلد مرورگر؛ پیش‌فرض ماه جاری محلی.</p>
        <label>
          از
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label>
          تا
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </label>
        <button type="submit" className="btn" disabled={busy}>
          اعمال بازه
        </button>
      </form>

      {profit ? (
        <section className="auth-panel" aria-label="خلاصه سود">
          <ul className="status-list">
            <li>
              درآمد (پرداخت‌شده): <strong>{formatToman(profit.income_paid_toman)}</strong>
            </li>
            <li>
              هزینه‌ها: <strong>{formatToman(profit.expenses_toman)}</strong>
            </li>
            <li>
              سود نمایشی: <strong>{formatToman(profit.profit_toman)}</strong>
            </li>
          </ul>
          <p className="hint">{profit.note}</p>
        </section>
      ) : null}

      <form className="auth-form" onSubmit={onCreate}>
        <h2 className="form-title">ثبت هزینه</h2>
        <label>
          دسته
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          >
            {(Object.keys(CATEGORY_LABEL) as ExpenseCategory[]).map((key) => (
              <option key={key} value={key}>
                {CATEGORY_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
        <label>
          مبلغ (تومان)
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          تاریخ هزینه
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
          />
        </label>
        <label>
          یادداشت (اختیاری)
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={busy}>
          ثبت هزینه
        </button>
      </form>

      <section className="auth-panel">
        <h2 className="form-title">لیست هزینه‌ها</h2>
        <ul className="status-list">
          {expenses.length === 0 ? <li>در این بازه هزینه‌ای نیست.</li> : null}
          {expenses.map((row) => (
            <li key={row.id}>
              {row.expense_date} ·{' '}
              {CATEGORY_LABEL[row.category as ExpenseCategory] ?? row.category} ·{' '}
              {formatToman(row.amount_toman)}
              {row.note ? ` — ${row.note}` : ''}
            </li>
          ))}
        </ul>
      </section>

      {message ? <p className="ok-msg">{message}</p> : null}
      {error ? (
        <p className="err-msg" role="alert">
          {error}
        </p>
      ) : null}

      <p className="hint">
        <Link to="/">خانه</Link>
        {' · '}
        <Link to="/billing">مالی میز</Link>
      </p>
    </main>
  )
}

export function ReportsPage() {
  return <RequireAuth>{(user) => <ReportsContent user={user} />}</RequireAuth>
}
