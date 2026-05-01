import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { audit } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import { jsonError, requireAdmin, requireUser } from "../http";
import { enqueueJob } from "../jobs";
import { castVote, decideApplication, getVoteTally } from "../services/approval";
import { adminRecordNoticeEmail } from "../services/email";

const admin = new Hono<AppBindings>();
admin.use("*", requireUser, requireAdmin);

admin.get("/admin/users", async (c) => {
  const users = await c.env.DB.prepare(
    "SELECT id, username, email, role, email_verified_at, telegram_user_id, created_at FROM users ORDER BY created_at DESC",
  ).all();
  return c.json(users.results);
});

admin.patch("/admin/users/:id/role", async (c) => {
  const body = z.object({ role: z.enum(["user", "admin"]) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return jsonError(c, 400, "角色无效。");
  if (c.req.param("id") === c.get("user").id && body.data.role !== "admin") return jsonError(c, 400, "不能降级当前登录的管理员。");

  await c.env.DB.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").bind(body.data.role, c.req.param("id")).run();
  await audit(c, "admin.user.role", "user", c.req.param("id"), { role: body.data.role });
  return c.json({ message: "角色已更新。" });
});

admin.get("/admin/dns-records", async (c) => {
  const records = await c.env.DB.prepare(
    `SELECT r.*, u.username, u.email
     FROM dns_records r JOIN users u ON u.id = r.user_id
     ORDER BY r.created_at DESC`,
  ).all();
  return c.json(records.results);
});

admin.post("/admin/dns-records/:id/notify-owner", async (c) => {
  const body = z
    .object({
      subject: z.string().trim().min(1).max(160),
      message: z.string().trim().min(1).max(4000),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return jsonError(c, 400, "邮件内容无效。", body.error.flatten());

  const record = await c.env.DB.prepare(
    `SELECT r.id, r.type, r.name, r.content, u.email
     FROM dns_records r JOIN users u ON u.id = r.user_id
     WHERE r.id = ?`,
  )
    .bind(c.req.param("id"))
    .first<{ id: string; type: string; name: string; content: string; email: string }>();
  if (!record) return jsonError(c, 404, "DNS 记录不存在。");

  await enqueueJob(c, "email", {
    to: record.email,
    subject: body.data.subject,
    html: adminRecordNoticeEmail(record, body.data.message),
  });
  await audit(c, "admin.dns_record.notify_owner", "dns_record", record.id, {
    subject: body.data.subject,
  });
  return c.json({ message: "邮件通知已加入发送队列。" }, 202);
});

admin.get("/admin/applications", async (c) => {
  const apps = await c.env.DB.prepare(
    `SELECT a.*, u.username, u.email
     FROM applications a JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC`,
  ).all();
  return c.json(apps.results);
});

admin.post("/admin/applications/:id/vote", async (c) => {
  const body = z.object({ vote: z.enum(["approve", "deny"]) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return jsonError(c, 400, "投票无效。");
  try {
    const tally = await castVote(c, c.req.param("id"), body.data.vote, "web");
    await audit(c, "admin.application.vote", "application", c.req.param("id"), { vote: body.data.vote, tally });
    return c.json({ message: "投票已记录。", tally });
  } catch (error) {
    return jsonError(c, 400, error instanceof Error ? error.message : "投票失败。");
  }
});

admin.post("/admin/applications/:id/decision", async (c) => {
  const body = z.object({ status: z.enum(["approved", "rejected"]), reason: z.string().trim().min(1).max(500) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return jsonError(c, 400, "裁决信息无效。");
  await decideApplication(c.env, c.req.param("id"), body.data.status, body.data.reason);
  await audit(c, "admin.application.decision", "application", c.req.param("id"), body.data);
  return c.json({ message: "裁决已提交。" });
});

admin.get("/admin/applications/:id/tally", async (c) => c.json(await getVoteTally(c.env, c.req.param("id"))));

admin.get("/admin/abuse-reports", async (c) => {
  const reports = await c.env.DB.prepare("SELECT * FROM abuse_reports ORDER BY created_at DESC").all();
  return c.json(reports.results);
});

admin.post("/admin/abuse-reports/:id/:action", async (c) => {
  const action = c.req.param("action");
  if (!["acknowledge", "suspend", "ignore"].includes(action)) return jsonError(c, 400, "举报处理动作无效。");

  const report = await c.env.DB.prepare("SELECT * FROM abuse_reports WHERE id = ?").bind(c.req.param("id")).first<{ subdomain: string }>();
  if (!report) return jsonError(c, 404, "举报不存在。");

  if (action === "acknowledge") {
    await c.env.DB.prepare("UPDATE abuse_reports SET status = 'acknowledged', updated_at = datetime('now') WHERE id = ?").bind(c.req.param("id")).run();
  }
  if (action === "ignore") {
    await c.env.DB.prepare("UPDATE abuse_reports SET status = 'ignored', updated_at = datetime('now') WHERE id = ?").bind(c.req.param("id")).run();
  }
  if (action === "suspend") {
    const record = await c.env.DB.prepare("SELECT id FROM dns_records WHERE name = ? AND status = 'active'").bind(report.subdomain).first<{ id: string }>();
    if (record) await enqueueJob(c, "dns_delete", { recordId: record.id });
    await c.env.DB.prepare("UPDATE abuse_reports SET status = 'resolved', updated_at = datetime('now') WHERE id = ?").bind(c.req.param("id")).run();
  }

  await audit(c, `admin.abuse.${action}`, "abuse_report", c.req.param("id"));
  return c.json({ message: "举报状态已更新。" });
});

admin.get("/admin/audit-logs", async (c) => {
  const logs = await c.env.DB.prepare(
    `SELECT l.*, u.username
     FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_user_id
     ORDER BY l.created_at DESC LIMIT 200`,
  ).all();
  return c.json(logs.results);
});

admin.post("/me/telegram-bind-token", async (c) => {
  const token = randomToken();
  await c.env.DB.prepare("UPDATE users SET telegram_bind_token_hash = ?, telegram_bind_expires_at = datetime('now', '+1 hour') WHERE id = ?")
    .bind(await sha256Hex(token), c.get("user").id)
    .run();
  await audit(c, "telegram.bind_token.create", "user", c.get("user").id);
  return c.json({ token, command: `/bind ${token}` });
});

export default admin;
