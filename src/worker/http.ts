import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { AppBindings, AppUser } from "./env";
import { sha256Hex } from "./crypto";

export function jsonError(c: Context, status: number, message: string, details?: unknown) {
  return c.json({ message, details }, status as never);
}

export async function requireUser(c: Context<AppBindings>, next: Next) {
  const token = getCookie(c, "nekodns_session");
  if (!token) return jsonError(c, 401, "请先登录。");

  const tokenHash = await sha256Hex(token);
  const user = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.role, u.telegram_user_id, u.email_verified_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now')`,
  )
    .bind(tokenHash)
    .first<AppUser>();

  if (!user) return jsonError(c, 401, "登录状态已过期。");

  await c.env.DB.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE token_hash = ?").bind(tokenHash).run();
  c.set("user", user);
  return next();
}

export async function requireAdmin(c: Context<AppBindings>, next: Next) {
  const user = c.get("user");
  if (!user || user.role !== "admin") return jsonError(c, 403, "需要管理员权限。");
  return next();
}

export function clientIp(c: Context<AppBindings>) {
  return c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "";
}
