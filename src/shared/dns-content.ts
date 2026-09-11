import type { DnsRecordType } from "./types";

export const dnsRecordTypes = ["A", "AAAA", "CNAME", "TXT"] as const;

export function validateRecordContent(type: DnsRecordType, content: string): void {
  const value = content.trim();

  if (!value) {
    throw new Error("记录内容不能为空。");
  }

  if (type === "A" && !isValidIpv4(value)) {
    throw new Error("A 记录必须是有效 IPv4 地址。");
  }

  if (type === "AAAA" && !isValidIpv6(value)) {
    throw new Error("AAAA 记录必须是有效 IPv6 地址。");
  }

  if (type === "CNAME") {
    const target = value.toLowerCase().replace(/\.$/, "");
    if (isValidIpv4(target) || isValidIpv6(target)) {
      throw new Error("CNAME 记录必须指向域名，不能填写 IP 地址。");
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(target)) {
      throw new Error("CNAME 记录必须指向有效域名。");
    }
  }

  if (type === "TXT" && value.length > 4096) {
    throw new Error("TXT 内容过长。");
  }
}

function isValidIpv4(value: string) {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value);
}

function isValidIpv6(value: string) {
  if (!/^[0-9a-f:.]+$/i.test(value) || value.includes(":::")) return false;

  const parts = value.split("::");
  if (parts.length > 2) return false;

  const hasIpv4Tail = value.includes(".");
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts[1] ? parts[1].split(":") : [];
  const groups = [...head, ...tail];
  if (groups.some((group) => group === "")) return false;

  let groupCount = 0;
  for (const [index, group] of groups.entries()) {
    const isLast = index === groups.length - 1;
    if (hasIpv4Tail && isLast && isValidIpv4(group)) {
      groupCount += 2;
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return false;
    groupCount += 1;
  }

  return parts.length === 2 ? groupCount < 8 : groupCount === 8;
}

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

/**
 * Control labels that must not sit directly under the parent domain: `_acme-challenge.<parent>`
 * would let its owner issue certificates for the apex, `_dmarc.<parent>` would let them rewrite
 * mail policy. Deeper down they are legitimate -- `_acme-challenge.myapp.<parent>` only proves
 * control of a subdomain the applicant already owns -- so these are checked on the last label only.
 */
const reservedApexControlLabels = new Set(["_acme-challenge", "_dmarc", "_domainkey", "_mta-sts", "_smtp"]);

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

  // The label directly under the parent owns the whole subtree, so `www.admin` has to be
  // rejected just like `admin`; the leftmost label is still checked for backwards compatibility.
  const parentChildLabel = labels[labels.length - 1];
  for (const label of new Set([labels[0], parentChildLabel])) {
    if (reservedLabels.has(label)) {
      throw new Error(`保留名称不可申请：${label}`);
    }
  }
  if (reservedApexControlLabels.has(parentChildLabel)) {
    throw new Error(`保留名称不可申请：${parentChildLabel}`);
  }

  return `${name}.${parent}`;
}
