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

```bash
export YOUTUBE_DL_SKIP_PYTHON_CHECK=1
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
```
