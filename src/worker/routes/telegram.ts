import { Hono } from "hono";
import type { Context } from "hono";
import type { AppBindings, AppUser } from "../env";
import { audit } from "../audit";
import { sha256Hex } from "../crypto";
import { jsonError } from "../http";
import { castVote } from "../services/approval";

const telegram = new Hono<AppBindings>();

telegram.post("/integrations/telegram/webhook", async (c) => {
  const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (c.env.TELEGRAM_WEBHOOK_SECRET && secret !== c.env.TELEGRAM_WEBHOOK_SECRET) return jsonError(c, 403, "Telegram secret mismatch.");

  const update = (await c.req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return c.json({ ok: true });

  if (update.message?.text?.startsWith("/bind")) {
    await handleBind(c, update.message);
    return c.json({ ok: true });
  }

  if (update.callback_query?.data?.startsWith("vote:")) {
    await handleVote(c, update.callback_query);
    return c.json({ ok: true });
  }

  return c.json({ ok: true });
});

async function handleBind(c: Context<AppBindings>, message: TelegramMessage) {
  const token = message.text.split(/\s+/)[1];
  if (!token || !message.from?.id) return;
  const hash = await sha256Hex(token);
  await c.env.DB.prepare(
    `UPDATE users
     SET telegram_user_id = ?, telegram_bind_token_hash = NULL, telegram_bind_expires_at = NULL
     WHERE telegram_bind_token_hash = ? AND datetime(telegram_bind_expires_at) > datetime('now')`,
  )
    .bind(String(message.from.id), hash)
    .run();
}

async function handleVote(c: Context<AppBindings>, query: TelegramCallbackQuery) {
  const telegramUserId = String(query.from.id);
  const admin = await c.env.DB.prepare(
    "SELECT id, username, email, role, telegram_user_id, email_verified_at FROM users WHERE telegram_user_id = ? AND role = 'admin'",
  )
    .bind(telegramUserId)
    .first<AppUser>();
  if (!admin) return;

  const [, vote, applicationId] = query.data.split(":");
  if (vote !== "approve" && vote !== "deny") return;
  c.set("user", admin);
  await castVote(c, applicationId, vote, "telegram", telegramUserId);
  await audit(c, "telegram.application.vote", "application", applicationId, { vote });
}

interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  text: string;
  from?: { id: number };
}

interface TelegramCallbackQuery {
  data: string;
  from: { id: number };
}

export default telegram;
