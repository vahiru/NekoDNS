import type { Context } from "hono";
import type { AppBindings, Env } from "./env";
import type { JobKind, JobMessage } from "../shared/types";
import { randomId } from "./crypto";
import { sendSystemEmail } from "./services/email";
import { applyDnsApplication, deleteCloudflareRecord } from "./services/cloudflare";
import { sendAbuseTelegram, sendApplicationTelegram, editTelegramMessage } from "./services/telegram";

export async function enqueueJob(c: Context<AppBindings>, kind: JobKind, payload: Record<string, unknown>) {
  return enqueueJobEnv(c.env, kind, payload);
}

export async function enqueueJobEnv(env: Env, kind: JobKind, payload: Record<string, unknown>) {
  const id = randomId("job");
  const message: JobMessage = { id, kind, payload };

  await env.DB.prepare("INSERT INTO outbox_jobs (id, kind, payload_json, status) VALUES (?, ?, ?, 'queued')")
    .bind(id, kind, JSON.stringify(payload))
    .run();

  await env.JOB_QUEUE.send(message);
  return id;
}

export async function processJob(env: Env, message: JobMessage) {
  try {
    if (message.kind === "email") await sendSystemEmail(env, message.payload);
    if (message.kind === "telegram_application") await sendApplicationTelegram(env, String(message.payload.applicationId));
    if (message.kind === "telegram_abuse") await sendAbuseTelegram(env, String(message.payload.reportId));
    if (message.kind === "telegram_edit") await editTelegramMessage(env, message.payload);
    if (message.kind === "dns_apply") await applyDnsApplication(env, String(message.payload.applicationId));
    if (message.kind === "dns_delete") await deleteCloudflareRecord(env, String(message.payload.recordId));

    await env.DB.prepare("UPDATE outbox_jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?").bind(message.id).run();
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      `UPDATE outbox_jobs
       SET status = 'error', attempts = attempts + 1, last_error = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(messageText, message.id)
      .run();
    throw error;
  }
}

export async function replayDueOutbox(env: Env) {
  const jobs = await env.DB.prepare(
    `SELECT id, kind, payload_json FROM outbox_jobs
     WHERE status = 'error' AND attempts < 5 AND datetime(run_after) <= datetime('now')
     LIMIT 25`,
  ).all<{ id: string; kind: JobKind; payload_json: string }>();

  for (const job of jobs.results) {
    await env.DB.prepare("UPDATE outbox_jobs SET status = 'queued', updated_at = datetime('now') WHERE id = ?").bind(job.id).run();
    await env.JOB_QUEUE.send({ id: job.id, kind: job.kind, payload: JSON.parse(job.payload_json) });
  }
}
