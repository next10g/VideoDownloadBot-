# YouTube on a public Telegram bot

A **public** bot cannot use each user's browser cookies. One shared `cookies.txt` is one Google account — it breaks under many users, expires, and is not scalable.

## How this project works (default)

| Setting | Default | Meaning |
|--------|---------|---------|
| `YOUTUBE_USE_COOKIES` | `false` | No cookies for normal downloads |
| `YOUTUBE_USER_COOLDOWN_SECONDS` | `20` | Per-user gap between YouTube links |
| `YTDLP_NODE_PATH` | auto | Required for YouTube JS on Hostinger |

For each YouTube URL the bot tries several **yt-dlp clients** without login (`android_vr`, `web_embedded`, `ios`, `android`, `tv`, …) until one works or all fail.

TikTok, Instagram, and most other sites are unchanged.

## What you should set on Hostinger

```env
YOUTUBE_USE_COOKIES=false
YOUTUBE_USER_COOLDOWN_SECONDS=20
MAX_FILE_SIZE_MB=50
YTDLP_NODE_PATH=/opt/alt/alt-nodejs22/root/usr/bin/node
```

Keep `chmod +x bin/yt-dlp` and Node + yt-dlp updated (`npm run postinstall`).

## Optional: improve success rate (admin only)

### 1. PO Token (recommended for production)

YouTube often requires a **Proof of Origin (PO) token** for streaming. yt-dlp cannot invent it; you supply it or use a plugin.

- Guide: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide  
- Example env (format from yt-dlp docs):

```env
YTDLP_YOUTUBE_PO_TOKEN=android_vr.gvs+YOUR_TOKEN,android_vr.player+YOUR_TOKEN
```

Plugins such as `bgutil-ytdlp-pot-provider` can refresh tokens automatically on a VPS — harder on pure shared hosting.

### 2. Cookie pool (last resort, not per-user)

Only if you accept maintaining **several throwaway Google accounts**:

```env
YOUTUBE_USE_COOKIES=true
```

Put files in `cookies-pool/`:

```text
cookies-pool/
  account1.txt
  account2.txt
```

The bot rotates by job ID. This is **not** a fix for “each user from their device” — it only spreads load across your accounts.

See [YOUTUBE-COOKIES.md](./YOUTUBE-COOKIES.md) for exporting Netscape cookies.

## Limits (be honest with users)

- YouTube may block datacenter IPs (Hostinger). Success rate varies by video and time.
- Queue is one download at a time — good for stability.
- Users see `error_youtube_bot` when Google blocks the server, not “upload your cookies”.

## Per-user cookies?

Not practical in Telegram: users would have to send a secrets file. Official YouTube API does not allow arbitrary redistribution. For a public downloader, **cookie-less clients + PO token + rate limits** is the realistic model.
