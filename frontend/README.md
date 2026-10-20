# GYM CONTROL — فرانت Ocean Dark (MPA)

فرانت عملیاتی محصول: **HTML + CSS + JS** با تم Ocean Dark، بدون React.

## اجرا

```powershell
npm install
npm run dev
```

با پروکسی `/api` به بک‌اند `127.0.0.1:8000`.

## صفحات

| مسیر | نقش |
|------|-----|
| `/` | لندینگ + فرم جلسه آزمایشی واقعی |
| `/login/` | ورود یکپارچه (موبایل+رمز؛ بدون انتخاب نقش) |
| `/receptionist/` | پنل منشی (فقط نقش منشی) |
| `/manager/` | پنل مدیر (+ گزارش) |
| `/trainer/` | پنل مربی (فقط شاگردان خودش) |
| `/athlete/` | داشبورد ورزشکار |
| `/athlete/login.html` | ریدایرکت به `/login/` |

## تست و بیلد

```powershell
npm test
npm run build
```
