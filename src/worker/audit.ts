import type { Context } from "hono";
import type { AppBindings } from "./env";
import { randomId } from "./crypto";
import { clientIp } from "./http";

export async function audit(
  c: Context<AppBindings>,
  action: string,
  targetType?: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
) {
  const user = c.get("user");
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, ip, user_agent, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      randomId("aud"),
      user?.id ?? null,
      action,
      targetType ?? null,
      targetId ?? null,
      clientIp(c),
      c.req.header("User-Agent") ?? "",
      metadata ? JSON.stringify(metadata) : null,
    )
    .run();
}
