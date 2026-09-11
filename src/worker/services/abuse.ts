import type { Env } from "../env";
import { enqueueJobEnv } from "../jobs";

export const abuseActions = ["acknowledge", "suspend", "ignore"] as const;
export type AbuseAction = (typeof abuseActions)[number];

const statusByAction: Record<AbuseAction, string> = {
  acknowledge: "acknowledged",
  ignore: "ignored",
  suspend: "resolved",
};

export function isAbuseAction(value: string): value is AbuseAction {
  return (abuseActions as readonly string[]).includes(value);
}

/** Applies an abuse decision. Returns the report, or null when it does not exist. */
export async function applyAbuseAction(env: Env, reportId: string, action: AbuseAction) {
  const report = await env.DB.prepare("SELECT id, subdomain FROM abuse_reports WHERE id = ?")
    .bind(reportId)
    .first<{ id: string; subdomain: string }>();
  if (!report) return null;

  if (action === "suspend") {
    const record = await env.DB.prepare("SELECT id FROM dns_records WHERE name = ? AND status = 'active'")
      .bind(report.subdomain)
      .first<{ id: string }>();
    if (record) await enqueueJobEnv(env, "dns_delete", { recordId: record.id });
  }

  await env.DB.prepare("UPDATE abuse_reports SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(statusByAction[action], reportId)
    .run();

  return report;
}
