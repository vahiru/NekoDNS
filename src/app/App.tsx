import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Add, CheckCircle, Delete, Edit, HowToVote, Refresh, Send } from "@mui/icons-material";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PublicUser } from "../shared/types";
import { client, type ApiConfig } from "./api";
import { Shell, type ViewKey } from "./components/Shell";
import { TurnstileBox } from "./components/TurnstileBox";

export default function App() {
  const [config, setConfig] = useState<ApiConfig>();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [notice, setNotice] = useState<{ text: string; severity: "success" | "error" }>();
  const [loading, setLoading] = useState(true);

  const toast = useCallback((text: string, severity: "success" | "error" = "success") => setNotice({ text, severity }), []);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await client.me());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    client.config().then(setConfig).catch(() => undefined);
    refreshUser();
  }, [refreshUser]);

  const logout = async () => {
    await client.logout().catch(() => undefined);
    setUser(null);
  };

  if (loading) return <Centered title="NekoDNS" subtitle="正在加载" />;

  return (
    <>
      {user ? (
        <Shell user={user} view={view} onView={setView} onLogout={logout}>
          {view === "dashboard" && <Dashboard config={config} toast={toast} />}
          {view === "applications" && <Applications toast={toast} />}
          {view === "abuse" && <AbusePage config={config} toast={toast} />}
          {view === "admin" && <AdminPanel toast={toast} />}
        </Shell>
      ) : (
        <AuthScreen config={config} onAuthed={refreshUser} toast={toast} />
      )}
      <Snackbar open={Boolean(notice)} autoHideDuration={4200} onClose={() => setNotice(undefined)}>
        <Alert severity={notice?.severity ?? "success"} variant="filled" sx={{ width: "100%" }}>
          {notice?.text}
        </Alert>
      </Snackbar>
    </>
  );
}

function Centered({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default" }}>
      <Stack spacing={1} alignItems="center">
        <Typography variant="h4">{title}</Typography>
        <Typography color="text.secondary">{subtitle}</Typography>
      </Stack>
    </Box>
  );
}

function AuthScreen({ config, onAuthed, toast }: { config?: ApiConfig; onAuthed: () => void; toast: (text: string, severity?: "success" | "error") => void }) {
  const initialTab = location.pathname.includes("reset-password") ? 3 : location.search.includes("verified=1") ? 0 : 0;
  const [tab, setTab] = useState(initialTab);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});

  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    try {
      if (tab === 0) {
        await client.login({ login: form.login, password: form.password, turnstileToken });
        await onAuthed();
      }
      if (tab === 1) {
        await client.register({ username: form.username, email: form.email, password: form.password, turnstileToken });
        toast("注册成功，请验证邮箱。");
        setTab(0);
      }
      if (tab === 2) {
        await client.forgotPassword({ email: form.email, turnstileToken });
        toast("如果邮箱存在，重置邮件已发送。");
      }
      if (tab === 3) {
        const token = new URLSearchParams(location.search).get("token") || form.token;
        await client.resetPassword({ token, password: form.password, turnstileToken });
        toast("密码已更新。");
        setTab(0);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败。", "error");
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 2 }}>
      <Paper elevation={0} sx={{ width: "min(100%, 520px)", p: { xs: 2, sm: 4 }, border: "1px solid", borderColor: "divider" }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4">NekoDNS</Typography>
            <Typography color="text.secondary">Serverless domain registry</Typography>
          </Box>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable">
            <Tab label="登录" />
            <Tab label="注册" />
            <Tab label="找回密码" />
            <Tab label="重置密码" />
          </Tabs>
          {tab === 0 && (
            <Stack spacing={2}>
              <TextField label="用户名或邮箱" value={form.login || ""} onChange={(event) => update("login", event.target.value)} />
              <TextField label="密码" type="password" value={form.password || ""} onChange={(event) => update("password", event.target.value)} />
            </Stack>
          )}
          {tab === 1 && (
            <Stack spacing={2}>
              <TextField label="用户名" value={form.username || ""} onChange={(event) => update("username", event.target.value)} />
              <TextField label="邮箱" value={form.email || ""} onChange={(event) => update("email", event.target.value)} />
              <TextField label="密码" type="password" value={form.password || ""} onChange={(event) => update("password", event.target.value)} />
            </Stack>
          )}
          {tab === 2 && <TextField label="邮箱" value={form.email || ""} onChange={(event) => update("email", event.target.value)} />}
          {tab === 3 && (
            <Stack spacing={2}>
              <TextField label="重置令牌" value={form.token || new URLSearchParams(location.search).get("token") || ""} onChange={(event) => update("token", event.target.value)} />
              <TextField label="新密码" type="password" value={form.password || ""} onChange={(event) => update("password", event.target.value)} />
            </Stack>
          )}
          <TurnstileBox siteKey={config?.turnstileSiteKey} onToken={setTurnstileToken} />
          <Button startIcon={<Send />} onClick={submit}>
            提交
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

function Dashboard({ config, toast }: { config?: ApiConfig; toast: (text: string, severity?: "success" | "error") => void }) {
  const [records, setRecords] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>({ type: "A", ttl: 3600, proxied: false });
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(() => client.records().then(setRecords).catch((error) => toast(error.message, "error")), [toast]);
  useEffect(() => void refresh(), [refresh]);

  const submit = async () => {
    try {
      const body = { type: form.type, name: form.name, content: form.content, purpose: form.purpose, ttl: Number(form.ttl || 3600), proxied: Boolean(form.proxied) };
      const result = editingId ? await client.updateRecord(editingId, body) : await client.submitApplication(body);
      toast(result.message);
      setForm({ type: "A", ttl: 3600, proxied: false });
      setEditingId(null);
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "提交失败。", "error");
    }
  };

  return (
    <Stack spacing={3}>
      <Header title="DNS 记录" action={<Button startIcon={<Refresh />} onClick={refresh}>刷新</Button>} />
      <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1.5fr 1.5fr 1fr 1fr" }, gap: 2, alignItems: "center" }}>
          <Box>
            <TextField select fullWidth label="类型" value={form.type || "A"} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {["A", "AAAA", "CNAME", "TXT"].map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Box>
            <TextField fullWidth label={`名称 .${config?.parentDomain ?? ""}`} value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Box>
          <Box>
            <TextField fullWidth label="记录值" value={form.content || ""} onChange={(event) => setForm({ ...form, content: event.target.value })} />
          </Box>
          <Box>
            <TextField fullWidth label="TTL" type="number" value={form.ttl || 3600} onChange={(event) => setForm({ ...form, ttl: event.target.value })} />
          </Box>
          <Box>
            <Button fullWidth startIcon={<Add />} onClick={submit}>
              {editingId ? "提交更新" : "提交申请"}
            </Button>
          </Box>
          <Box sx={{ gridColumn: "1 / -1" }}>
            <TextField fullWidth label="用途" value={form.purpose || ""} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
          </Box>
        </Box>
      </Paper>
      <DataTable
        columns={["类型", "域名", "记录值", "TTL", "代理", "状态", "操作"]}
        rows={records}
        render={(record) => (
          <>
            <TableCell>{record.type}</TableCell>
            <TableCell>{record.name}</TableCell>
            <TableCell sx={{ maxWidth: 360, wordBreak: "break-all" }}>{record.content}</TableCell>
            <TableCell>{record.ttl}</TableCell>
            <TableCell>{record.proxied ? "是" : "否"}</TableCell>
            <TableCell>
              <StatusChip value={record.status} />
            </TableCell>
            <TableCell>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Edit />}
                  onClick={() => {
                    setEditingId(record.id);
                    setForm({ type: record.type, name: stripParent(record.name, config?.parentDomain), content: record.content, ttl: record.ttl, proxied: Boolean(record.proxied) });
                  }}
                >
                  编辑
                </Button>
                <Button size="small" color="error" variant="outlined" startIcon={<Delete />} onClick={() => client.deleteRecord(record.id).then((result) => toast(result.message)).then(refresh)}>
                  删除
                </Button>
              </Stack>
            </TableCell>
          </>
        )}
      />
    </Stack>
  );
}

function Applications({ toast }: { toast: (text: string, severity?: "success" | "error") => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const refresh = useCallback(() => client.applications().then(setRows).catch((error) => toast(error.message, "error")), [toast]);
  useEffect(() => void refresh(), [refresh]);
  return (
    <Stack spacing={3}>
      <Header title="申请记录" action={<Button startIcon={<Refresh />} onClick={refresh}>刷新</Button>} />
      <ApplicationTable rows={rows} />
    </Stack>
  );
}

function AbusePage({ config, toast }: { config?: ApiConfig; toast: (text: string, severity?: "success" | "error") => void }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");
  const submit = async () => {
    try {
      const result = await client.reportAbuse({ ...form, turnstileToken: token });
      toast(result.message);
      setForm({});
    } catch (error) {
      toast(error instanceof Error ? error.message : "举报失败。", "error");
    }
  };
  return (
    <Stack spacing={3}>
      <Header title="滥用举报" />
      <Paper elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider", maxWidth: 720 }}>
        <Stack spacing={2}>
          <TextField label="被举报域名" value={form.subdomain || ""} onChange={(event) => setForm({ ...form, subdomain: event.target.value })} />
          <TextField label="原因" value={form.reason || ""} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          <TextField label="详情" multiline minRows={4} value={form.details || ""} onChange={(event) => setForm({ ...form, details: event.target.value })} />
          <TurnstileBox siteKey={config?.turnstileSiteKey} onToken={setToken} />
          <Button startIcon={<Send />} onClick={submit}>
            提交举报
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}

function AdminPanel({ toast }: { toast: (text: string, severity?: "success" | "error") => void }) {
  const [tab, setTab] = useState(0);
  const [data, setData] = useState<{ users: any[]; records: any[]; apps: any[]; reports: any[]; logs: any[] }>({ users: [], records: [], apps: [], reports: [], logs: [] });

  const refresh = useCallback(async () => {
    try {
      const [users, records, apps, reports, logs] = await Promise.all([client.adminUsers(), client.adminRecords(), client.adminApplications(), client.adminAbuseReports(), client.adminAuditLogs()]);
      setData({ users, records, apps, reports, logs });
    } catch (error) {
      toast(error instanceof Error ? error.message : "加载管理员数据失败。", "error");
    }
  }, [toast]);

  useEffect(() => void refresh(), [refresh]);

  return (
    <Stack spacing={3}>
      <Header title="管理员" action={<Button startIcon={<Refresh />} onClick={refresh}>刷新</Button>} />
      <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable">
        <Tab label="申请" />
        <Tab label="用户" />
        <Tab label="DNS" />
        <Tab label="举报" />
        <Tab label="审计" />
      </Tabs>
      {tab === 0 && <AdminApplications rows={data.apps} refresh={refresh} toast={toast} />}
      {tab === 1 && <UsersTable rows={data.users} refresh={refresh} toast={toast} />}
      {tab === 2 && <RecordsTable rows={data.records} />}
      {tab === 3 && <AdminReports rows={data.reports} refresh={refresh} toast={toast} />}
      {tab === 4 && <AuditTable rows={data.logs} />}
    </Stack>
  );
}

function AdminApplications({ rows, refresh, toast }: { rows: any[]; refresh: () => void; toast: (text: string, severity?: "success" | "error") => void }) {
  const action = async (id: string, vote: "approve" | "deny") => {
    try {
      await client.vote(id, vote);
      toast("投票已记录。");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "投票失败。", "error");
    }
  };
  return (
    <DataTable
      columns={["用户", "类型", "域名", "值", "状态", "截止", "操作"]}
      rows={rows}
      render={(app) => (
        <>
          <TableCell>{app.username}</TableCell>
          <TableCell>{app.request_type}</TableCell>
          <TableCell>{app.subdomain}</TableCell>
          <TableCell sx={{ maxWidth: 360, wordBreak: "break-all" }}>{app.record_value}</TableCell>
          <TableCell>
            <StatusChip value={app.status} />
          </TableCell>
          <TableCell>{formatDate(app.voting_deadline_at)}</TableCell>
          <TableCell>
            {app.status === "pending" && (
              <Stack direction="row" spacing={1}>
                <Button size="small" startIcon={<HowToVote />} onClick={() => action(app.id, "approve")}>
                  批准
                </Button>
                <Button size="small" color="error" variant="outlined" onClick={() => action(app.id, "deny")}>
                  拒绝
                </Button>
              </Stack>
            )}
          </TableCell>
        </>
      )}
    />
  );
}

function UsersTable({ rows, refresh, toast }: { rows: any[]; refresh: () => void; toast: (text: string, severity?: "success" | "error") => void }) {
  return (
    <DataTable
      columns={["用户", "邮箱", "角色", "Telegram", "创建时间", "操作"]}
      rows={rows}
      render={(user) => (
        <>
          <TableCell>{user.username}</TableCell>
          <TableCell>{user.email}</TableCell>
          <TableCell>
            <StatusChip value={user.role} />
          </TableCell>
          <TableCell>{user.telegram_user_id || "未绑定"}</TableCell>
          <TableCell>{formatDate(user.created_at)}</TableCell>
          <TableCell>
            <Button
              size="small"
              variant="outlined"
              onClick={async () => {
                const role = user.role === "admin" ? "user" : "admin";
                await client.setRole(user.id, role);
                toast("角色已更新。");
                refresh();
              }}
            >
              {user.role === "admin" ? "降级" : "提升"}
            </Button>
          </TableCell>
        </>
      )}
    />
  );
}

function AdminReports({ rows, refresh, toast }: { rows: any[]; refresh: () => void; toast: (text: string, severity?: "success" | "error") => void }) {
  const action = async (id: string, name: string) => {
    try {
      await client.abuseAction(id, name);
      toast("举报状态已更新。");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败。", "error");
    }
  };
  return (
    <DataTable
      columns={["域名", "原因", "状态", "提交时间", "操作"]}
      rows={rows}
      render={(report) => (
        <>
          <TableCell>{report.subdomain}</TableCell>
          <TableCell>{report.reason}</TableCell>
          <TableCell>
            <StatusChip value={report.status} />
          </TableCell>
          <TableCell>{formatDate(report.created_at)}</TableCell>
          <TableCell>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={() => action(report.id, "acknowledge")}>
                受理
              </Button>
              <Button size="small" color="error" variant="outlined" onClick={() => action(report.id, "suspend")}>
                暂停
              </Button>
              <Button size="small" variant="text" onClick={() => action(report.id, "ignore")}>
                忽略
              </Button>
            </Stack>
          </TableCell>
        </>
      )}
    />
  );
}

function ApplicationTable({ rows }: { rows: any[] }) {
  return (
    <DataTable
      columns={["类型", "域名", "记录值", "用途", "状态", "创建时间"]}
      rows={rows}
      render={(app) => (
        <>
          <TableCell>{app.request_type}</TableCell>
          <TableCell>{app.subdomain}</TableCell>
          <TableCell sx={{ maxWidth: 360, wordBreak: "break-all" }}>{app.record_value}</TableCell>
          <TableCell>{app.purpose || "无"}</TableCell>
          <TableCell>
            <StatusChip value={app.status} />
          </TableCell>
          <TableCell>{formatDate(app.created_at)}</TableCell>
        </>
      )}
    />
  );
}

function RecordsTable({ rows }: { rows: any[] }) {
  return (
    <DataTable
      columns={["用户", "类型", "域名", "记录值", "状态", "创建时间"]}
      rows={rows}
      render={(record) => (
        <>
          <TableCell>{record.username}</TableCell>
          <TableCell>{record.type}</TableCell>
          <TableCell>{record.name}</TableCell>
          <TableCell sx={{ maxWidth: 360, wordBreak: "break-all" }}>{record.content}</TableCell>
          <TableCell>
            <StatusChip value={record.status} />
          </TableCell>
          <TableCell>{formatDate(record.created_at)}</TableCell>
        </>
      )}
    />
  );
}

function AuditTable({ rows }: { rows: any[] }) {
  return (
    <DataTable
      columns={["时间", "用户", "动作", "目标", "IP"]}
      rows={rows}
      render={(log) => (
        <>
          <TableCell>{formatDate(log.created_at)}</TableCell>
          <TableCell>{log.username || "系统"}</TableCell>
          <TableCell>{log.action}</TableCell>
          <TableCell>{[log.target_type, log.target_id].filter(Boolean).join(":")}</TableCell>
          <TableCell>{log.ip}</TableCell>
        </>
      )}
    />
  );
}

function Header({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
      <Typography variant="h4">{title}</Typography>
      {action}
    </Stack>
  );
}

function DataTable({ columns, rows, render }: { columns: string[]; rows: any[]; render: (row: any) => ReactNode }) {
  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column}>{column}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length ? (
            rows.map((row) => <TableRow key={row.id}>{render(row)}</TableRow>)
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} align="center" sx={{ py: 6, color: "text.secondary" }}>
                暂无数据
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function StatusChip({ value }: { value: string }) {
  const color = useMemo(() => {
    if (["active", "approved", "applied", "admin", "resolved"].includes(value)) return "success";
    if (["pending", "applying", "acknowledged"].includes(value)) return "warning";
    if (["rejected", "error", "deleted"].includes(value)) return "error";
    return "default";
  }, [value]);
  return <Chip size="small" color={color as any} label={value} icon={value === "applied" ? <CheckCircle /> : undefined} />;
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function stripParent(name: string, parent?: string) {
  if (!parent) return name;
  const suffix = `.${parent}`;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}
