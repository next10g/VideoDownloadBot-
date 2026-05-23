# Hostinger deployment (fix npm install / Python error)

Hostinger **does not have Python** on the build PATH. `youtube-dl-exec` fails with:

`youtube-dl-exec needs Python`

## Solution — change the install command

In **hPanel → Websites → your site → Node.js** (or Git deploy settings), set:

### Install command

```bash
node scripts/hostinger-install.js
```

**Or:**

```bash
YOUTUBE_DL_SKIP_PYTHON_CHECK=1 npm install
```

### Build command

```bash
npm run build-ts
```

### Start command

```bash
node dist/app.js
```

### Environment variables (hPanel)

Add in the Node.js app settings (not only `.env` file):

| Variable | Value |
|----------|--------|
| `YOUTUBE_DL_SKIP_PYTHON_CHECK` | `1` |
| `TOKEN` | from @BotFather |
| `MONGO` | MongoDB Atlas URI (real password, not `<db_password>`) |
| `ADMIN_ID` | **numeric** user id from @userinfobot |
| `WEBHOOK_URL` | `https://t.nextegypt-agri.com` |
| `WEBHOOK_SECRET` | your secret |
| `PORT` | `3000` (or port Hostinger assigns) |

## After first successful install

`scripts/ensure-ytdlp.js` downloads `yt-dlp` into `node_modules/youtube-dl-exec/bin/`.

Verify on server (SSH if available):

```bash
node node_modules/youtube-dl-exec/bin/yt-dlp --version
curl https://t.nextegypt-agri.com/health
```

## npm warnings (safe to ignore)

- `EBADENGINE null-prototype-object` — needs Node 20+ for that sub-dependency; Node 18 still works.
- `deprecated inflight/rimraf` — dev tooling only.

## Recommended `.env` on Hostinger

```env
MAX_FILE_SIZE_MB=200
MAX_DURATION_SECONDS=3600
SKIP_THUMBNAILS=true
NODE_OPTIONS=--max-old-space-size=384
```

`SKIP_THUMBNAILS=true` avoids `sharp` native binary issues on some shared hosts.
