# Video Download Bot

Telegram bot that downloads videos and sends them in chat. Optimized for **webhook mode** and **Hostinger**.

---

## Hostinger deploy (required settings)

| Setting | Value |
|---------|--------|
| **Node.js** | **20** |
| **Package manager** | **Yarn** |
| **Install** | `node scripts/hostinger-install.js` |
| **Build** | `yarn build-ts` |
| **Start** | `node dist/app.js` |

Environment variable:

```
YOUTUBE_DL_SKIP_PYTHON_CHECK=1
```

Details: [docs/HOSTINGER.md](docs/HOSTINGER.md) (Arabic + English)

---

## Local development

Requires **Node.js 20+** and **Yarn 4** (bundled in repo).

```bash
cp .env.sample .env
node scripts/hostinger-install.js
yarn build-ts
yarn distribute
```

---

## Environment variables

See [.env.sample](.env.sample). Required: `TOKEN`, `MONGO`, `ADMIN_ID` (numeric), `WEBHOOK_URL`, `WEBHOOK_SECRET`.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `yarn hostinger:install` | Install deps (Hostinger / no Python) |
| `yarn build-ts` | Compile TypeScript |
| `yarn distribute` | Run bot |

---

## License

MIT
