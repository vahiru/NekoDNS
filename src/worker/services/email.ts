import { EmailMessage } from "cloudflare:email";
import { connect } from "cloudflare:sockets";
import type { Env } from "../env";

interface EmailPayload {
  to?: unknown;
  subject?: unknown;
  html?: unknown;
}

interface VerificationEmailOptions {
  title?: string;
  intro?: string;
  flow?: "default" | "migration";
}

const EMAIL_STYLE = `
  body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 20px auto; padding: 40px; border: 1px solid #e0e0e0; border-radius: 16px; background-color: #ffffff; }
  h1 { color: #386A20; font-size: 24px; font-weight: 700; margin-top: 0; }
  p { margin: 16px 0; }
  .button { display: inline-block; padding: 12px 32px; background-color: #386A20; color: #ffffff !important; text-decoration: none; border-radius: 999px; font-weight: 600; margin: 20px 0; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #888; }
  .link { color: #386A20; word-break: break-all; }
`;

function wrapLayout(content: string) {
  return `
    <html>
      <head><style>${EMAIL_STYLE}</style></head>
      <body>
        <div class="container">
          ${content}
          <div class="footer">
            此邮件由 NekoDNS 系统自动发出，请勿直接回复。<br>
            如果您没有进行相关操作，请忽略此邮件。
          </div>
        </div>
      </body>
    </html>
  `;
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

export function verificationEmail(origin: string, token: string, options: VerificationEmailOptions = {}) {
  const flow = options.flow === "migration" ? "&flow=migration" : "";
  const url = `${origin}/verify-email?token=${encodeURIComponent(token)}${flow}`;
  const title = options.title ?? "验证您的 NekoDNS 邮箱地址";
  const intro = options.intro ?? "感谢您注册 NekoDNS。为了激活您的账户并开始使用动态域名服务，请点击下方按钮完成邮箱验证：";
  
  return wrapLayout(`
    <h1>${title}</h1>
    <p>${intro}</p>
    <a href="${url}" class="button">立即验证邮箱</a>
    <p>如果按钮无法点击，请复制以下链接粘贴至浏览器访问：</p>
    <p><a href="${url}" class="link">${url}</a></p>
    <p>此链接将在 1 小时内有效。</p>
  `);
}

export function migrationVerificationEmail(origin: string, token: string, passwordResetToken: string) {
  const url = `${origin}/verify-email?token=${encodeURIComponent(token)}&flow=migration&nextToken=${encodeURIComponent(passwordResetToken)}`;
  return wrapLayout(`
    <h1>请重新验证您的 NekoDNS 邮箱</h1>
    <p>为了提供更安全稳定的服务，NekoDNS 已完成核心系统架构升级。基于安全性考量，我们需要您重新验证您的邮箱地址。</p>
    <p>验证完成后，系统将立即引导您设置全新的登录密码。</p>
    <a href="${url}" class="button">重新验证并设置密码</a>
    <p>如果按钮无法点击，请复制以下链接：</p>
    <p><a href="${url}" class="link">${url}</a></p>
    <p>此链接将在 1 小时内有效。</p>
  `);
}

export function legacyMigrationVerificationEmail(origin: string, token: string) {
  return verificationEmail(origin, token, {
    title: "安全迁移：重新验证您的邮箱",
    intro: "系统检测到您的账户需要进行安全性迁移。请点击下方按钮重新验证邮箱，随后您将可以设置新的登录密码并继续使用服务。",
    flow: "migration",
  });
}

export function resetPasswordEmail(origin: string, token: string) {
  const url = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  return wrapLayout(`
    <h1>重置您的 NekoDNS 登录密码</h1>
    <p>我们收到了重置您账户密码的请求。请点击下方按钮设置新密码：</p>
    <a href="${url}" class="button">重置我的密码</a>
    <p>如果这不是您本人发起的操作，请忽略此邮件，您的密码将保持不变。</p>
    <p>链接有效时间：1 小时。</p>
    <p><a href="${url}" class="link">${url}</a></p>
  `);
}

export function applicationResultEmail(domain: string, status: string, reason?: string) {
  const isApproved = status === "approved" || status === "applied";
  const statusText = isApproved ? "已通过审批" : "未通过审批";
  const title = `域名申请处理结果：${statusText}`;

  return wrapLayout(`
    <h1>${title}</h1>
    <p>您好，关于您申请的域名 <strong>${domain}</strong>，系统处理结果如下：</p>
    <p style="font-size: 18px; font-weight: bold; color: ${isApproved ? "#386A20" : "#BA1A1A"};">
      状态：${statusText}
    </p>
    ${reason ? `<p><strong>审批说明：</strong>${reason}</p>` : ""}
    ${isApproved ? `<p>现在您可以登录控制面板管理该记录的解析目标。</p>` : `<p>如有疑问，您可以尝试修改申请信息后重新提交。</p>`}
  `);
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(value)))}?=`;
}
