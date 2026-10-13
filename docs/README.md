# مستندات GYM CONTROL

این پوشه **منبع حقیقت** مستندات پروژه است. از این به بعد هر توضیح محصولی، فنی، یا تصمیم معماری اینجا ثبت می‌شود — نه پراکنده در ریشهٔ ریپو (به‌جز `README.md` کوتاه گیت‌هاب).

## فهرست

| مسیر | موضوع |
|------|--------|
| [product/gym-control-prototype.md](product/gym-control-prototype.md) | مشخصات کامل پروتوتایپ محصول (نقش‌ها، صفحات، مدل دادهٔ نمونه) |
| [adr/README.md](adr/README.md) | ADR چیست + فهرست تصمیم‌های معماری |
| [adr/0001-frontend-stack.md](adr/0001-frontend-stack.md) | انتخاب فرانت‌اند |
| [adr/0002-backend-stack.md](adr/0002-backend-stack.md) | انتخاب بک‌اند (و نظر دربارهٔ پایتون) |
| [adr/0003-database.md](adr/0003-database.md) | انتخاب دیتابیس |
| [adr/0004-delivery-and-pwa.md](adr/0004-delivery-and-pwa.md) | سایت اول، PWA بعداً، بدون اپ اندروید بومی |
| [guides/dev-toolchain-setup.md](guides/dev-toolchain-setup.md) | نصب Node / Python / PostgreSQL روی ویندوز |

## قرارداد نوشتن

1. سند محصولی → `docs/product/`
2. تصمیم معماری → `docs/adr/` با شمارهٔ ترتیبی (`0005-...`)
3. راهنمای توسعه / استقرار → در صورت نیاز `docs/guides/`
4. وضعیت ADR: `Proposed` (پیشنهاد) یا `Accepted` (پذیرفته‌شده) یا `Superseded` (جایگزین‌شده)
