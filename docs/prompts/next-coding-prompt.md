# پرامپت مرحلهٔ بعد — برای چت سازنده (Agent)

آخرین به‌روزرسانی: ۱۴۰۴-۰۸-۱۹ (2026-11-09) — برش: فعال‌سازی PWA روی فرانت Ocean Dark (MPA + Vite)  
**وضعیت صف:** آمادهٔ کپی برای چت سازنده  
**مجوز محصول:** صاحب صریحاً خواست PWA الان فعال شود (استثنای ADR 0004 / project-rules).

---

کپی از خط بعدی تا پایان بلوک:

```text
تو Agent توسعهٔ پروژهٔ GYM CONTROL هستی. docs را خودت پیدا و بخوان. لیست URL از صاحب نخواه.

## هدف
PWA را روی محصول واقعی `frontend/` (Vite + Ocean Dark MPA، بدون React) فعال کن تا روی موبایل/دسکتاپ قابل **نصب** باشد و UI پوسته را با محدودیت امن کش کند.

صاحب صریحاً این فاز را باز کرد (قبلاً عقب افتاده بود).

## تصمیم محصول / امنیت (اجباری)
- نصب‌پذیر: `manifest.webmanifest` + Service Worker + آیکون‌های کافی.
- **آفلاین کامل برای دادهٔ مالی/عضویت/API ممنوع.** کش فقط برای دارایی‌های استاتیک UI (HTML/CSS/JS/فونت/آیکون). درخواست‌های `/api` باید network-only (یا معادل؛ هرگز cache کردن پاسخ JSON حساس).
- عملیات پول، تمدید، ورود، OTP همیشه آنلاین و سمت سرور بمانند.
- کوکی نشست (`credentials: 'include'`) را نشکن؛ SW نباید auth را دور بزند.
- اپ اندروید بومی نساز.
- کار فقط در `frontend/` (+ docs لازم). HTML ریشهٔ GitHub Pages اولویت نیست مگر favicon/manifest اشارهٔ شکسته بسازد.

## زمینهٔ فنی فعلی
- `frontend/vite.config.ts`: چند ورودی HTML (لندینگ، login، receptionist، manager، trainer، athlete، athleteLogin).
- هنوز `vite-plugin-pwa` / SW در package نیست.
- لوگوی برند در `frontend/public/images/brand/` هست (`logo-mark.svg` / png و apple-touch) — برای آیکون PWA از همین‌ها بساز یا resize کن؛ عکس عضو واقعی نساز.

## داخل محدوده

### ۱) وابستگی و کانفیگ Vite
- `vite-plugin-pwa` (یا راه‌حل معادل Sustained برای Vite 8) اضافه کن.
- برای **MPA**: همهٔ ورودی‌های `build.rollupOptions.input` را در استراتژی precache/navigate درست پوشش بده (fallback معقول؛ 404 اسپای offline برای پنل‌ها نساز که کاربر را گیج کند).
- `registerType` مناسب (مثلاً autoUpdate) با UX فارسی کوتاه اگر آپدیت SW آمد (اختیاری ولی مفید).
- `devOptions` فقط اگر برای تست لوکال لازم است؛ production build باید SW واقعی بسازد.

### ۲) Web App Manifest
- نام: GYM CONTROL؛ short_name کوتاه؛ `lang: fa`؛ `dir: rtl`
- `display: standalone` (یا minimal-ui)
- `start_url` و `scope` منطقی برای اپ باشگاه (پیشنهاد: `/` یا `/login/` — یکی را انتخاب و در گزارش بگو چرا؛ اگر login بهتر است برای «باز شدن مستقیم ورود» همان را بگذار)
- `theme_color` / `background_color` هم‌رنگ Ocean Dark (از CSS variables فعلی الهام بگیر؛ مثلاً آبی تیره + accent)
- icons: حداقل 192 و 512 (PNG)؛ maskable اگر می‌توانی؛ از brand mark موجود بساز
- در HTMLهای اصلی `frontend/` لینک `rel="manifest"` و meta theme-color؛ apple-touch-icon اگر هنوز ناقص است کامل کن

### ۳) Service Worker / کش
- Precache: باندل‌ها و دارایی‌های استاتیک بیلد
- Runtime: فقط استاتیک هم‌مبدأ در صورت نیاز؛ **`/api` را cache نکن**
- اگر پلاگین پیش‌فرض API را هم می‌گیرد، صریحاً exclude کن
- تست ذهنی: قطع شبکه → پوسته ممکن است بیاید؛ لیست اعضا/پرداخت از cache جعلی نشان داده نشود

### ۴) UX نصب (سبک)
- دکمه/بنر بزرگ «نصب اپ» اجباری نیست؛ اگر راحت است یک hint کوچک فارسی در لندینگ یا login که «از منوی مرورگر Install/Add to Home Screen» — بدون شلوغی
- روی iOS محدودیت PWA را در docs یک خط یادآوری کن

### ۵) docs
- ADR 0004: یک بند «۱۴۰۴-۰۸-۱۹ صاحب فاز PWA را باز کرد» + محدودهٔ کش UI-only
- `docs/guides/getting-started.md` یا `deploy.md`: چطور بیلد PWA را لوکال ببینی (`build` + `preview` روی HTTPS/localhost)، و اینکه API همچنان جداست
- `project-rules.md` ردیف PWA: دیگر «صف نیست»؛ وضعیت «در حال فعال‌سازی / انجام‌شده» بعد از لند

### ۶) تست
- vitest یا تست بیلد: وجود manifest در خروجی، یا کانفیگ پلاگین لود می‌شود
- `npm run build` سبز؛ در صورت امکان assert که فایل SW/manifest در `dist` هست
- رگرسیون: پنل‌ها و پروکسی `/api` در dev نشکنند

## خارج محدوده
- Push notification کامل، Background sync مالی، آفلاین CRUD
- TWA / انتشار پلی‌استور
- Slice J، تغییر قوانین کسب‌وکار
- بازنویسی کل UI به React

## تست و تحویل
- build + تست‌های مربوط سبز
- بدون secret در گیت
- طبق قانون Gym: commit + push به origin/main
- به صاحب بگو: کاملاً OK یا ناقص؛ دقیق بگو با `npm run build && npm run preview` چطور Install را در کروم ببیند؛ بگو روی گوشی HTTPS واقعی برای نصب لازم است

## گزارش پایانی
1) پلاگین/مسیر manifest و SW  
2) آیا `/api` کش می‌شود؟ (باید خیر)  
3) start_url و آیکون‌ها  
4) چطور نصب را تست کند  
```
