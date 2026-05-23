# YouTube — ملف cookies

## الخطأ: `Is a directory: .../cookie`

معناه إنك عملت **مجلد** اسمه `cookie` بدل **ملف**.

### الحل السريع (SSH)

```bash
cd ~/domains/t.nextegypt-agri.com/nodejs

# لو في مجلد cookie بالغلط
ls -la cookie
# لو مجلد: انقل الملف اللي جواه أو احذف المجلد
rm -rf cookie

# ارفع ملف cookies.txt (من إضافة المتصفح) هنا:
# المسار الصحيح:
nano cookies.txt
# الصق محتوى الملف واحفظ (Ctrl+O, Enter, Ctrl+X)

chmod 600 cookies.txt
ls -la cookies.txt
# لازم يظهر ملف (-rw-------) مش مجلد (drwx...)
```

أعد تشغيل البوت. في السجلات:

```json
{"msg":"yt-dlp cookies file","path":".../cookies.txt"}
```

---

## تصدير الكوكيز من المتصفح

1. سجّل دخول [youtube.com](https://youtube.com).
2. إضافة Chrome: **Get cookies.txt LOCALLY**.
3. Export → احفظ باسم `cookies.txt`.
4. ارفع إلى مجلد `nodejs/` على Hostinger (File Manager أو SFTP).

**لا** تنشئ مجلد `cookie/` — استخدم ملف **`cookies.txt`** في جذر المشروع.

### بدائل الاسم

| المسار | يعمل |
|--------|------|
| `nodejs/cookies.txt` | نعم (مفضل) |
| `nodejs/cookie` كملف | نعم |
| `nodejs/cookie/` كمجلد | لا (إلا لو فيه `cookies.txt` جواه) |

### `.env` (اختياري)

```env
COOKIES_PATH=/home/u987639727/domains/t.nextegypt-agri.com/nodejs/cookies.txt
```

---

## ملاحظات

- لا ترفع الكوكيز على GitHub.
- حدّث الملف كل ~2 أسبوع لو رجع خطأ «Sign in to confirm».
- TikTok غالباً يشتغل بدون cookies.
