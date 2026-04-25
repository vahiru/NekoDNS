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
