# خارطة طريق البوت (بعد التحديث الكبير)

## ما تم تنفيذه الآن

| الميزة | الحالة |
|--------|--------|
| اختيار نوع التحميل (فيديو 360–1080 / صوت / صورة) | ✅ |
| حفظ الروابط + يوزر + منصة في MongoDB (`LinkLog`) | ✅ |
| `/stats` و `/users` للأدمن (مستخدمون، روابط، أخطاء، منصات، إحالات) | ✅ |
| `/refer` + رابط `?start=ref_xxx` + زر مشاركة | ✅ |
| صور تيليجرام مع الكابشن | ✅ |
| تحسين TikTok/Facebook (extractor-args) | ✅ جزئي |
| دمج قوائم Invidious/Piped + تطبيع روابط `.env` | ✅ |

## ما يحتاج سيرفر أقوى (VPS) — ليس Hostinger فقط

| الميزة | السبب |
|--------|--------|
| يوتيوب «نهائي» 100% بدون كوكيز | IP الاستضافة المشتركة محظور من Google ومن خوادم Invidious/Piped |
| إزالة علامة يوتيوب المائية | ليست ميزة yt-dlp رسمية؛ الشورتات watermark مدمج في الفيديو |
| كل روابط فيسبوك (جروبات خاصة / إعلانات مقفولة) | تحتاج جلسة أو API خاص |

**الحل الواقعي ليوتيوب عام:** VPS صغير (Hetzner ~5€) + `YOUTUBE_BACKEND=auto` أو خادم Invidious خاص.

## مرحلة قادمة (يمكن طلبها)

- لوحة أدمن داخل تيليجرام (تصدير CSV للروابط)
- ربط Telegram Business (`business_connection` updates)
- مكافآت الإحالة (تحميلات مجانية بعد N دعوة)
- اختيار جودة من قائمة formats الحقيقية بعد probe
- دعم Stories / Reels بشكل منفصل

## أوامر البوت بعد النشر

```
/start   — ترحيب + دعوة
/download — مساعدة
/refer   — رابط الإحالة
/stats   — إحصائيات (ADMIN_ID فقط)
```

## نشر على Hostinger

```bash
/opt/alt/alt-nodejs20/root/usr/bin/node scripts/hostinger-build.js
```

ثم Restart من hPanel. تأكد من `.env`:

```env
SHOW_FORMAT_MENU=true
YOUTUBE_MAX_HEIGHT=1080
REFERRAL_ENABLED=true
# احذف INVIDIOUS_API_URLS أو صحّحها بصيغة https://صغيرة
```
