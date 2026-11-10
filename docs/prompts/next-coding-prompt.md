# پرامپت مرحلهٔ بعد — برای چت سازنده (Agent)

آخرین به‌روزرسانی: ۱۴۰۴-۰۸-۲۱ (2026-11-11)  
**وضعیت صف:** فیکس UI پنل سازنده — **بلوک JSON جزئیات (`pre.dev-precise-payload`) برای همهٔ ردیف‌های «فعالیت دقیق»**  
**خارج از این برش:** شلوغ کردن `/manager/#activity` با payload — ممنوع

---

## پرامپت کامل — کپی در چت سازنده

```text
تو Agent توسعهٔ GYM CONTROL هستی. docs را خودت پیدا کن (guides/logging.md، product/roadmap-status.md). لیست URL نخواه.

## مشکل
در `/dev-logs/#activity` بخش «فعالیت سامانه — نسخهٔ دقیق»، بلوک `<pre class="dev-precise-payload">` فقط وقتی نشان داده می‌شود که `item.payload` در DB یک dict باشد. خیلی از رویدادهای آدیت/خطا payload خالی دارند → ردیف بدون آن JSON لیست می‌آید. صاحب می‌خواهد **برای تمامی لاگ‌های این لیست** همان بلوک جزئیات JSON دیده شود (مثل نمونهٔ login failure با kind/role/method/reason/…).

پنل مدیر `/manager/#activity` باید بدون payload خام بماند (همان as_dict فعلی).

## کار
1. در مسیر precise (ترجیحاً بک‌اند `ActivityItem.as_precise_dict` یا هلپر مشترک + فرانت به‌عنوان پشتیبان):
   - همیشه یک شیء `detail` / `payload` غیرخالی برای UI برگردان.
   - اگر `audit_logs.payload` dict دارد → همان را بعد از `redact_mapping` بگذار.
   - اگر ندارد یا خالی است → از فیلدهای موجود بساز، مثلاً:
     `action`, `source`, `category`, `outcome`, `entity_type`, `entity_id`, `request_id`, `actor_name`, `actor_role`, `method`, `path`, `status_code`, `error_type`, و در صورت نیاز خلاصهٔ کوتاه.
   - برای رویدادهای `system_error_events` هم همین: حداقل method/path/status_code/error_type/request_id.
2. فرانت `preciseRow` در `panels/dev-logs.js`: همیشه `<pre class="dev-precise-payload">` رندر کند (هرگز رشتهٔ خالی به‌خاطر نبود payload). اگر API هنوز null داد، از همین فیلدهای ردیف شیء بساز تا UI نشکند.
3. `/manager/#activity` و API مدیر را عوض نکن — payload به کلاینت مدیر نرود.
4. تست:
   - pytest: precise activity حداقل یک ردیف بدون payload ذخیره‌شده هم در پاسخ `payload` یا `detail` object غیرnull دارد.
   - vitest: ردیف بدون payload خام هم بلوک pre را نشان می‌دهد.
5. docs/logging یک خط: در بینندهٔ سازنده هر ردیف فعالیت دقیق همیشه JSON جزئیات دارد؛ مدیر خلاصه است.

## خارج محدوده
- نشان دادن این JSON در پنل مدیر
- بازنویسی همهٔ write_auditهای تاریخچه (اختیاری: فقط اگر راحت بود برای رویدادهای جدید payload غنی‌تر بنویس؛ الزامی نیست اگر synthetic detail کافی است)
- تغییر توکن/گیت DEV_LOG_VIEWER

## تحویل
تست سبز → commit/push → بگو کاملاً OK؛ یک اسکرین/توضیح که همهٔ ردیف‌ها pre دارند.
```
