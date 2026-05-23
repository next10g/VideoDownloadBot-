# Hostinger — إعداد البناء / Build settings

## إعدادات hPanel (مهم)

في **Websites → Node.js → Deploy**:

| الحقل | القيمة |
|--------|--------|
| **Node.js version** | **20** |
| **Package manager** | **Yarn** |
| **Install command** | `node scripts/hostinger-install.js` |
| **Build command** | `yarn build-ts` |
| **Start command** | `node dist/app.js` |

### متغيرات البيئة (Environment)

```
YOUTUBE_DL_SKIP_PYTHON_CHECK=1
TOKEN=...
MONGO=mongodb+srv://...
ADMIN_ID=123456789
WEBHOOK_URL=https://t.nextegypt-agri.com
WEBHOOK_SECRET=...
PORT=3000
```

`ADMIN_ID` = رقم المستخدم من [@userinfobot](https://t.me/userinfobot) وليس @اسم_البوت.

---

## أسباب فشل البناء الشائعة

| الخطأ | الحل |
|--------|-----|
| packageManager yarn لكن npm يُستخدم | اختر **Yarn** في لوحة Hostinger |
| `null-prototype-object` يحتاج Node 20 | اختر **Node 20** |
| `youtube-dl-exec needs Python` | `YOUTUBE_DL_SKIP_PYTHON_CHECK=1` + `hostinger-install.js` |

---

## ملفات المشروع التي تدعم Hostinger

- `.node-version` → `20`
- `.nvmrc` → `20`
- `packageManager`: `yarn@4.1.1`
- `.yarn/releases/yarn-4.1.1.cjs` (Yarn مضمّن — لا حاجة لتثبيت Yarn عالمياً)

---

## بعد النشر

```bash
curl https://t.nextegypt-agri.com/health
curl https://t.nextegypt-agri.com/diagnostics
```

---

## `.env` موصى به على الاستضافة المشتركة

```env
MAX_FILE_SIZE_MB=200
SKIP_THUMBNAILS=true
NODE_OPTIONS=--max-old-space-size=384
```
