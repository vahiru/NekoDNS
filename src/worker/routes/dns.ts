import { Hono, type Context } from "hono";
import type { AppBindings } from "../env";
import { audit } from "../audit";
import { randomId } from "../crypto";
import { jsonError, requireUser } from "../http";
import { enqueueJob } from "../jobs";
import { dnsApplicationSchema, isCoreRecordChange, normalizeRecordName, validateRecordContent } from "../../shared/dns";

const MAX_PENDING_APPLICATIONS = 5;

const dns = new Hono<AppBindings>();
dns.use("*", requireUser);

/**
 * A name is unavailable when an active record holds it, or when another user already has a
 * pending application for it. `exceptRecordId` lets an update keep its own name.
 */
async function isNameTaken(c: Context<AppBindings>, fullName: string, exceptRecordId?: string) {
  const record = await c.env.DB.prepare("SELECT id FROM dns_records WHERE name = ? AND status != 'deleted'")
    .bind(fullName)
    .first<{ id: string }>();
  if (record && record.id !== exceptRecordId) return true;

  const pending = await c.env.DB.prepare(
    `SELECT id FROM applications
     WHERE subdomain = ? AND status IN ('pending', 'approved', 'applying')
       AND (target_dns_record_id IS NULL OR target_dns_record_id != ?)`,
  )
    .bind(fullName, exceptRecordId ?? "")
    .first<{ id: string }>();
  return Boolean(pending);
}

dns.get("/dns/records", async (c) => {
  const user = c.get("user");
  const records = await c.env.DB.prepare("SELECT * FROM dns_records WHERE user_id = ? AND status != 'deleted' ORDER BY created_at DESC")
    .bind(user.id)
    .all();
  return c.json(records.results);
});

dns.get("/applications", async (c) => {
  const user = c.get("user");
  const apps = await c.env.DB.prepare("SELECT * FROM applications WHERE user_id = ? ORDER BY created_at DESC")
    .bind(user.id)
    .all();
  return c.json(apps.results);
});

dns.post("/dns/applications", async (c) => {
  const user = c.get("user");
  const parsed = dnsApplicationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, 400, "DNS 申请无效。", parsed.error.flatten());

  let fullName: string;
  try {
    fullName = normalizeRecordName(parsed.data.name, c.env.PARENT_DOMAIN);
    validateRecordContent(parsed.data.type, parsed.data.content);
  } catch (error) {
    return jsonError(c, 400, error instanceof Error ? error.message : "DNS 记录无效。");
  }

  if (await isNameTaken(c, fullName)) return jsonError(c, 409, "该域名已存在或已有待审批的申请。");

  const pendingCount = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM applications WHERE user_id = ? AND status = 'pending'")
    .bind(user.id)
    .first<{ total: number }>();
  if ((pendingCount?.total ?? 0) >= MAX_PENDING_APPLICATIONS) {
    return jsonError(c, 429, `您已有 ${MAX_PENDING_APPLICATIONS} 个待审批的申请，请等待处理后再提交。`);
  }

  const appId = randomId("app");
  await c.env.DB.prepare(
    `INSERT INTO applications
     (id, user_id, request_type, subdomain, record_type, record_value, purpose, ttl, proxied, voting_deadline_at)
     VALUES (?, ?, 'create', ?, ?, ?, ?, ?, ?, datetime('now', '+12 hours'))`,
  )
    .bind(appId, user.id, fullName, parsed.data.type, parsed.data.content, parsed.data.purpose, parsed.data.ttl, parsed.data.proxied ? 1 : 0)
    .run();
  await enqueueJob(c, "telegram_application", { applicationId: appId });
  await enqueueJob(c, "email", {
    to: user.email,
    subject: `域名申请已提交：${fullName}`,
    html: `<h1>申请已提交</h1><p>${fullName} 已进入管理员审核。</p>`,
  });
  await audit(c, "dns.application.create", "application", appId, { subdomain: fullName });
  return c.json({ message: "申请已提交，等待管理员审批。", id: appId }, 202);
});

dns.put("/dns/records/:id", async (c) => {
  const user = c.get("user");
  const recordId = c.req.param("id");
  const parsed = dnsApplicationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, 400, "DNS 更新无效。", parsed.error.flatten());

  const record = await c.env.DB.prepare("SELECT * FROM dns_records WHERE id = ? AND user_id = ? AND status = 'active'")
    .bind(recordId, user.id)
    .first<{ id: string; type: string; name: string; content: string }>();
  if (!record) return jsonError(c, 404, "记录不存在或无权修改。");

  let fullName: string;
  try {
    fullName = normalizeRecordName(parsed.data.name, c.env.PARENT_DOMAIN);
    validateRecordContent(parsed.data.type, parsed.data.content);
  } catch (error) {
    return jsonError(c, 400, error instanceof Error ? error.message : "DNS 记录无效。");
  }

  if (fullName !== record.name && (await isNameTaken(c, fullName, record.id))) {
    return jsonError(c, 409, "该域名已存在或已有待审批的申请。");
  }

  const coreChanged = isCoreRecordChange(record, { type: parsed.data.type, name: fullName, content: parsed.data.content });
  const appId = randomId("app");
  await c.env.DB.prepare(
    `INSERT INTO applications
     (id, user_id, request_type, target_dns_record_id, subdomain, record_type, record_value, purpose, ttl, proxied, voting_deadline_at)
     VALUES (?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, datetime('now', '+12 hours'))`,
  )
    .bind(appId, user.id, recordId, fullName, parsed.data.type, parsed.data.content, parsed.data.purpose || (coreChanged ? "更新 DNS 记录" : "更新 TTL/代理状态"), parsed.data.ttl, parsed.data.proxied ? 1 : 0)
    .run();
  await enqueueJob(c, "telegram_application", { applicationId: appId });
  await audit(c, "dns.application.update", "application", appId, { recordId });
  return c.json({ message: "更新申请已提交，等待管理员审批。", id: appId }, 202);
});

dns.delete("/dns/records/:id", async (c) => {
  const user = c.get("user");
  const recordId = c.req.param("id");
  const record = await c.env.DB.prepare("SELECT id FROM dns_records WHERE id = ? AND user_id = ? AND status = 'active'")
    .bind(recordId, user.id)
    .first();
  if (!record) return jsonError(c, 404, "记录不存在或无权删除。");
  await c.env.DB.prepare("UPDATE dns_records SET status = 'suspended', updated_at = datetime('now') WHERE id = ?").bind(recordId).run();
  await enqueueJob(c, "dns_delete", { recordId });
  await audit(c, "dns.record.delete", "dns_record", recordId);
  return c.json({ message: "删除任务已提交。" }, 202);
});

export default dns;
