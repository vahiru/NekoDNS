import type { Context } from "hono";
import type { AppBindings, RateLimiterName } from "./env";
import { clientIp, jsonError } from "./http";

/**
 * Cloudflare's rate limiting binding counts per-colo rather than globally, so treat it as abuse
 * damping rather than a hard quota. The binding is absent in tests and in some local runs; when it
 * is missing the check is skipped instead of failing the request closed.
 *
 * Returns a 429 response to return to the client, or null when the request may proceed.
 */
export async function enforceRateLimit(c: Context<AppBindings>, name: RateLimiterName, key: string) {
  const limiter = c.env[name];
  if (!limiter) return null;

  const { success } = await limiter.limit({ key: `${name}:${key}` });
  if (success) return null;

  console.warn("Rate limit hit", { limiter: name, path: c.req.path });
  return jsonError(c, 429, "请求过于频繁，请稍后再试。");
}

/** Falls back to a constant so a missing client IP does not create an unlimited bucket per request. */
export function rateLimitIp(c: Context<AppBindings>) {
  return clientIp(c) || "unknown-ip";
}
