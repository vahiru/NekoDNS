import type { JobMessage } from "../shared/types";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  JOB_QUEUE: Queue<JobMessage>;
  MAILER?: { send(message: unknown): Promise<void> };
  PARENT_DOMAIN: string;
  APP_ORIGIN: string;
  EMAIL_FROM: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  SESSION_SECRET: string;
  CF_ZONE_ID: string;
  CF_API_TOKEN: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_GROUP_CHAT_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

export interface AppUser {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  telegram_user_id: string | null;
  email_verified_at: string | null;
}

export interface AppBindings {
  Bindings: Env;
  Variables: {
    user: AppUser;
    requestId: string;
  };
}
