# BotFather + أمان البيانات

## رقمك كأدمن

1. افتح [@userinfobot](https://t.me/userinfobot) أو [@getidsbot](https://t.me/getidsbot) واحصل على **رقمك الرقمي** (مثلاً `123456789`).
2. في `.env` على السيرفر:

```env
ADMIN_ID=123456789
```

يجب أن يطابق **حسابك الشخصي** بالضبط — غيره = مفيش لوحة أدمن لأحد.

## أوامر البوت (تلقائي بعد النشر)

عند تشغيل البوت يُسجَّل:

| من يرى الأوامر | الأوامر |
|----------------|---------|
| **كل المستخدمين** | `/start` `/auto` `/video` `/audio` `/image` `/help` `/language` `/refer` |
| **أنت فقط** (`ADMIN_ID`) | `/admin` `/stats` `/users` |

لا حاجة لإضافة `/admin` يدوياً في BotFather للجميع — الكود يخفيها عن غيرك.

### اختياري في BotFather

- **Bot Settings → Commands**: يمكنك مراجعة القائمة؛ الأوامر العامة تظهر للجميع.
- **Description / About**: وصف عام للبوت (بدون ذكر لوحة الأدمن).
- **Short description**: يتحدّث تلقائياً بعدد المستخدمين.

## ما يُحمى

| العنصر | الحماية |
|--------|---------|
| زر «لوحة الأدمن» في `/start` | يظهر لـ `ADMIN_ID` فقط |
| `/admin` `/stats` `/users` | لا رد لغير الأدمن (صمت) |
| أزرار `admin:*` | لا استجابة لغير الأدمن |
| `/diagnostics` على الويب | يحتاج هيدر `X-Webhook-Secret` = قيمة `WEBHOOK_SECRET` |
| MongoDB | لا يُعرض عبر HTTP — فقط من السيرفر |

## فحص التشخيص (أنت فقط)

```bash
curl -H "X-Webhook-Secret: YOUR_WEBHOOK_SECRET" https://t.nextegypt-agri.com/diagnostics
```

بدون الهيدر → `404` (لا تسريب بيانات).

## نصائح أمان

- لا تشارك `.env` ولا `WEBHOOK_SECRET` ولا `TOKEN`.
- MongoDB على Hostinger: استخدم كلمة مرور قوية ولا تفتح المنفذ للعامة.
- `MONGO` في `.env` فقط على السيرفر.
