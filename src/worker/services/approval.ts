import type { Context } from "hono";
import type { AppBindings, Env } from "../env";
import type { VoteType } from "../../shared/types";
import { randomId } from "../crypto";
import { enqueueJob, enqueueJobEnv } from "../jobs";
import { applicationResultEmail } from "./email";

export async function castVote(c: Context<AppBindings>, applicationId: string, voteType: VoteType, source: "web" | "telegram", telegramUserId?: string) {
  const user = c.get("user");
  const app = await c.env.DB.prepare("SELECT * FROM applications WHERE id = ?").bind(applicationId).first<{ status: string; voting_deadline_at: string }>();
  if (!app) throw new Error("申请不存在。");
  if (app.status !== "pending") throw new Error("申请已处理。");
  if (new Date(app.voting_deadline_at).getTime() < Date.now()) throw new Error("投票已截止。");

  await c.env.DB.prepare(
    `INSERT INTO application_votes (id, application_id, admin_user_id, admin_telegram_user_id, vote_type, source)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(application_id, admin_user_id)
     DO UPDATE SET vote_type = excluded.vote_type, source = excluded.source`,
  )
    .bind(randomId("vote"), applicationId, user.id, telegramUserId ?? null, voteType, source)
    .run();

  const tally = await getVoteTally(c.env, applicationId);
  if (tally.approve >= 1) await decideApplication(c.env, applicationId, "approved", `管理员 ${user.username} 批准`);
  if (tally.deny >= 2) await decideApplication(c.env, applicationId, "rejected", `2 票拒绝`);
  return tally;
}

export async function decideApplication(env: Env, applicationId: string, status: "approved" | "rejected" | "expired", reason: string) {
  const app = await env.DB.prepare(
    `SELECT a.*, u.email
     FROM applications a JOIN users u ON u.id = a.user_id
     WHERE a.id = ?`,
  )
    .bind(applicationId)
    .first<{ id: string; status: string; subdomain: string; email: string; telegram_message_id: string | null }>();
  if (!app || app.status !== "pending") return;

  await env.DB.prepare("UPDATE applications SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(status, reason, applicationId)
    .run();

  if (status === "approved") {
    await enqueueJobEnv(env, "dns_apply", { applicationId });
  } else {
    await enqueueJobEnv(env, "email", {
      to: app.email,
      subject: `域名申请${status === "rejected" ? "被拒绝" : "已过期"}：${app.subdomain}`,
      html: applicationResultEmail(app.subdomain, status === "rejected" ? "被拒绝" : "已过期", reason),
    });
  }

  if (app.telegram_message_id) {
    await enqueueJobEnv(env, "telegram_edit", {
      messageId: app.telegram_message_id,
      text: `申请 \`${app.subdomain}\` 已${status === "approved" ? "批准" : status === "rejected" ? "拒绝" : "过期"}。\n原因：${reason}`,
    });
  }
}

export async function decideApplicationFromContext(c: Context<AppBindings>, applicationId: string, status: "approved" | "rejected", reason: string) {
  await c.env.DB.prepare("UPDATE applications SET status = ?, admin_notes = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(status, reason, applicationId)
    .run();
  if (status === "approved") await enqueueJob(c, "dns_apply", { applicationId });
}

export async function getVoteTally(env: Env, applicationId: string) {
  const rows = await env.DB.prepare("SELECT vote_type, COUNT(*) as total FROM application_votes WHERE application_id = ? GROUP BY vote_type")
    .bind(applicationId)
    .all<{ vote_type: VoteType; total: number }>();
  return {
    approve: rows.results.find((row) => row.vote_type === "approve")?.total ?? 0,
    deny: rows.results.find((row) => row.vote_type === "deny")?.total ?? 0,
  };
}

export async function processExpiredApplications(env: Env) {
  const apps = await env.DB.prepare(
    `SELECT id FROM applications
     WHERE status = 'pending' AND datetime(voting_deadline_at) < datetime('now')
     LIMIT 50`,
  ).all<{ id: string }>();

  for (const app of apps.results) {
    const tally = await getVoteTally(env, app.id);
    if (tally.approve === 0 && tally.deny === 0) await decideApplication(env, app.id, "expired", "投票超时，无人投票");
    else if (tally.approve > tally.deny) await decideApplication(env, app.id, "approved", `投票结束：批准 ${tally.approve}，拒绝 ${tally.deny}`);
    else await decideApplication(env, app.id, "rejected", `投票结束：批准 ${tally.approve}，拒绝 ${tally.deny}`);
  }
}
