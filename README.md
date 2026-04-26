# NekoDNS

Serverless rewrite of the old `iscatdns` registry.

## Stack

- Cloudflare Workers, Static Assets, D1, Queues, Cron Triggers, Turnstile, Email Service
- React, TypeScript, MUI with Material Design 3 inspired theme tokens
- Hono API routes

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Create a local `.dev.vars` with real secrets:

   ```ini
   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
   SESSION_SECRET=replace-me
   CF_ZONE_ID=replace-me
   CF_API_TOKEN=replace-me
   TELEGRAM_BOT_TOKEN=replace-me
   TELEGRAM_GROUP_CHAT_ID=replace-me
   TELEGRAM_WEBHOOK_SECRET=replace-me
   ```

3. Apply D1 migrations:

   ```powershell
   npm run db:migrate:local
   ```

4. Run the app:

   ```powershell
   npm run dev
   ```

## Old data migration

If `OLD/iscatdns/database.db` exists, generate an import SQL file:

```powershell
npm run migrate:old
```

The generated `migrations/import-old-data.sql` preserves users, DNS records, applications, votes, and abuse reports. Old bcrypt passwords cannot be verified in Workers, so migrated users must reset passwords by email.

## Production deployment

This repo includes an automated deployment script: `scripts/deploy-prod.ps1`.
The script auto-loads variables from repo-root `.env` if present.

### 1) Export required environment variables

```powershell
$env:CLOUDFLARE_API_TOKEN = "cf_api_token_with_workers_d1_queues_permissions"
$env:CLOUDFLARE_ACCOUNT_ID = "your_cloudflare_account_id"
$env:SESSION_SECRET = "strong_random_secret"
$env:TURNSTILE_SECRET_KEY = "turnstile_secret"
$env:CF_ZONE_ID = "cloudflare_zone_id"
$env:CF_API_TOKEN = "cloudflare_dns_api_token"
```

Recommended split tokens:

- `WRANGLER_API_TOKEN`: account-level token for Worker deploy and resource management.
- `CF_API_TOKEN`: zone-level token for DNS record changes performed by the app.

If `WRANGLER_API_TOKEN` is set, deployment script will use it as `CLOUDFLARE_API_TOKEN`.

Optional:

```powershell
$env:WORKER_NAME = "nekodns"
$env:DATABASE_NAME = "nekodns"
$env:QUEUE_NAME = "nekodns-jobs"
$env:PARENT_DOMAIN = "is-cute.cat"
$env:APP_ORIGIN = "https://nekodns.your-domain.com"
$env:EMAIL_FROM = "noreply@your-domain.com"
$env:MAIL_DESTINATION = "admin@your-domain.com"
$env:TURNSTILE_SITE_KEY = "turnstile_site_key"
$env:TELEGRAM_BOT_TOKEN = "telegram_bot_token"
$env:TELEGRAM_GROUP_CHAT_ID = "telegram_group_chat_id"
$env:TELEGRAM_WEBHOOK_SECRET = "telegram_webhook_secret"
```

### 2) Run one-shot production deploy

```powershell
npm run deploy:prod
```

What this does:

- Ensures Queue exists (creates it if missing)
- Ensures D1 exists (creates it if missing)
- Updates `wrangler.toml` binding values (including D1 `database_id`)
- Builds frontend assets
- Applies remote D1 migrations
- Uploads worker secrets
- Runs dry-run deploy
- Deploys worker

### 3) Optional: deploy dry-run only

```powershell
npm run deploy:dry-run
```
