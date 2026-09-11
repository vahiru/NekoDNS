import { Hono } from "hono";
import type { Context } from "hono";
import type { AppBindings, AppUser } from "../env";
import { audit } from "../audit";
import { sha256Hex } from "../crypto";
import { jsonError } from "../http";
import { applyAbuseAction, isAbuseAction } from "../services/abuse";
import { castVote } from "../services/approval";

const telegram = new Hono<AppBindings>();

telegram.post("/integrations/telegram/webhook", async (c) => {
  // Without a configured secret this endpoint would accept votes from anyone, so refuse to serve.
  if (!c.env.TELEGRAM_WEBHOOK_SECRET) return jsonError(c, 503, "Telegram webhook is not configured.");
  const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) return jsonError(c, 403, "Telegram secret mismatch.");

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

  if (update.callback_query?.data?.startsWith("abuse:")) {
    await handleAbuse(c, update.callback_query);
    return c.json({ ok: true });
  }

  return c.json({ ok: true });
});

/** Resolves the Telegram sender to a bound admin account, answering the callback when it is not one. */
async function requireBoundAdmin(c: Context<AppBindings>, query: TelegramCallbackQuery) {
  const admin = await c.env.DB.prepare(
    "SELECT id, username, email, role, telegram_user_id, email_verified_at FROM users WHERE telegram_user_id = ? AND role = 'admin'",
  )
    .bind(String(query.from.id))
    .first<AppUser>();
  if (!admin) {
    await answerCallbackQuery(c, query.id, "未找到已绑定的管理员账号。");
    return null;
  }
  c.set("user", admin);
  return admin;
}

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
  const admin = await requireBoundAdmin(c, query);
  if (!admin) return;

  const [, vote, applicationId] = query.data.split(":");
  if (vote !== "approve" && vote !== "deny") {
    await answerCallbackQuery(c, query.id, "无效的审批操作。");
    return;
  }
  try {
    await castVote(c, applicationId, vote, "telegram", telegramUserId);
    await audit(c, "telegram.application.vote", "application", applicationId, { vote });
    await answerCallbackQuery(c, query.id, vote === "approve" ? "已批准申请。" : "已记录拒绝票。");
  } catch (error) {
    await answerCallbackQuery(c, query.id, error instanceof Error ? error.message : "审批失败。");
  }
}

async function handleAbuse(c: Context<AppBindings>, query: TelegramCallbackQuery) {
  const admin = await requireBoundAdmin(c, query);
  if (!admin) return;

  const [, action, reportId] = query.data.split(":");
  if (!action || !isAbuseAction(action)) {
    await answerCallbackQuery(c, query.id, "无效的举报处理动作。");
    return;
  }

  try {
    const report = await applyAbuseAction(c.env, reportId, action);
    if (!report) {
      await answerCallbackQuery(c, query.id, "举报不存在。");
      return;
    }
    await audit(c, `telegram.abuse.${action}`, "abuse_report", report.id);
    await answerCallbackQuery(c, query.id, abuseActionFeedback[action]);
  } catch (error) {
    await answerCallbackQuery(c, query.id, error instanceof Error ? error.message : "处理失败。");
  }
}

const abuseActionFeedback = {
  acknowledge: "已受理该举报。",
  suspend: "已提交域名暂停任务。",
  ignore: "已忽略该举报。",
} as const;

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
