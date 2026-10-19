# TODOهای باز مدل داده (نسخهٔ اول)

مواردی که جدول/فیلد دارند ولی منطق کامل محصول هنوز مرحلهٔ بعد است:

| موضوع | وضعیت مدل | کار بعدی |
|--------|-----------|----------|
| قفل پروندهٔ عضو (۵ دقیقه) | جدول `member_file_locks` | **انجام‌شده:** acquire/touch/unlock/status؛ TTL ۵دقیقه از `last_seen_at`؛ soft-enforce روی PATCH عضو / تمدید / پرداخت / برگشت / check-in؛ UI در `/billing` و `/attendance` و ویرایش `/members` |
| خروج خودکار پایان روز | فیلد `day_end_time` + منطق در سرویس حضور | **انجام‌شده در مسیر API** (بدون کرون جدا): هنگام check-in و `GET /attendances/today` حضورهای باز منقضی بسته می‌شوند. کرون/job جدا اختیاری برای آینده |
| شمارهٔ رسید خودکار | فیلد `receipt_number` یکتا | **انجام‌شده:** تولید ترتیبی `R-1001…` در سرویس پرداخت (`next_receipt_number`) |
| یکتایی واگذاری فعال کمد | تاریخچه با `released_at` | **انجام‌شده با چک سرویس** (`active_assignment_for_locker` / عضو) در برش کمد؛ قید جزئی Postgres اختیاری برای آینده |
| چند مربی فعال هم‌زمان | ردیف‌های `ended_at IS NULL` | **انجام‌شده با چک سرویس** (تکرار جفت فعال → ۴۰۹؛ چند مربی مختلف OK). ایندکس جزئی unique روی `(trainer_user_id, member_id) WHERE ended_at IS NULL` اختیاری برای آینده |
| مصرف جلسه برای غیبت کلاس | `sessions_remaining` + وضعیت `no_show`/`attended` | **انجام‌شده:** `POST …/bookings/{id}/no-show` و `…/attended`؛ جلوگیری از double-deduct با حضور `type=class` هم‌پنجره؛ ابهام بسته → `membership_required` + `membership_id`. فیلد جدا روی booking لازم نشد |
| اعلان کارکنان | `staff_notifications` + `staff_notification_reads` | **انجام‌شده (v1):** اعلان سراسری desk + خوانده‌شده per-user؛ trial رویداد؛ انقضا/بدهی روی GET بدون کرون؛ renewal فقط seed تا لاگین ورزشکار |
| تنظیمات باشگاه | جدول `gym_settings` از اول | **انجام‌شده:** `GET/PATCH /gym-settings`؛ attendance از قبل `day_end_time` را می‌خواند |
| لاگین ورزشکار | `members.password_hash` + `athlete_sessions` + `athlete_notifications` | **انجام‌شده:** cookie `gym_athlete_session` جدا از staff؛ API `/athlete/*` فقط دادهٔ خودش؛ رمز توسط desk؛ بدون OTP/پیامک |

این فایل فقط یادآور است؛ migration اول را بلاک نمی‌کند.
