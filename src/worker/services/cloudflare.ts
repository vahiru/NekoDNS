import type { Env } from "../env";
import { applicationResultEmail } from "./email";
import { enqueueJobEnv } from "../jobs";

interface ApplicationRow {
  id: string;
  user_id: string;
  request_type: "create" | "update";
  target_dns_record_id: string | null;
  subdomain: string;
  record_type: string;
  record_value: string;
  ttl: number;
  proxied: number;
  status: string;
  email: string;
}

export async function applyDnsApplication(env: Env, applicationId: string) {
  const app = await env.DB.prepare(
    `SELECT a.*, u.email
     FROM applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = ?`,
  )
    .bind(applicationId)
    .first<ApplicationRow>();

  if (!app || (app.status !== "approved" && app.status !== "applying")) return;

  await env.DB.prepare("UPDATE applications SET status = 'applying', apply_attempts = apply_attempts + 1 WHERE id = ?").bind(app.id).run();

  try {
    const payload = {
      type: app.record_type,
      name: app.subdomain,
      content: app.record_value,
      ttl: app.ttl,
      proxied: Boolean(app.proxied) && (app.record_type === "A" || app.record_type === "AAAA" || app.record_type === "CNAME"),
    };

    if (app.request_type === "create") {
      const response = await cloudflareFetch(env, "dns_records", "POST", payload);
      await env.DB.prepare(
        `INSERT INTO dns_records (id, user_id, type, name, content, ttl, proxied, cloudflare_record_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(response.result.id, app.user_id, app.record_type, app.subdomain, app.record_value, app.ttl, app.proxied, response.result.id)
        .run();
    } else if (app.target_dns_record_id) {
      const record = await env.DB.prepare("SELECT * FROM dns_records WHERE id = ?").bind(app.target_dns_record_id).first<{ cloudflare_record_id: string }>();
      if (!record) throw new Error("Target DNS record not found.");
      const response = await cloudflareFetch(env, `dns_records/${record.cloudflare_record_id}`, "PUT", payload);
      await env.DB.prepare(
        `UPDATE dns_records
         SET type = ?, name = ?, content = ?, ttl = ?, proxied = ?, cloudflare_record_id = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
        .bind(app.record_type, app.subdomain, app.record_value, app.ttl, app.proxied, response.result.id, app.target_dns_record_id)
        .run();
    }

    await env.DB.prepare("UPDATE applications SET status = 'applied', last_error = NULL, updated_at = datetime('now') WHERE id = ?")
      .bind(app.id)
      .run();
    await enqueueJobEnv(env, "email", {
      to: app.email,
      subject: `域名申请已通过：${app.subdomain}`,
      html: applicationResultEmail(app.subdomain, "已通过"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare("UPDATE applications SET status = 'error', last_error = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(message, app.id)
      .run();
    await enqueueJobEnv(env, "email", {
      to: app.email,
      subject: `域名申请处理失败：${app.subdomain}`,
      html: applicationResultEmail(app.subdomain, "处理失败", message),
    });
    throw error;
  }
}

export async function deleteCloudflareRecord(env: Env, recordId: string) {
  const record = await env.DB.prepare("SELECT * FROM dns_records WHERE id = ?").bind(recordId).first<{ cloudflare_record_id: string }>();
  if (!record) return;
  await cloudflareFetch(env, `dns_records/${record.cloudflare_record_id}`, "DELETE");
  await env.DB.prepare("UPDATE dns_records SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").bind(recordId).run();
}

async function cloudflareFetch(env: Env, path: string, method: string, body?: unknown): Promise<{ success: boolean; result: { id: string } }> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await response.json()) as { success?: boolean; result?: { id: string }; errors?: Array<{ message: string }> };
  if (!response.ok || !json.success || !json.result) {
    throw new Error(json.errors?.map((error) => error.message).join("; ") || `Cloudflare API failed: ${response.status}`);
  }
  return json as { success: boolean; result: { id: string } };
}
