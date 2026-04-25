import { EmailMessage } from "cloudflare:email";
import type { Env } from "../env";

interface EmailPayload {
  to?: unknown;
  subject?: unknown;
  html?: unknown;
}

export async function sendSystemEmail(env: Env, payload: Record<string, unknown>) {
  if (!env.MAILER) return;

  const { to, subject, html } = payload as EmailPayload;
  if (typeof to !== "string" || typeof subject !== "string" || typeof html !== "string") {
    throw new Error("Invalid email payload.");
  }

  const mime = [
    `From: NekoDNS <${env.EMAIL_FROM}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
  ].join("\r\n");

  const message = new EmailMessage(env.EMAIL_FROM, to, mime);
  await env.MAILER.send(message);
}

export function verificationEmail(origin: string, token: string) {
  const url = `${origin}/verify-email?token=${encodeURIComponent(token)}`;
  return `<h1>验证你的 NekoDNS 邮箱</h1><p>点击下面的链接完成验证：</p><p><a href="${url}">${url}</a></p><p>链接将在 1 小时后失效。</p>`;
}

export function resetPasswordEmail(origin: string, token: string) {
  const url = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  return `<h1>重置你的 NekoDNS 密码</h1><p>点击下面的链接设置新密码：</p><p><a href="${url}">${url}</a></p><p>链接将在 1 小时后失效。</p>`;
}

export function applicationResultEmail(domain: string, status: string, reason?: string) {
  return `<h1>域名申请${status}</h1><p><strong>${domain}</strong> 的处理结果：${status}</p>${reason ? `<p>说明：${reason}</p>` : ""}`;
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(value)))}?=`;
}
