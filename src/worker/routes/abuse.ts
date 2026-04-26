import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings } from "../env";
import { audit } from "../audit";
import { randomId } from "../crypto";
import { clientIp, jsonError } from "../http";
import { enqueueJob } from "../jobs";
import { normalizeRecordName } from "../../shared/dns";
import { verifyTurnstile } from "../services/turnstile";

const abuse = new Hono<AppBindings>();

abuse.post("/report-abuse", async (c) => {
  const body = z
    .object({
      subdomain: z.string().trim().min(1).max(180),
      reason: z.string().trim().min(3).max(200),
      details: z.string().trim().max(2000).optional().default(""),
      turnstileToken: z.string().optional(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return jsonError(c, 400, "举报信息无效。");
  const turnstile = await verifyTurnstile(c.env, body.data.turnstileToken, clientIp(c));
  if (!turnstile.success) {
    const codes = turnstile.errorCodes.length ? turnstile.errorCodes.join(", ") : "unknown";
    return jsonError(c, 403, `人机验证失败（${codes}）。`, { turnstile });
  }

  let fullName: string;
  try {
    fullName = normalizeRecordName(body.data.subdomain, c.env.PARENT_DOMAIN);
  } catch {
    fullName = body.data.subdomain.toLowerCase();
  }

  const reportId = randomId("abr");
  await c.env.DB.prepare("INSERT INTO abuse_reports (id, subdomain, reason, details, reporter_ip) VALUES (?, ?, ?, ?, ?)")
    .bind(reportId, fullName, body.data.reason, body.data.details, clientIp(c))
    .run();
  await enqueueJob(c, "telegram_abuse", { reportId });
  await audit(c, "abuse.report.create", "abuse_report", reportId, { subdomain: fullName });
  return c.json({ message: "举报已提交，感谢反馈。" }, 201);
});

export default abuse;
