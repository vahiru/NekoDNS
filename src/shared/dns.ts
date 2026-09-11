import { z } from "zod";
import { dnsRecordTypes } from "./dns-content";

export { dnsRecordTypes, normalizeRecordName, validateRecordContent } from "./dns-content";

export const dnsApplicationSchema = z.object({
  type: z.enum(dnsRecordTypes),
  name: z.string().trim().min(1).max(180),
  content: z.string().trim().min(1).max(4096),
  purpose: z.string().trim().max(1000).optional().default(""),
  ttl: z.coerce.number().int().min(60).max(86400).default(3600),
  proxied: z.boolean().optional().default(false),
});

export function isCoreRecordChange(current: { type: string; name: string; content: string }, next: { type: string; name: string; content: string }) {
  return current.type !== next.type || current.name !== next.name || current.content !== next.content;
}
