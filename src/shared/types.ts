export type UserRole = "user" | "admin";
export type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT";
export type ApplicationStatus = "pending" | "approved" | "rejected" | "expired" | "applying" | "applied" | "error";
export type VoteType = "approve" | "deny";
export type JobKind =
  | "email"
  | "telegram_application"
  | "telegram_abuse"
  | "telegram_edit"
  | "dns_apply"
  | "dns_delete";

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  telegramUserId: string | null;
  emailVerifiedAt: string | null;
}

/** Row shapes returned by the API. `proxied` is SQLite's 0/1 integer. */
export interface DnsRecordRow {
  id: string;
  user_id: string;
  type: DnsRecordType;
  name: string;
  content: string;
  ttl: number;
  proxied: number;
  cloudflare_record_id: string | null;
  status: "active" | "suspended" | "deleted";
  created_at: string;
  updated_at: string;
}

export interface AdminDnsRecordRow extends DnsRecordRow {
  username: string;
  email: string;
}

export interface ApplicationRow {
  id: string;
  user_id: string;
  request_type: "create" | "update";
  target_dns_record_id: string | null;
  subdomain: string;
  record_type: DnsRecordType;
  record_value: string;
  purpose: string | null;
  ttl: number;
  proxied: number;
  status: ApplicationStatus;
  admin_notes: string | null;
  last_error: string | null;
  voting_deadline_at: string;
  created_at: string;
  updated_at: string;
}

export interface AdminApplicationRow extends ApplicationRow {
  username: string;
  email: string;
}

export interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  email_verified_at: string | null;
  telegram_user_id: string | null;
  created_at: string;
}

export interface AbuseReportRow {
  id: string;
  subdomain: string;
  reason: string;
  details: string | null;
  status: "new" | "acknowledged" | "resolved" | "ignored";
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  username: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  ip: string | null;
  created_at: string;
}

export interface JobMessage {
  id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
}
