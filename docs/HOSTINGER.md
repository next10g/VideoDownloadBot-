# Hostinger — إعداد النشر

## المشكلة: Yarn `--non-interactive`

Hostinger يشغّل `yarn install --non-interactive` وهذا **ملغى في Yarn 4** فيفشل التثبيت.

**الحل:** استخدم **npm** وليس Yarn في لوحة Hostinger.

---

## إعدادات hPanel

| الحقل | القيمة |
|--------|--------|
| **Node.js version** | **20** |
| **Package manager** | **npm** (مهم — ليس Yarn) |
| **Install command** | `node scripts/hostinger-install.js` |
| **Build command** | `npm run build-ts` |
| **Start command** | `node dist/app.js` |

### متغيرات البيئة

```
YOUTUBE_DL_SKIP_PYTHON_CHECK=1
TOKEN=...
MONGO=mongodb+srv://user:PASSWORD@cluster.mongodb.net/video-download-bot
ADMIN_ID=123456789
WEBHOOK_URL=https://t.nextegypt-agri.com
WEBHOOK_SECRET=...
PORT=3000
```

- `ADMIN_ID` = رقم من [@userinfobot](https://t.me/userinfobot)
- استبدل `PASSWORD` في `MONGO` (بدون `<db_password>`)

---

## الملفات في Git

| ملف | مطلوب |
|-----|--------|
| `package-lock.json` | نعم (npm) |
| `yarn.lock` | اختياري للتطوير المحلي فقط — احذفه من Git إذا أردت npm فقط |
| `.yarn/` | اختياري — غير مطلوب على Hostinger |

إذا وُجد `package-lock.json` و`yarn.lock` معاً، احذف `yarn.lock` من المستودع أو تجاهل Yarn في Hostinger.

---

## أوامر يدوية (SSH)

### `node: command not found`

SSH لا يضيف Node تلقائياً. جرّب:

```bash
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
node --version
```

أو استخدم المسار الكامل من hPanel (Node 20).

### تثبيت yt-dlp (SSH)

على سيرفرك (مثل `fr-int-web1424`):

| المحاولة | النتيجة |
|----------|---------|
| `python3` | 3.6 فقط — **لا يكفي** |
| `yt-dlp_linux` | `libz.so.1` — **لا يعمل** |
| `/opt/alt/alt-python311` | غير موجود |

**الحل:** تثبيت **Python محمول** داخل المشروع (مجلد `.python/` ~50MB، مرة واحدة):

```bash
cd ~/domains/t.nextegypt-agri.com/nodejs
bash scripts/install-ytdlp.sh
```

قد يستغرق 2–5 دقائق (تحميل + pip). عند النجاح:

```bash
bin/yt-dlp --version
ls -la .python/bin/yt-dlp
```

إذا وُجد Node في PATH:

```bash
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
node scripts/ytdlp-install-lib.js
```

### باقي الأوامر (بعد تفعيل Node في PATH)

```bash
export YOUTUBE_DL_SKIP_PYTHON_CHECK=1
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
node scripts/hostinger-install.js
npm run build-ts
node dist/app.js
```

---

## `.env` موصى به

```env
MAX_FILE_SIZE_MB=200
SKIP_THUMBNAILS=true
NODE_OPTIONS=--max-old-space-size=384
# لا تضبط YTDLP_PATH=/tmp/yt-dlp — /tmp غالباً noexec ويسبب EACCES
# اتركه فارغاً أو استخدم المسار الكامل لـ bin/yt-dlp داخل التطبيق
```

## خطأ `EACCES` أثناء `postinstall` / `ensure-ytdlp`

على بعض الاستضافات `/tmp` **لا يسمح بتشغيل** الملفات (`noexec`). الحل في الكود الحالي:

1. يُحمَّل `yt-dlp` إلى **`bin/yt-dlp`** داخل مجلد التطبيق (قابل للتنفيذ عادةً).
2. `postinstall` **لا يوقف** `npm install` حتى لو فشل الفحص.
3. عند التشغيل يحاول البوت `chmod` ثم يستخدم أول مسار يعمل.

بعد النشر على SSH:

```bash
bash scripts/install-ytdlp.sh
```

استخدم `bash scripts/install-ytdlp.sh` — لا تثبّت `yt-dlp_linux` يدوياً إلا إذا نجح `--version` بدون خطأ `libz`.

في hPanel **احذف** `YTDLP_PATH=/tmp/yt-dlp` إن وُجد. اترك المتغير فارغاً أو ضعه على:
`/home/u987639727/domains/t.nextegypt-agri.com/nodejs/bin/yt-dlp` (عدّل المسار حسب مجلدك).

## خطأ `yt-dlp probe failed` مع `message` فارغ

1. تأكد أن `node scripts/ensure-ytdlp.js` نجح عند التثبيت.
2. على SSH جرّب: `bin/yt-dlp --version` (أو المسار في `YTDLP_PATH`)
3. إذا فشل YouTube من السيرفر (حظر Hostinger للخارج)، ستظهر رسالة أوضح في السجلات بعد التحديث.
4. مؤقتاً للاختبار: `SKIP_YTDLP_PROBE=true` في `.env` (يتخطى الفحص ويحاول التحميل مباشرة).

## خطأ `ffmpeg not found` / `--no-call-home`

- تمت إزالة `--no-call-home` (مهمل في yt-dlp الحديث).
- بدون ffmpeg: البوت يحمّل **mp4 جاهز** بدون دمج (TikTok/YouTube غالباً يعمل).
- لتثبيت ffmpeg ثابت في المشروع (~40MB):

```bash
cd ~/domains/t.nextegypt-agri.com/nodejs
bash scripts/install-ffmpeg.sh
bin/ffmpeg -version
```

ثم أعد نشر التطبيق — سيُكتشف `bin/ffmpeg` تلقائياً.

## خطأ `Network request for 'sendDocument' failed`

التحميل نجح لكن الرفع إلى Telegram فشل (شبكة بطيئة على الاستضافة).

1. أعد النشر بعد آخر تحديث (إعادة محاولة تلقائية + مهلة أطول).
2. في `.env` على Hostinger:

```env
UPLOAD_TIMEOUT_MS=900000
UPLOAD_MAX_RETRIES=5
SKIP_THUMBNAILS=true
MAX_FILE_SIZE_MB=50
```

3. تأكد أن `bin/ffmpeg` موجود بعد كل نشر (أو شغّل `bash scripts/install-ffmpeg.sh`).
4. اختبر من SSH:

```bash
curl -I https://api.telegram.org
```

إذا فشل الاتصال من السيرفر، Hostinger يحجب الخارج — تواصل مع الدعم أو استخدم **Bot API محلي** (`BOT_API_URL`).

## SIGTERM في السجلات

طبيعي عند إعادة نشر Hostinger — البوت يعيد التشغيل. انتظر `bot ready` ثم اختبر الرابط.
