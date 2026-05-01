import { Hono } from "hono";
import type { AppBindings, Env } from "./env";
import type { JobMessage } from "../shared/types";
import { randomId } from "./crypto";
import { errorDetails, jsonError } from "./http";
import { processJob, replayDueOutbox } from "./jobs";
import admin from "./routes/admin";
import auth from "./routes/auth";
import abuse from "./routes/abuse";
import dns from "./routes/dns";
import telegram from "./routes/telegram";
import { processExpiredApplications } from "./services/approval";

const app = new Hono<AppBindings>();
const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

app.use("*", async (c, next) => {
  c.set("requestId", randomId("req"));
  await next();
  for (const [name, value] of Object.entries(securityHeaders)) c.res.headers.set(name, value);
});

app.onError((error, c) => {
  const requestId = c.get("requestId");
  const details = errorDetails(error);
  console.error("Unhandled worker error", { requestId, path: c.req.path, ...details, error });
  return jsonError(c, 500, `服务器内部错误（${requestId}）：${details.message}`, { requestId, error: details });
});

app.route("/api", auth);
app.route("/api", abuse);
app.route("/api", telegram);
app.route("/api", dns);
app.route("/api", admin);

app.get("*", async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  headers.set("Cache-Control", "no-store, max-age=0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch<JobMessage>, env: Env) {
    for (const message of batch.messages) {
      await processJob(env, message.body);
      message.ack();
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await processExpiredApplications(env);
    await replayDueOutbox(env);
    await env.DB.prepare("DELETE FROM sessions WHERE datetime(expires_at) < datetime('now')").run();
    await env.DB.prepare(
      `UPDATE users
       SET email_verification_token_hash = NULL, email_verification_expires_at = NULL
       WHERE email_verification_expires_at IS NOT NULL AND datetime(email_verification_expires_at) < datetime('now')`,
    ).run();
    await env.DB.prepare(
      `UPDATE users
       SET password_reset_token_hash = NULL, password_reset_expires_at = NULL
       WHERE password_reset_expires_at IS NOT NULL AND datetime(password_reset_expires_at) < datetime('now')`,
    ).run();
  },
};
