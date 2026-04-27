import { EmailMessage } from "cloudflare:email";
import { connect } from "cloudflare:sockets";
import type { Env } from "../env";

interface EmailPayload {
  to?: unknown;
  subject?: unknown;
  html?: unknown;
}

export async function sendSystemEmail(env: Env, payload: Record<string, unknown>) {
  const { to, subject, html } = payload as EmailPayload;
  if (typeof to !== "string" || typeof subject !== "string" || typeof html !== "string") {
    throw new Error("Invalid email payload.");
  }

  if (env.RESEND_API_KEY) {
    await sendWithResend(env, to, subject, html);
    return;
  }

  if (env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS) {
    await sendWithSmtp(env, to, subject, html);
    return;
  }

  if (!env.MAILER) return;

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

async function sendWithResend(env: Env, to: string, subject: string, html: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      html,
    }),
  });

  if (response.ok) return;

  const errorText = await response.text().catch(() => "");
  throw new Error(`Resend send failed (${response.status}): ${errorText || "unknown error"}`);
}

async function sendWithSmtp(env: Env, to: string, subject: string, html: string) {
  const port = Number(env.SMTP_PORT);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid SMTP port: ${env.SMTP_PORT ?? "undefined"}`);
  }

  const socket = connect(
    { hostname: env.SMTP_HOST!, port },
    { secureTransport: env.SMTP_SECURE === "true" ? "on" : "starttls", allowHalfOpen: false },
  );

  const client = new SmtpClient(socket);
  try {
    await client.readReply([220]);
    await client.command(`EHLO ${smtpEhloName(env.EMAIL_FROM)}`, [250]);
    await client.command(`AUTH LOGIN`, [334]);
    await client.command(btoa(env.SMTP_USER!), [334]);
    await client.command(btoa(env.SMTP_PASS!), [235]);
    await client.command(`MAIL FROM:<${env.EMAIL_FROM}>`, [250]);
    await client.command(`RCPT TO:<${to}>`, [250, 251]);
    await client.command("DATA", [354]);

    const mime = [
      `From: NekoDNS <${env.EMAIL_FROM}>`,
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "",
      dotStuff(html).replace(/\r?\n/g, "\r\n"),
    ].join("\r\n");

    await client.write(`${mime}\r\n.\r\n`);
    await client.readReply([250]);
    await client.command("QUIT", [221]);
  } finally {
    await client.close();
  }
}

class SmtpClient {
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();
  private buffer = "";

  constructor(private readonly socket: ReturnType<typeof connect>) {
    this.writer = socket.writable.getWriter();
    this.reader = socket.readable.getReader();
  }

  async command(line: string, expectedCodes: number[]) {
    await this.write(`${line}\r\n`);
    return this.readReply(expectedCodes);
  }

  async write(value: string) {
    await this.writer.write(this.encoder.encode(value));
  }

  async readReply(expectedCodes: number[]) {
    const lines: string[] = [];

    while (true) {
      const line = await this.readLine();
      lines.push(line);
      if (line.length < 4) continue;
      if (line[3] === "-") continue;

      const code = Number.parseInt(line.slice(0, 3), 10);
      if (!expectedCodes.includes(code)) {
        throw new Error(`SMTP error ${code}: ${lines.join(" | ")}`);
      }
      return lines;
    }
  }

  private async readLine(): Promise<string> {
    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex !== -1) {
        const line = this.buffer.slice(0, newlineIndex + 1);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        return line.replace(/\r?\n$/, "");
      }

      const { value, done } = await this.reader.read();
      if (done) {
        if (this.buffer) {
          const line = this.buffer;
          this.buffer = "";
          return line;
        }
        throw new Error("SMTP connection closed unexpectedly.");
      }
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }

  async close() {
    await this.writer.close().catch(() => undefined);
    await this.reader.cancel().catch(() => undefined);
    this.socket.close();
  }
}

function smtpEhloName(fromAddress: string) {
  const domain = fromAddress.split("@")[1]?.trim();
  return domain && domain.length > 0 ? domain : "localhost";
}

function dotStuff(value: string) {
  return value.replace(/^\./gm, "..");
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
