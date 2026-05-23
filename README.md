# Video Download Bot

Telegram video download bot — webhook mode, optimized for **Hostinger**.

## Hostinger (important)

| Setting | Value |
|---------|--------|
| Node.js | **20** |
| Package manager | **npm** (not Yarn — avoids `--non-interactive` error) |
| Install | `node scripts/hostinger-install.js` |
| Build | `npm run build-ts` |
| Start | `node dist/app.js` |

Env: `YOUTUBE_DL_SKIP_PYTHON_CHECK=1`

Full guide: [docs/HOSTINGER.md](docs/HOSTINGER.md)

## Local setup

```bash
cp .env.sample .env
node scripts/hostinger-install.js
npm run build-ts
npm run distribute
```

Requires Node.js **20+**.

## License

MIT
