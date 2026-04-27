import { Hono, type Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppBindings } from "../env";
import { audit } from "../audit";
import { hashPassword, randomId, randomToken, sha256Hex, verifyPassword } from "../crypto";
import { clientIp, jsonError, requireUser } from "../http";
import { enqueueJob } from "../jobs";
import { resetPasswordEmail, verificationEmail } from "../services/email";
import { verifyTurnstile } from "../services/turnstile";

const auth = new Hono<AppBindings>();

const USERNAME_REGEX = /^[\p{L}\p{N}_-]+$/u;

function asText(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

const optionalTurnstileToken = z.preprocess(
  (value) => {
    if (typeof value !== "string") return undefined;
    const token = value.trim();
    return token.length > 0 ? token : undefined;
  },
  z.string().optional(),
);

async function readAuthBody(c: Context<AppBindings>) {
  const contentType = c.req.header("content-type") ?? "";
  const isFormBody = contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
  if (isFormBody) {
    const form = await c.req.parseBody().catch(() => null);
    if (!form) return null;
    return Object.fromEntries(
      Object.entries(form).map(([key, value]) => {
        const first = Array.isArray(value) ? value[0] : value;
        return [key, typeof first === "string" ? first : ""];
      }),
    );
  }
  return await c.req.json().catch(() => null);
}

async function ensureTurnstile(c: Context<AppBindings>, token?: string) {
  const checked = await verifyTurnstile(c.env, token, clientIp(c));
  if (checked.success) return null;
  const codes = checked.errorCodes.length ? checked.errorCodes.join(", ") : "unknown";
  return jsonError(c, 403, `人机验证失败（${codes}）。`, { turnstile: checked });
}

const registerSchema = z.object({
  username: z.preprocess(
    asText,
    z
      .string()
      .trim()
      .min(3, "用户名至少需要 3 个字符。")
      .max(32, "用户名最多 32 个字符。")
      .regex(USERNAME_REGEX, "用户名仅支持字母、数字、下划线和短横线。"),
  ),
  email: z.preprocess(
    asText,
    z.string().trim().email("邮箱格式不正确。").max(255, "邮箱长度不能超过 255。"),
  ),
  password: z.preprocess(
    asText,
    z.string().min(10, "密码至少需要 10 位。").max(200, "密码长度不能超过 200。"),
  ),
  turnstileToken: optionalTurnstileToken,
});

const loginSchema = z.object({
  login: z.preprocess(asText, z.string().trim().min(1, "请输入用户名或邮箱。").max(255)),
  password: z.preprocess(asText, z.string().min(1, "请输入密码。").max(200)),
  turnstileToken: optionalTurnstileToken,
});

auth.get("/public/config", (c) =>
  c.json({
    parentDomain: c.env.PARENT_DOMAIN,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
  }),
);

auth.post("/auth/register", async (c) => {
  const parsed = registerSchema.safeParse(await readAuthBody(c));
  if (!parsed.success) return jsonError(c, 400, "注册信息无效。", parsed.error.flatten());
  const turnstileError = await ensureTurnstile(c, parsed.data.turnstileToken);
  if (turnstileError) return turnstileError;

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE username = ? OR email = ?")
    .bind(parsed.data.username, parsed.data.email)
    .first();
  if (existing) return jsonError(c, 409, "用户名或邮箱已被注册。");

  const password = await hashPassword(parsed.data.password);
  const verificationToken = randomToken();
  const userId = randomId("usr");

  await c.env.DB.prepare(
    `INSERT INTO users
     (id, username, email, password_hash, password_salt, email_verification_token_hash, email_verification_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+1 hour'))`,
  )
    .bind(userId, parsed.data.username, parsed.data.email, password.hash, password.salt, await sha256Hex(verificationToken))
    .run();

  await enqueueJob(c, "email", {
    to: parsed.data.email,
    subject: "验证你的 NekoDNS 邮箱",
    html: verificationEmail(c.env.APP_ORIGIN, verificationToken),
  });
  await audit(c, "auth.register", "user", userId);
  return c.json({ message: "注册成功，请查收验证邮件。" }, 201);
});

auth.get("/auth/verify-email", async (c) => {
  const token = c.req.query("token");
  if (!token) return jsonError(c, 400, "缺少验证令牌。");

  const tokenHash = await sha256Hex(token);
  const result = await c.env.DB.prepare(
    `UPDATE users
     SET email_verified_at = datetime('now'), email_verification_token_hash = NULL, email_verification_expires_at = NULL
     WHERE email_verification_token_hash = ? AND datetime(email_verification_expires_at) > datetime('now')`,
  )
    .bind(tokenHash)
    .run();

  if (!result.meta.changes) return jsonError(c, 400, "验证链接无效或已过期。");
  return c.redirect("/?verified=1");
});

auth.post("/auth/login", async (c) => {
  const parsed = loginSchema.safeParse(await readAuthBody(c));
  if (!parsed.success) return jsonError(c, 400, "登录信息无效。");
  const turnstileError = await ensureTurnstile(c, parsed.data.turnstileToken);
  if (turnstileError) return turnstileError;

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE username = ? OR email = ?")
    .bind(parsed.data.login, parsed.data.login)
    .first<{
      id: string;
      username: string;
      email: string;
      role: string;
      password_hash: string;
      password_salt: string;
      email_verified_at: string | null;
    }>();

  if (!user || !(await verifyPassword(parsed.data.password, user.password_salt, user.password_hash))) {
    if (user?.password_salt === "legacy-bcrypt") return jsonError(c, 409, "旧版账户需要先通过邮箱重置密码。");
    return jsonError(c, 401, "用户名或密码错误。");
  }
  if (!user.email_verified_at) return jsonError(c, 403, "请先验证邮箱。");

  const token = randomToken();
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, datetime('now', '+30 days'))")
    .bind(randomId("ses"), user.id, await sha256Hex(token))
    .run();

  setCookie(c, "nekodns_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  await audit(c, "auth.login", "user", user.id);
  return c.json({ message: "登录成功。" });
});

auth.post("/auth/logout", requireUser, async (c) => {
  const token = c.req.header("Cookie")?.match(/nekodns_session=([^;]+)/)?.[1];
  if (token) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(decodeURIComponent(token))).run();
  }
  deleteCookie(c, "nekodns_session", { path: "/" });
  await audit(c, "auth.logout");
  return c.json({ message: "已登出。" });
});

auth.get("/me", requireUser, (c) => {
  const user = c.get("user");
  return c.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    telegramUserId: user.telegram_user_id,
    emailVerifiedAt: user.email_verified_at,
  });
});

auth.post("/auth/forgot-password", async (c) => {
  const body = z
    .object({
      email: z.preprocess(asText, z.string().trim().email("邮箱格式不正确。")),
      turnstileToken: optionalTurnstileToken,
    })
    .safeParse(await readAuthBody(c));
  if (!body.success) return jsonError(c, 400, "邮箱无效。");
  const turnstileError = await ensureTurnstile(c, body.data.turnstileToken);
  if (turnstileError) return turnstileError;

  const user = await c.env.DB.prepare("SELECT id, email FROM users WHERE email = ? AND email_verified_at IS NOT NULL")
    .bind(body.data.email)
    .first<{ id: string; email: string }>();
  if (user) {
    const token = randomToken();
    await c.env.DB.prepare("UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = datetime('now', '+1 hour') WHERE id = ?")
      .bind(await sha256Hex(token), user.id)
      .run();
    await enqueueJob(c, "email", {
      to: user.email,
      subject: "重置你的 NekoDNS 密码",
      html: resetPasswordEmail(c.env.APP_ORIGIN, token),
    });
  }

  return c.json({ message: "如果该邮箱已注册，你将收到重置邮件。" });
});

auth.post("/auth/reset-password", async (c) => {
  const body = z
    .object({
      token: z.preprocess(asText, z.string().trim().min(1, "重置令牌不能为空。")),
      password: z.preprocess(asText, z.string().min(10, "密码至少需要 10 位。")),
      turnstileToken: optionalTurnstileToken,
    })
    .safeParse(await readAuthBody(c));
  if (!body.success) return jsonError(c, 400, "重置信息无效。");
  const turnstileError = await ensureTurnstile(c, body.data.turnstileToken);
  if (turnstileError) return turnstileError;

  const password = await hashPassword(body.data.password);
  const result = await c.env.DB.prepare(
    `UPDATE users
     SET password_hash = ?, password_salt = ?, password_reset_token_hash = NULL, password_reset_expires_at = NULL
     WHERE password_reset_token_hash = ? AND datetime(password_reset_expires_at) > datetime('now')`,
  )
    .bind(password.hash, password.salt, await sha256Hex(body.data.token))
    .run();
  if (!result.meta.changes) return jsonError(c, 400, "重置链接无效或已过期。");
  return c.json({ message: "密码已更新。" });
});

export default auth;
