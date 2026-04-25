import { z } from "zod";
import type { DnsRecordType } from "./types";

export const dnsRecordTypes = ["A", "AAAA", "CNAME", "TXT"] as const;
const reservedLabels = new Set([
  "admin",
  "api",
  "abuse",
  "dashboard",
  "mail",
  "smtp",
  "imap",
  "pop",
  "pop3",
  "root",
  "status",
  "support",
  "webmail",
  "ns",
  "ns1",
  "ns2",
]);

export const dnsApplicationSchema = z.object({
  type: z.enum(dnsRecordTypes),
  name: z.string().trim().min(1).max(180),
  content: z.string().trim().min(1).max(4096),
  purpose: z.string().trim().max(1000).optional().default(""),
  ttl: z.coerce.number().int().min(60).max(86400).default(3600),
  proxied: z.boolean().optional().default(false),
});

export function normalizeRecordName(input: string, parentDomain: string): string {
  const parent = parentDomain.toLowerCase().replace(/\.$/, "");
  let name = input.trim().toLowerCase().replace(/\.$/, "");

  if (name === "" || name === "@" || name === parent) {
    throw new Error("不允许申请根域名记录。");
  }

  if (name.endsWith(`.${parent}`)) {
    name = name.slice(0, -parent.length - 1);
  }

  if (name.includes("..") || name.includes("*")) {
    throw new Error("域名不能包含空标签或通配符。");
  }

  const labels = name.split(".");
  if (labels.length > 6) {
    throw new Error("子域名层级过深。");
  }

  for (const label of labels) {
    const allowUnderscore = label.startsWith("_");
    const pattern = allowUnderscore ? /^_[a-z0-9-]{1,62}$/ : /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    if (!pattern.test(label)) {
      throw new Error(`无效的域名标签：${label}`);
    }
  }

  if (reservedLabels.has(labels[0])) {
    throw new Error(`保留名称不可申请：${labels[0]}`);
  }

  return `${name}.${parent}`;
}

export function validateRecordContent(type: DnsRecordType, content: string): void {
  if (type === "A" && !/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(content)) {
    throw new Error("A 记录必须是有效 IPv4 地址。");
  }

  if (type === "AAAA" && !/^[0-9a-f:]+$/i.test(content)) {
    throw new Error("AAAA 记录必须是有效 IPv6 地址。");
  }

  if (type === "CNAME") {
    const value = content.toLowerCase().replace(/\.$/, "");
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(value)) {
      throw new Error("CNAME 记录必须指向有效域名。");
    }
  }

  if (type === "TXT" && content.length > 4096) {
    throw new Error("TXT 内容过长。");
  }
}

export function isCoreRecordChange(current: { type: string; name: string; content: string }, next: { type: string; name: string; content: string }) {
  return current.type !== next.type || current.name !== next.name || current.content !== next.content;
}
