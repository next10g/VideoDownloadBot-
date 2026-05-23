# YouTube for a public Telegram bot (final approach)

Public bots **cannot** rely on one person’s `cookies.txt` — Google rotates them and datacenter IPs (Hostinger) get blocked.

## Solution in this project: **Piped API** (default)

| Setting | Value |
|--------|--------|
| `YOUTUBE_BACKEND` | `auto` (default): Piped → Invidious → yt-dlp |

How it works:

1. User sends a YouTube link.
2. Bot asks a **Piped** public API for stream URLs (no login, no cookies).
3. Bot downloads the file and sends it on Telegram.

Users do **nothing** extra. You do **not** upload cookies every day.

Fallback: `YOUTUBE_BACKEND=auto` tries Piped first, then yt-dlp if Piped is down.

---

## Recommended `.env` (Hostinger public bot)

```env
YOUTUBE_BACKEND=auto
YOUTUBE_USER_COOLDOWN_SECONDS=15
MAX_FILE_SIZE_MB=50
PIPED_API_TIMEOUT_MS=60000

YOUTUBE_USE_COOKIES=false
YOUTUBE_FALLBACK_COOKIES=false
```

If Piped returns 502 on your host, Invidious is tried automatically. Logs:

```json
{"msg":"youtube invidious download"}
{"msg":"invidious video ok","base":"https://inv.tux.pizza"}
```

Deploy, `npm run build-ts`, restart **one** Node process.

Startup log should show:

```json
{"msg":"YouTube backend","mode":"piped",...}
```

---

## Optional: custom Piped servers

If default instances are slow or blocked, set your own (comma-separated):

```env
PIPED_API_URLS=https://pipedapi.kavin.rocks,https://pipedapi.adminforge.de
```

List of public instances: https://github.com/TeamPiped/Piped/wiki/Instances

---

## Limits (be honest)

- Depends on **Piped public instances** — sometimes down or rate-limited.
- Very long or live videos may fail (`MAX_DURATION_SECONDS`, live not supported).
- YouTube may block some videos for third-party APIs too (rare).
- TikTok / Instagram / others still use **yt-dlp** as before.

---

## When to use `ytdlp` backend

Only if you run yt-dlp on a **VPS with residential IP** or PO Token plugin:

```env
YOUTUBE_BACKEND=ytdlp
YTDLP_YOUTUBE_PO_TOKEN=...
```

Not recommended on shared Hostinger for a **public** bot.

---

## cookies.txt

**Not required** with `YOUTUBE_BACKEND=piped`.  
See [YOUTUBE-COOKIES.md](./YOUTUBE-COOKIES.md) only if you switch to `ytdlp` on a private server.
