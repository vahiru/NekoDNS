import type { Env } from "../env";

export async function sendApplicationTelegram(env: Env, applicationId: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_GROUP_CHAT_ID) return;
  const app = await env.DB.prepare(
    `SELECT a.*, u.username
     FROM applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = ?`,
  )
    .bind(applicationId)
    .first<Record<string, string | number | null>>();
  if (!app) return;

  const text = [
    `*新的域名申请*`,
    `申请人：${app.username}`,
    `域名：\`${app.subdomain}\``,
    `类型：${app.record_type}`,
    `值：\`${app.record_value}\``,
    `用途：${app.purpose || "无"}`,
  ].join("\n");

  const result = await telegramFetch(env, "sendMessage", {
    chat_id: env.TELEGRAM_GROUP_CHAT_ID,
    text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "批准", callback_data: `vote:approve:${applicationId}` }],
        [{ text: "拒绝", callback_data: `vote:deny:${applicationId}` }],
      ],
    },
  });

  const messageId = result.result?.message_id;
  if (messageId) {
    await env.DB.prepare("UPDATE applications SET telegram_message_id = ? WHERE id = ?").bind(String(messageId), applicationId).run();
  }
}

export async function sendAbuseTelegram(env: Env, reportId: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_GROUP_CHAT_ID) return;
  const report = await env.DB.prepare("SELECT * FROM abuse_reports WHERE id = ?").bind(reportId).first<Record<string, string | null>>();
  if (!report) return;

  const result = await telegramFetch(env, "sendMessage", {
    chat_id: env.TELEGRAM_GROUP_CHAT_ID,
    text: `*滥用举报*\n域名：\`${report.subdomain}\`\n原因：${report.reason}\n详情：${report.details || "无"}`,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "受理", callback_data: `abuse:acknowledge:${reportId}` }],
        [{ text: "暂停域名", callback_data: `abuse:suspend:${reportId}` }],
        [{ text: "忽略", callback_data: `abuse:ignore:${reportId}` }],
      ],
    },
  });

  const messageId = result.result?.message_id;
  if (messageId) {
    await env.DB.prepare("UPDATE abuse_reports SET telegram_message_id = ? WHERE id = ?").bind(String(messageId), reportId).run();
  }
}

export async function editTelegramMessage(env: Env, payload: Record<string, unknown>) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_GROUP_CHAT_ID) return;
  const messageId = payload.messageId;
  const text = payload.text;
  if (typeof messageId !== "string" || typeof text !== "string") return;
  await telegramFetch(env, "editMessageText", {
    chat_id: env.TELEGRAM_GROUP_CHAT_ID,
    message_id: messageId,
    text,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [] },
  });
}

async function telegramFetch(env: Env, method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as { ok?: boolean; result?: { message_id?: number }; description?: string };
  if (!response.ok || !json.ok) throw new Error(json.description || `Telegram API failed: ${response.status}`);
  return json;
}
