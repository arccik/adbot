# AdBot

Telegram ad-for-coins bot with a Web App UI and Node.js backend.

## What's included
- `apps/api` Express API with JWT auth + Prisma
- `apps/bot` Telegraf bot
- `apps/web` Telegram Web App (Vite)
- `prisma/schema.prisma` database schema

## Quick start (local)
1. Copy `.env.example` to `.env` and fill values.
2. Start Postgres:

```bash
docker-compose up -d
```

3. Install deps and generate Prisma client (Prisma 7 uses driver adapters):

```bash
npm install
npx prisma generate
```

4. Run migrations (creates tables):

```bash
npx prisma migrate dev --name init
```

5. Start API, bot, and web app in separate terminals:

```bash
npm run dev
npm run dev:bot
npm run dev:web
```

## Notes
- `ADMIN_API_KEY` is required for admin endpoints (`/admin/*`) and must be sent as `x-admin-key`.
- Web app uses Telegram `initData` for auth. Open it inside Telegram to connect.
- `/ads/upload` returns a signed S3 upload URL when `S3_BUCKET_NAME` + AWS creds are configured.
- Admin UI lives at `/admin.html` in the web app build.
- CloudFront signed URLs are enabled when `CLOUDFRONT_KEY_PAIR_ID` and `CLOUDFRONT_PRIVATE_KEY` (base64) are set.
- Configure URL TTL with `CLOUDFRONT_URL_TTL_SECONDS` (default 600).
- Video duration ingest uses `ffprobe` on the API host (`FFPROBE_PATH`).
- Background worker: run `npm -w @adbot/api run worker` to ingest media durations.

## Production
- Deploy `apps/api` and `apps/bot` to ECS/Fargate.
- Host `apps/web` on S3 + CloudFront (or any static hosting).
- Use RDS Postgres and S3 for media.
