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
| **Build command** | `node scripts/hostinger-build.js` (أو اتركه فارغاً — التثبيت يبني تلقائياً) |
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

على **SSH** الأوامر `node` و `npm` غالباً **غير موجودة** في PATH. استخدم المسار الكامل:

```bash
cd ~/domains/t.nextegypt-agri.com/nodejs
source scripts/hostinger-env.sh

# أو مباشرة (سطر واحد لكل أمر — لا تلصق أوامر معاً):
/opt/alt/alt-nodejs20/root/usr/bin/node scripts/hostinger-install.js
/opt/alt/alt-nodejs20/root/usr/bin/node scripts/hostinger-build.js
```

### `tsc: Permission denied`

Hostinger أحياناً يمنع تنفيذ `node_modules/.bin/tsc`. لا تستخدم `npm run build-ts` — استخدم:

```bash
/opt/alt/alt-nodejs20/root/usr/bin/node scripts/hostinger-build.js
```

أو ابنِ على جهازك (`npm run build-ts`) وارفع مجلد `dist/` فقط.

أمر التثبيت في **hPanel** (بدون SSH):

```text
/opt/alt/alt-nodejs20/root/usr/bin/node scripts/hostinger-install.js
```

أمر التشغيل:

```text
/opt/alt/alt-nodejs20/root/usr/bin/node dist/app.js
```

### تشغيل يدوي عبر SSH → `Missing environment variables`

هذا **طبيعي**: hPanel يحقن `TOKEN` و`MONGO` وغيرها عند التشغيل من اللوحة، لكن **SSH لا يرى** تلك المتغيرات تلقائياً.

**للإنتاج:** لا تشغّل `dist/app.js` يدوياً — استخدم **Restart** في hPanel → Node.js.

**للاختبار من SSH** أنشئ ملف `.env` في مجلد المشروع (انسخ من `.env.sample`):

```bash
cd ~/domains/t.nextegypt-agri.com/nodejs
cp .env.sample .env
nano .env   # TOKEN, MONGO, ADMIN_ID, WEBHOOK_URL, WEBHOOK_SECRET
chmod 600 .env
/opt/alt/alt-nodejs20/root/usr/bin/node dist/app.js
```

أو انسخ نفس القيم من hPanel → Environment variables إلى `.env`.

---

## `.env` موصى به (بوت عام)

```env
YOUTUBE_BACKEND=auto
PIPED_API_TIMEOUT_MS=60000
# اتركها فارغة لاستخدام القائمة المدمجة (7+ خوادم). إن وضعت قيمتين فقط يُجرّبها ثم الباقي تلقائياً:
# INVIDIOUS_API_URLS=https://inv.tux.pizza,https://invidious.private.coffee
# (استخدم https صغير — ليس HTTPS://HOST الكبير)
YOUTUBE_USER_COOLDOWN_SECONDS=15
YTDLP_NODE_PATH=/opt/alt/alt-nodejs22/root/usr/bin/node
YOUTUBE_USE_COOKIES=false
YOUTUBE_FALLBACK_COOKIES=false
MAX_FILE_SIZE_MB=50
SKIP_THUMBNAILS=true
# Optional memory limit only (one line — do NOT use dns-result-order on Hostinger):
# NODE_OPTIONS=--max-old-space-size=384
# يوتيوب — راجع docs/YOUTUBE-PUBLIC-BOT.md و docs/YOUTUBE-COOKIES.md
# تحقق من الكوكيز: bash scripts/verify-youtube-cookies.sh
# مهم: عملية Node واحدة فقط (تجنب تشغيل البوت مرتين — يسبب DocumentNotFoundError)
# لا تضبط YTDLP_PATH=/tmp/yt-dlp — /tmp غالباً noexec ويسبب EACCES
# اتركه فارغاً أو استخدم المسار الكامل لـ bin/yt-dlp داخل التطبيق
```

## خطأ `NODE_OPTIONS` / `--DNS-RESULT-ORDER= is not allowed`

يظهر أثناء `npm install` على Hostinger إذا كان في **`.env`** أو **لوحة التحكم**:

```env
NODE_OPTIONS=--dns-result-order=ipv4first
```

Hostinger أحياناً يحوّله إلى `--DNS-RESULT-ORDER=` ويفشل Node قبل أي سكربت.

**الحل:**

1. افتح `.env` واحذف أي سطر فيه `dns-result-order` أو `DNS-RESULT-ORDER`.
2. في hPanel → Node.js → Environment variables: احذف `NODE_OPTIONS` أو اجعله فقط:
   ```text
   --max-old-space-size=384
   ```
3. أمر التثبيت في Hostinger:
   ```text
   node scripts/hostinger-install.js
   ```
   (السكربت ينظّف `NODE_OPTIONS` تلقائياً قبل `npm install`)

**لا تستخدم** `--dns-result-order` على Hostinger — غير مدعوم في بيئة التثبيت.

---

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

إذا ظهر `xz: Cannot exec` — السكربيت الجديد يجرّب `.tar.gz` ثم يستخرج `.tar.xz` عبر **python3** (بدون أمر `xz`).

**ffmpeg اختياري** — TikTok نجح عندك بدون ffmpeg. الأهم الآن: إعادة نشر كود **رفع Telegram** مع إعدادات `.env` أدناه.

ثم أعد نشر التطبيق — سيُكتشف `bin/ffmpeg` تلقائياً إن وُجد.

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
بببب
3. تأكد أن `bin/ffmpeg` موجود بعد كل نشر (أو شغّل `bash scripts/install-ffmpeg.sh`).
4. اختبر من SSH:

```bash
curl -I https://api.telegram.org
```

`curl -I https://api.telegram.org` يعمل عندك (302) — الاتصال موجود. فعّل في `.env`:

```env
UPLOAD_TIMEOUT_MS=900000
UPLOAD_MAX_RETRIES=5
SKIP_THUMBNAILS=true
```

ثم أعد النشر وجرب TikTok مرة أخرى (ابحث في السجلات عن `upload complete`).

## YouTube: `Sign in to confirm you're not a bot`

يوتيوب يحجب IP السيرفر. **TikTok** غالباً يشتغل بدون كوكيز.

ارفع ملف `cookie` (كوكيز Netscape من المتصفح) في مجلد `nodejs/` — شرح كامل: [docs/YOUTUBE-COOKIES.md](YOUTUBE-COOKIES.md)

```bash
# بعد الرفع
chmod 600 cookie
# أعد تشغيل البوت — في السجلات: "yt-dlp cookies file"
```

## SIGTERM في السجلات

طبيعي عند إعادة نشر Hostinger — البوت يعيد التشغيل. انتظر `bot ready` ثم اختبر الرابط.
