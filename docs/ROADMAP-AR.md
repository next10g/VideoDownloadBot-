# خارطة طريق البوت (بعد التحديث الكبير)

## ما تم تنفيذه الآن

| الميزة | الحالة |
|--------|--------|
| اختيار نوع التحميل (فيديو / صوت / صورة) + أوضاع `/auto` `/video` `/audio` `/image` | ✅ |
| قائمة جودات **حقيقية** من probe (فيديو 360–1080 حسب الرابط) | ✅ |
| أزرار **صوت متعددة** (M4A / MP3 / OPUS…) عند توفرها | ✅ |
| أزرار **صورة بعدة أحجام** عند توفرها في formats | ✅ |
| حجم الملف + المدة في الكابشن بعد الرفع | ✅ |
| `/start` غني + لوحة أدمن + عدد المستخدمين في الوصف القصير | ✅ |
| فيسبوك Reels / share/v / pfbid / صور (بدون كوكيز) | ✅ جزئي |
| إنستغرام: تطبيع روابط + Referer في yt-dlp | ✅ جزئي |
| حفظ الروابط + يوزر + منصة (`LinkLog`) | ✅ |
| `/stats` `/users` `/admin` + إحالة | ✅ |

## ما يحتاج سيرفر أقوى (VPS) — ليس Hostinger فقط

| الميزة | السبب |
|--------|--------|
| يوتيوب «نهائي» 100% بدون كوكيز | IP الاستضافة المشتركة محظور من Google ومن خوادم Invidious/Piped |
| كل روابط فيسبوك `share/p/` → photo.php فقط | أحياناً HTML فارغ من IP الاستضافة؛ الأفضل pfbid في الرابط |
| إنستغرام Stories / حسابات خاصة | تحتاج جلسة أو API |

**الحل الواقعي ليوتيوب عام:** VPS صغير + `YOUTUBE_BACKEND=auto` أو Invidious خاص.

## مرحلة قادمة (يمكن طلبها)

- تصدير CSV للروابط من لوحة الأدمن
- ربط Telegram Business
- مكافآت الإحالة (تحميلات بعد N دعوة)
- ffmpeg مدمج في `bin/` للدمج والثمبنيل
- عدد المستخدمين في **اسم** البوت (يدوي من BotFather)

## أوامر البوت بعد النشر

```
/start   — ترحيب + أوضاع التحميل
/auto    — ذكي (قائمة جودات)
/video   — فيديو
/audio   — صوت
/image   — صورة
/admin   — لوحة الأدمن (ADMIN_ID)
/refer   — رابط الإحالة
```

## BotFather والأدمن

راجع **[BOTFATHER-AR.md](./BOTFATHER-AR.md)** — `ADMIN_ID`، أوامر مخفية عن الجمهور، وتأمين `/diagnostics`.

## نشر على Hostinger

```bash
cd ~/domains/t.nextegypt-agri.com/nodejs
/opt/alt/alt-nodejs20/root/usr/bin/node scripts/hostinger-install.js
/opt/alt/alt-nodejs20/root/usr/bin/node scripts/hostinger-build.js
```

ثم Restart من hPanel. تأكد من `.env`:

```env
SHOW_FORMAT_MENU=true
YOUTUBE_MAX_HEIGHT=1080
REFERRAL_ENABLED=true
YOUTUBE_USE_COOKIES=false
```

## رسائل نجاح في اللوج

- `facebook share probe ok` / `facebook photo probe ok`
- `facebook direct download`
- `instagram probe`
- `download finished`
