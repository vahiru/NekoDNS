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
  if (!admin) {
    await answerCallbackQuery(c, query.id, "未找到已绑定的管理员账号。");
    return;
  }

  const [, vote, applicationId] = query.data.split(":");
  if (vote !== "approve" && vote !== "deny") {
    await answerCallbackQuery(c, query.id, "无效的审批操作。");
    return;
  }
  c.set("user", admin);
  try {
    await castVote(c, applicationId, vote, "telegram", telegramUserId);
    await audit(c, "telegram.application.vote", "application", applicationId, { vote });
    await answerCallbackQuery(c, query.id, vote === "approve" ? "已批准申请。" : "已记录拒绝票。");
  } catch (error) {
    await answerCallbackQuery(c, query.id, error instanceof Error ? error.message : "审批失败。");
  }
}

async function answerCallbackQuery(c: Context<AppBindings>, callbackQueryId: string, text: string) {
  if (!c.env.TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  }).catch((error) => {
    console.error("Failed to answer Telegram callback query", { error });
  });
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
  id: string;
  data: string;
  from: { id: number };
}

export default telegram;
