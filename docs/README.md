# مستندات GYM CONTROL

این پوشه **منبع حقیقت** مستندات پروژه است. از این به بعد هر توضیح محصولی، فنی، یا تصمیم معماری اینجا ثبت می‌شود — نه پراکنده در ریشهٔ ریپو (به‌جز `README.md` کوتاه گیت‌هاب).

## فهرست

| مسیر | موضوع |
|------|--------|
| [product/gym-control-prototype.md](product/gym-control-prototype.md) | مشخصات کامل پروتوتایپ محصول (نقش‌ها، صفحات، مدل دادهٔ نمونه) |
| [product/business-rules.md](product/business-rules.md) | قوانین کسب‌وکار نسخهٔ عملیاتی (منبع حقیقت رفتار؛ مقدم بر پروتوتایپ) |
| [product/roadmap-status.md](product/roadmap-status.md) | الان کجاییم و مرحلهٔ بعد چیست (سند زندهٔ مدیر محصول) |
| [product/schema-todos.md](product/schema-todos.md) | TODOهای باز مدل داده (قفل پرونده، خروج خودکار، …) |
| [prompts/next-coding-prompt.md](prompts/next-coding-prompt.md) | پرامپت C سازنده: پیامک واقعی (A و B انجام شده) |
| [guides/product-manager.md](guides/product-manager.md) | چطور چت مدیر محصول را راه بیندازی |
| [guides/principled-project-playbook.md](guides/principled-project-playbook.md) | الگوی کامل قابل‌تکرار: پروتوتایپ، docs، مشخصات، ساختار، تست، برش‌ها، دیپلوی |
| [adr/README.md](adr/README.md) | ADR چیست + فهرست تصمیم‌های معماری |
| [adr/0001-frontend-stack.md](adr/0001-frontend-stack.md) | فرانت React (Superseded) |
| [adr/0005-frontend-ocean-dark-mpa.md](adr/0005-frontend-ocean-dark-mpa.md) | فرانت Ocean Dark MPA (فعلی) |
| [adr/0002-backend-stack.md](adr/0002-backend-stack.md) | انتخاب بک‌اند (و نظر دربارهٔ پایتون) |
| [adr/0003-database.md](adr/0003-database.md) | انتخاب دیتابیس |
| [adr/0004-delivery-and-pwa.md](adr/0004-delivery-and-pwa.md) | سایت اول، PWA بعداً، بدون اپ اندروید بومی |
| [guides/dev-toolchain-setup.md](guides/dev-toolchain-setup.md) | نصب Node / Python / PostgreSQL روی ویندوز |
| [guides/getting-started.md](guides/getting-started.md) | اسکلت فرانت/بک و دستور اجرای توسعه |
| [guides/deploy.md](guides/deploy.md) | استقرار واقعی: لیارا / VPS، HTTPS، env، چک‌لیست prod |
| [guides/backup.md](guides/backup.md) | بکاپ و restore Postgres (هفتگی + تمرین یک‌بار) |
| [guides/collaboration.md](guides/collaboration.md) | سبک همکاری vibe coding، مستندسازی، توضیح مفاهیم |
| [guides/testing.md](guides/testing.md) | تست خودکار؛ فقط با تست سبز commit/push |
| [guides/project-rules.md](guides/project-rules.md) | قوانین رسمی: DoD، مرز پروتوتایپ، پول، API، audit |
| [guides/security.md](guides/security.md) | امنیت، OWASP، ابزارها و پلتفرم‌های اسکن |

## قرارداد نوشتن

1. سند محصولی → `docs/product/`
2. تصمیم معماری → `docs/adr/` با شمارهٔ ترتیبی (`0005-...`)
3. راهنمای توسعه / استقرار → در صورت نیاز `docs/guides/`
4. وضعیت ADR: `Proposed` (پیشنهاد) یا `Accepted` (پذیرفته‌شده) یا `Superseded` (جایگزین‌شده)
