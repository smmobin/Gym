# بکاپ و بازیابی Postgres — GYM CONTROL

**قانون پروژه:** قبل از وارد کردن دادهٔ واقعی عضو، بکاپ هفتگی + **یک‌بار** تمرین restore انجام شود. فایل dump را فقط روی لپ‌تاپ نگه ندار — کپی دوم روی دیسک خارجی / فضای ابری رمزدار / سرور جدا.

اسکریپت‌ها: `backend/scripts/backup_db.py` و `restore_db.py` (+ `.ps1` / `.sh`).

خروجی پیش‌فرض: پوشهٔ `<ریپو>/backups/` (در `.gitignore` است). بهتر است `BACKUP_DIR` را به مسیری **خارج از ریپو** بگذاری.

---

## پیش‌نیاز

- `DATABASE_URL` در `backend/.env` (یا محیط)
- ابزارهای کلاینت Postgres در PATH: `pg_dump` / `pg_restore`  
  روی ویندوز معمولاً: `C:\Program Files\PostgreSQL\17\bin\`  
  یا متغیر `PG_DUMP_PATH` / `PG_RESTORE_PATH`

---

## بکاپ (دستی / هفتگی)

### ویندوز (PowerShell)

```powershell
cd backend
.\.venv\Scripts\Activate.ps1

# فقط چک دستور (بدون نوشتن فایل واقعی dump از DB — dry-run)
python scripts/backup_db.py --dry-run

# بکاپ واقعی
python scripts/backup_db.py

# یا مسیر دلخواه خارج از ریپو
$env:BACKUP_DIR = "D:\GymBackups"
python scripts/backup_db.py
# معادل:
.\scripts\backup_db.ps1
```

### لینوکس سرور

```bash
cd backend
source .venv/bin/activate   # یا داخل کانتینر api
export BACKUP_DIR=/var/backups/gym
python scripts/backup_db.py
# یا:
bash scripts/backup_db.sh
```

فایل خروجی شبیه: `gym_control_20261019T153000Z.dump` (فرمت custom `-Fc`).

**بعد از هر بکاپ موفق:** فایل را به محل دوم کپی کن و دسترسی را محدود کن (رمز/ACL).

---

## Restore (مخرب)

Restore با `--clean` می‌تواند اشیاء موجود را پاک/جایگزین کند. روی production فقط وقتی می‌دانی چه می‌کنی.

### تمرین یک‌بار (توصیه‌شده روی DB جدا / کپی)

1. یک دیتابیس خالی یا کپی بساز (نه لزوماً همان DB اصلی در اولین تمرین).
2. `DATABASE_URL` را موقتاً به آن DB اشاره بده.
3. dry-run:

```powershell
python scripts/restore_db.py ..\backups\gym_control_XXXX.dump --dry-run
```

4. اجرای واقعی — پرچم تأیید اجباری است:

```powershell
python scripts/restore_db.py ..\backups\gym_control_XXXX.dump --i-understand-this-destroys-data
```

5. در صورت نیاز: `alembic upgrade head`
6. چک: لاگین کارکنان، یک لیست اعضا، یک پرداخت نمونه.

### لینوکس

```bash
python scripts/restore_db.py /var/backups/gym/gym_control_XXXX.dump --i-understand-this-destroys-data
```

بدون پرچم تأیید، اسکریپت با کد خروج `2` متوقف می‌شود.

---

## Docker Compose

اگر از `docker compose` استفاده می‌کنی:

```bash
# بکاپ از داخل شبکهٔ compose (نمونه)
docker compose exec -T db pg_dump -U gym -Fc gym_control > /var/backups/gym/manual.dump
```

یا روی ماشین host با `DATABASE_URL` اشاره‌کننده به پورت منتشرشدهٔ `db`، همان اسکریپت‌های Python را اجرا کن.

---

## چه چیزهایی را بکاپ نکن / در گیت نگذار

- فایل‌های `*.dump` / SQL واقعی
- `backend/.env`
- خروجی seed با دادهٔ واقعی (اصلاً seed روی دادهٔ واقعی نزن)

پوشه‌های نادیده در گیت: `backups/`، `dumps/` — جزئیات در ریشهٔ `.gitignore`.

---

## زمان‌بندی پیشنهادی

| کار | تناوب |
|-----|--------|
| `backup_db` | حداقل هفتگی؛ قبل از migration بزرگ روزانه |
| کپی خارج از لپ‌تاپ | همان روز بکاپ |
| تمرین restore | یک‌بار قبل از دادهٔ واقعی؛ بعد هر چند ماه |
| تست `health/db` بعد از restore | هر بار |

استقرار: [deploy.md](deploy.md)
