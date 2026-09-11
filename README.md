# NekoDNS

Serverless rewrite of the old `iscatdns` registry.

## Stack

- Cloudflare Workers, Static Assets, D1, Queues, Cron Triggers, Turnstile, Email Service
- React, TypeScript, MUI with Material Design 3 inspired theme tokens
- Hono API routes

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local `.dev.vars` with real secrets:

   ```ini
   TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
   CF_ZONE_ID=replace-me
   CF_API_TOKEN=replace-me
   TELEGRAM_BOT_TOKEN=replace-me
   TELEGRAM_GROUP_CHAT_ID=replace-me
   TELEGRAM_WEBHOOK_SECRET=replace-me
   ```

3. Apply D1 migrations:

   ```bash
   npm run db:migrate:local
   ```

4. Run the app:

   ```bash
   npm run dev
   ```

## Quality gates

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest
npm run format      # prettier --write .
```

## Old data migration

If `OLD/iscatdns/database.db` exists, generate an import SQL file:

```bash
npm run migrate:old
```

The generated `migrations/import-old-data.sql` preserves users, DNS records, applications, votes, and abuse reports. Old bcrypt passwords cannot be verified in Workers, so migrated users must reset passwords by email.

> The generated file contains real email addresses and password hashes. It is covered by
> `.gitignore` (`migrations/import-old-data*.sql`) and must never be committed.

## Production deployment

Two equivalent deployment scripts are provided; both auto-load variables from a repo-root `.env`:

- macOS / Linux: `scripts/deploy-prod.sh` (`npm run deploy:prod`)
- Windows: `scripts/deploy-prod.ps1` (`npm run deploy:prod:win`)

### 1) Export required environment variables

```bash
export CLOUDFLARE_API_TOKEN="cf_api_token_with_workers_d1_queues_permissions"
export CLOUDFLARE_ACCOUNT_ID="your_cloudflare_account_id"
export TURNSTILE_SECRET_KEY="turnstile_secret"
export CF_ZONE_ID="cloudflare_zone_id"
export CF_API_TOKEN="cloudflare_dns_api_token"
```

Recommended split tokens:

- `WRANGLER_API_TOKEN`: account-level token for Worker deploy and resource management.
- `CF_API_TOKEN`: zone-level token for DNS record changes performed by the app.

If `WRANGLER_API_TOKEN` is set, deployment script will use it as `CLOUDFLARE_API_TOKEN`.

Optional:

```bash
export WORKER_NAME="nekodns"
export DATABASE_NAME="nekodns"
export QUEUE_NAME="nekodns-jobs"
export PARENT_DOMAIN="is-cute.cat"
export APP_ORIGIN="https://nekodns.your-domain.com"
export EMAIL_FROM="noreply@your-domain.com"
export MAIL_DESTINATION="admin@your-domain.com"
export TURNSTILE_SITE_KEY="turnstile_site_key"
export TELEGRAM_BOT_TOKEN="telegram_bot_token"
export TELEGRAM_GROUP_CHAT_ID="telegram_group_chat_id"
export TELEGRAM_WEBHOOK_SECRET="telegram_webhook_secret"
```

`TELEGRAM_WEBHOOK_SECRET` is required for the Telegram integration: without it the webhook
endpoint refuses every request rather than accepting unauthenticated votes.

### 2) Run one-shot production deploy

```bash
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

```bash
npm run deploy:dry-run
```
