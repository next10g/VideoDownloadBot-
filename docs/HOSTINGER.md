# Hostinger shared hosting guide

## Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/health` | GET | Liveness (`ok`) |
| `/diagnostics` | GET | JSON queue/memory/temp stats |
| `/webhook/<WEBHOOK_SECRET>` | POST | Telegram updates |

## Recommended production `.env` (starter)

```env
MAX_FILE_SIZE_MB=350
MAX_DURATION_SECONDS=3600
MAX_USER_ACTIVE_JOBS=1
USER_COOLDOWN_SECONDS=45
DOWNLOAD_TIMEOUT_MS=600000
UPLOAD_TIMEOUT_MS=600000
YTDLP_PROBE_TIMEOUT_MS=60000
QUEUE_JOB_TIMEOUT_MS=900000
QUEUE_MAX_RETRIES=1
LOW_MEMORY_MODE=auto
LOW_MEMORY_THRESHOLD_MB=150
SKIP_THUMBNAILS=false
```

## Node.js process (512MB plan example)

```bash
NODE_OPTIONS="--max-old-space-size=384" node dist/app.js
```

## Monitoring

Poll `GET /diagnostics` every 1–5 minutes. Alert if:

- `queue.pending` > 20 for extended periods
- `temp.dirCount` growing without bound
- `memory.rss` near hosting limit
- `ytdlpActive` > 1 (should never happen)
