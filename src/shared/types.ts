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

export interface JobMessage {
  id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
}
