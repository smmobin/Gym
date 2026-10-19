import { Link } from 'react-router-dom'

import { RequireAuth } from '@/features/auth/RequireAuth'
import { NotificationBell } from '@/features/shell/NotificationBell'
import type { StaffUser } from '@/types/auth'

const TEMPLATES = [
  {
    id: 'welcome',
    title: 'خوش‌آمد',
    body: 'سلام {نام}، به باشگاه آذر خوش آمدید. برای تمدید با میز تماس بگیرید.',
  },
  {
    id: 'expiry',
    title: 'هشدار انقضا',
    body: 'سلام {نام}، اشتراک شما تا {تاریخ} فعال است. برای تمدید به میز مراجعه کنید.',
  },
  {
    id: 'debt',
    title: 'یادآوری بدهی',
    body: 'سلام {نام}، ماندهٔ حساب شما {مبلغ} تومان است. بدهی با درآمد گزارش یکی نیست.',
  },
]

function SmsContent({ user }: { user: StaffUser }) {
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">GYM CONTROL</p>
          <h1>قالب پیامک</h1>
        </div>
        <NotificationBell />
      </div>
      <p className="lead">
        فقط پیش‌نمایش قالب. ارسال واقعی هنوز آماده نیست — بدون SDK و بدون کلید در گیت.
      </p>
      <p className="hint">وارد شده: {user.full_name}</p>

      <ul className="sms-list">
        {TEMPLATES.map((t) => (
          <li key={t.id} className="sms-card">
            <h2>{t.title}</h2>
            <p>{t.body}</p>
            <button type="button" className="btn" disabled>
              ارسال
            </button>
            <p className="err-msg" role="note">
              هنوز آماده نیست
            </p>
          </li>
        ))}
      </ul>

      <p className="hint">
        <Link to="/">خانه</Link>
        {' · '}
        {user.role === 'manager' ? (
          <>
            <Link to="/settings">تنظیمات</Link>
            {' · '}
          </>
        ) : null}
        <Link to="/trial-leads">صف آزمایشی</Link>
      </p>
    </main>
  )
}

export function SmsTemplatesPage() {
  return <RequireAuth>{(user) => <SmsContent user={user} />}</RequireAuth>
}
