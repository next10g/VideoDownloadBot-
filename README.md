# Video Download Bot

Telegram bot that downloads videos and sends them in chat. Optimized for **webhook mode** and **Hostinger / shared hosting**.

---

## Hostinger deploy (read this first)

Default `npm install` **fails** on Hostinger because `youtube-dl-exec` requires Python during install.

### Fix: custom install command

In **hPanel → Node.js app → Build / Deploy settings**:

| Step | Command |
|------|---------|
| **Install** | `node scripts/hostinger-install.js` |
| **Build** | `npm run build-ts` |
| **Start** | `node dist/app.js` |

**Alternative install:** `YOUTUBE_DL_SKIP_PYTHON_CHECK=1 npm install`

Also add environment variable in hPanel:

```
YOUTUBE_DL_SKIP_PYTHON_CHECK=1
```

Full details: [docs/HOSTINGER.md](docs/HOSTINGER.md)

---

## Quick start (local)

```bash
cp .env.sample .env
# Edit .env — TOKEN, MONGO, ADMIN_ID (numeric!), WEBHOOK_URL, WEBHOOK_SECRET
npm install
npm run build-ts
npm run distribute
```

Use [@userinfobot](https://t.me/userinfobot) for `ADMIN_ID` (number, not @username).

Use a tunnel (cloudflared/ngrok) for `WEBHOOK_URL` when developing locally.

---

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `TOKEN` | Yes | @BotFather |
| `MONGO` | Yes | Atlas URI with **real** password |
| `ADMIN_ID` | Yes | Numeric Telegram user ID |
| `WEBHOOK_URL` | Yes | `https://your-domain.com` |
| `WEBHOOK_SECRET` | Yes | 16+ random characters |
| `PORT` | No | Default `3000` |

See [.env.sample](.env.sample) for all options.

---

## Endpoints

- `GET /health` — liveness
- `GET /diagnostics` — queue, memory, metrics JSON
- `POST /webhook/<WEBHOOK_SECRET>` — Telegram updates

---

## Requirements

- Node.js 18+ (20+ recommended for fewer npm warnings)
- MongoDB Atlas
- yt-dlp (installed automatically by `scripts/ensure-ytdlp.js`)
- ffmpeg on PATH (recommended; optional on shared hosting)
- HTTPS reverse proxy to `PORT`

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run hostinger:install` | Install deps without Python (Hostinger) |
| `npm run build-ts` | Compile TypeScript |
| `npm run distribute` | Run production bot |
| `npm run develop` | Dev watch mode |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `youtube-dl-exec needs Python` | Use `node scripts/hostinger-install.js` as install command |
| `MongoDB bad auth` | Replace `<db_password>` in `MONGO` with real password |
| `ADMIN_ID` invalid | Use numeric ID, not @botname |
| `WEBHOOK_URL must use HTTPS` | Use `https://` URL; clear stale `$env:WEBHOOK_URL` on Windows |
| `sharp` error | Set `SKIP_THUMBNAILS=true` in `.env` |

---

## License

MIT
