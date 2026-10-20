/** Placeholder SMS templates — no real send. */

const TEMPLATES = [
  {
    id: 'welcome',
    title: 'خوش‌آمد',
    body: 'سلام {{name}}، به باشگاه آذر خوش آمدید. کد عضویت شما {{display_id}} است.',
  },
  {
    id: 'expiry',
    title: 'انقضای نزدیک',
    body: '{{name}} عزیز، اشتراک شما تا {{end_date}} فعال است. برای تمدید با منشی تماس بگیرید.',
  },
  {
    id: 'debt',
    title: 'یادآوری بدهی',
    body: '{{name}}، مبلغ بدهی ثبت‌شده شما {{debt}} تومان است. لطفاً پیگیری کنید.',
  },
]

/** @param {HTMLElement} root */
export function mountSmsTemplates(root) {
  root.innerHTML = `
    <article class="panel">
      <header class="panel-head"><h2>قالب پیامک</h2><span class="tag">هنوز آماده نیست</span></header>
      <p class="hint">ارسال واقعی پیامک در این نسخه فعال نیست. دکمهٔ ارسال غیرفعال است.</p>
      <div class="list" data-list></div>
    </article>
  `
  const list = root.querySelector('[data-list]')
  list.innerHTML = TEMPLATES.map(
    (t) => `<div class="row-item"><div>
      <h3>${t.title}</h3>
      <p>${t.body}</p>
    </div>
    <button type="button" class="btn small" disabled title="هنوز آماده نیست">ارسال</button></div>`,
  ).join('')
}
