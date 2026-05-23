# YouTube — ملف cookies

على استضافة مشتركة (Hostinger) يوتيوب غالباً يظهر:

```text
Sign in to confirm you're not a bot
```

**الحل:** رفع ملف كوكيز من حسابك على يوتيوب.

## الخطوات

1. على الكمبيوتر سجّل دخول [youtube.com](https://youtube.com) في Chrome أو Firefox.
2. ثبّت إضافة **Get cookies.txt LOCALLY** (Chrome Web Store).
3. من youtube.com → Export → احفظ الملف باسم `cookie` (بدون امتداد) أو `cookies.txt`.
4. ارفع الملف إلى مجلد البوت على السيرفر:

```text
/home/u987639727/domains/t.nextegypt-agri.com/nodejs/cookie
```

5. الصلاحيات:

```bash
chmod 600 cookie
```

6. أعد تشغيل البوت. في السجلات يجب أن ترى:

```json
{"msg":"yt-dlp cookies file","path":".../nodejs/cookie"}
```

## بديل في `.env`

```env
COOKIES_PATH=/full/path/to/cookie
```

## ملاحظات

- حدّث الملف كل أسبوعين تقريباً إذا رجع الخطأ.
- لا ترفع `cookie` على GitHub (سري).
- TikTok غالباً يعمل بدون cookies.
