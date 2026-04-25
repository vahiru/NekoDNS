import type { PublicUser } from "../shared/types";

export interface ApiConfig {
  parentDomain: string;
  turnstileSiteKey: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data as T;
}

export const client = {
  config: () => api<ApiConfig>("/public/config"),
  me: () => api<PublicUser>("/me"),
  login: (body: unknown) => api<{ message: string }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  register: (body: unknown) => api<{ message: string }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  logout: () => api<{ message: string }>("/auth/logout", { method: "POST" }),
  forgotPassword: (body: unknown) => api<{ message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify(body) }),
  resetPassword: (body: unknown) => api<{ message: string }>("/auth/reset-password", { method: "POST", body: JSON.stringify(body) }),
  records: () => api<any[]>("/dns/records"),
  applications: () => api<any[]>("/applications"),
  submitApplication: (body: unknown) => api<{ id: string; message: string }>("/dns/applications", { method: "POST", body: JSON.stringify(body) }),
  updateRecord: (id: string, body: unknown) => api<{ id: string; message: string }>(`/dns/records/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteRecord: (id: string) => api<{ message: string }>(`/dns/records/${id}`, { method: "DELETE" }),
  adminUsers: () => api<any[]>("/admin/users"),
  adminRecords: () => api<any[]>("/admin/dns-records"),
  adminApplications: () => api<any[]>("/admin/applications"),
  adminAbuseReports: () => api<any[]>("/admin/abuse-reports"),
  adminAuditLogs: () => api<any[]>("/admin/audit-logs"),
  setRole: (id: string, role: "user" | "admin") => api<{ message: string }>(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  vote: (id: string, vote: "approve" | "deny") => api<{ message: string }>(`/admin/applications/${id}/vote`, { method: "POST", body: JSON.stringify({ vote }) }),
  decision: (id: string, status: "approved" | "rejected", reason: string) =>
    api<{ message: string }>(`/admin/applications/${id}/decision`, { method: "POST", body: JSON.stringify({ status, reason }) }),
  abuseAction: (id: string, action: string) => api<{ message: string }>(`/admin/abuse-reports/${id}/${action}`, { method: "POST" }),
  bindToken: () => api<{ token: string; command: string }>("/me/telegram-bind-token", { method: "POST" }),
  reportAbuse: (body: unknown) => api<{ message: string }>("/report-abuse", { method: "POST", body: JSON.stringify(body) }),
};
