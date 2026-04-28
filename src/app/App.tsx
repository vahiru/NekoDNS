import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PublicUser } from "../shared/types";
import { ApiError, client, type ApiConfig } from "./api";
import { Shell, type ViewKey } from "./components/Shell";
import { TurnstileBox } from "./components/TurnstileBox";

export default function App() {
  const isVerifyEmailRoute = location.pathname.includes("verify-email");
  const isResetPasswordRoute = location.pathname.includes("reset-password");
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
    if (isVerifyEmailRoute || isResetPasswordRoute) {
      setLoading(false);
      return;
    }
    refreshUser();
  }, [isResetPasswordRoute, isVerifyEmailRoute, refreshUser]);

  const logout = async () => {
    await client.logout().catch(() => undefined);
    setUser(null);
  };

  if (loading) return <Centered title="NekoDNS" subtitle="正在准备您的工作空间" />;
  if (isVerifyEmailRoute) return <VerifyEmailScreen />;
  if (isResetPasswordRoute) return <ResetPasswordScreen config={config} toast={toast} />;

  return (
    <>
      {user ? (
        <Shell user={user} view={view} onView={setView} onLogout={logout}>
          {view === "dashboard" && <Dashboard config={config} toast={toast} />}
          {view === "applications" && <Applications toast={toast} />}
          {view === "account" && <AccountSecurity user={user} toast={toast} />}
          {view === "abuse" && <AbusePage config={config} toast={toast} />}
          {view === "admin" && <AdminPanel toast={toast} />}
        </Shell>
      ) : (
        <AuthScreen config={config} onAuthed={refreshUser} toast={toast} />
      )}
      <Snackbar open={Boolean(notice)} autoHideDuration={4200} onClose={() => setNotice(undefined)}>
        <Alert severity={notice?.severity ?? "success"} variant="filled" sx={{ width: "100%", borderRadius: 2 }}>
          {notice?.text}
        </Alert>
      </Snackbar>
    </>
  );
}

function VerifyEmailScreen() {
  const startedRef = useRef(false);
  const search = new URLSearchParams(location.search);
  const isMigrationFlow = search.get("flow") === "migration";
  const nextToken = search.get("nextToken")?.trim() || "";
  const [state, setState] = useState<{ status: "loading" | "success" | "error"; message: string; redirectTo?: string }>({
    status: "loading",
    message: isMigrationFlow ? "正在为您重新验证邮箱，请稍候..." : "正在验证您的邮箱地址，请稍候...",
  });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const token = search.get("token")?.trim();
    if (!token) {
      setState({ status: "error", message: "验证链接无效或已过期（缺少令牌）。" });
      return;
    }

    client
      .verifyEmail(token, { flow: isMigrationFlow ? "migration" : undefined, nextToken: nextToken || undefined })
      .then((result) =>
        setState({
          status: "success",
          message: isMigrationFlow ? "邮箱重新验证成功！现在您可以直接设置新的登录密码。" : result.message,
          redirectTo: result.redirectTo,
        }),
      )
      .catch((error) => setState({ status: "error", message: error instanceof Error ? error.message : "邮箱验证过程中出现错误。" }));
  }, [isMigrationFlow, nextToken, search]);

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 2 }}>
      <Paper sx={{ width: "min(100%, 520px)", p: { xs: 3, sm: 6 } }}>
        <Stack spacing={4}>
          <Box>
            <Typography variant="h4" gutterBottom>邮箱验证</Typography>
            <Typography color="text.secondary">{isMigrationFlow ? "账户迁移确认" : "激活您的 NekoDNS 账户"}</Typography>
          </Box>
          <Alert severity={state.status === "success" ? "success" : state.status === "error" ? "error" : "info"} sx={{ borderRadius: 3 }}>
            {state.message}
          </Alert>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            {isMigrationFlow ? (
              <>
                <Button variant="contained" href={state.redirectTo || "/reset-password?migration=1"}>
                  设置新密码
                </Button>
                <Button variant="outlined" href="/">
                  返回登录
                </Button>
              </>
            ) : (
              <>
                <Button variant="contained" href={state.status === "success" ? "/?verified=1" : "/"}>
                  {state.status === "success" ? "立即登录" : "返回首页"}
                </Button>
                <Button variant="outlined" href="/reset-password">
                  找回密码
                </Button>
              </>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}

function Centered({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default" }}>
      <Stack spacing={2} alignItems="center">
        <Typography variant="h4" color="primary" sx={{ fontWeight: 800 }}>{title}</Typography>
        <Typography color="text.secondary">{subtitle}</Typography>
      </Stack>
    </Box>
  );
}

function AuthScreen({ config, onAuthed, toast }: { config?: ApiConfig; onAuthed: () => void; toast: (text: string, severity?: "success" | "error") => void }) {
  const searchParams = new URLSearchParams(location.search);
  const verified = searchParams.get("verified") === "1";
  const migrationFlow = searchParams.get("migration") === "1";
  const resetDone = searchParams.get("reset") === "1";
  const [tab, setTab] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [legacyDialog, setLegacyDialog] = useState<{ open: boolean; email: string; sending: boolean; sent: boolean }>({
    open: false,
    email: "",
    sending: false,
    sent: false,
  });

  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const requireTurnstileToken = () => {
    const turnstileResponse = turnstileToken.trim();
    if (!turnstileResponse) {
      toast("请先完成人机验证以继续。", "error");
      return null;
    }
    return turnstileResponse;
  };

  const submit = async () => {
    const turnstileResponse = requireTurnstileToken();
    if (!turnstileResponse) return;
    let sentAuthRequest = false;
    try {
      if (tab === 0) {
        sentAuthRequest = true;
        await client.login({ login: form.login, password: form.password, turnstileToken: turnstileResponse });
        await onAuthed();
      }
      if (tab === 1) {
        if ((form.password || "") !== (form.confirmPassword || "")) {
          toast("两次输入的密码不一致，请重新检查。", "error");
          return;
        }
        sentAuthRequest = true;
        await client.register({
          username: form.username,
          email: form.email,
          password: form.password,
          confirmPassword: form.confirmPassword,
          turnstileToken: turnstileResponse,
        });
        toast("注册成功！我们已向您的邮箱发送了验证邮件，请查收。");
        setTab(0);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "legacy_migration_required") {
        setLegacyDialog({
          open: true,
          email: String(error.details?.email || form.login || ""),
          sending: false,
          sent: false,
        });
        return;
      }
      toast(error instanceof Error ? error.message : "登录请求失败，请稍后重试。", "error");
    } finally {
      if (sentAuthRequest) {
        setTurnstileToken("");
        setTurnstileWidgetKey((current) => current + 1);
      }
    }
  };

  const requestPasswordReset = async () => {
    const turnstileResponse = requireTurnstileToken();
    if (!turnstileResponse) return;

    try {
      await client.forgotPassword({ email: form.email, turnstileToken: turnstileResponse });
      toast("如果该邮箱已注册，重置指令已发送至您的收件箱。");
      setTurnstileToken("");
      setTurnstileWidgetKey((current) => current + 1);
    } catch (error) {
      toast(error instanceof Error ? error.message : "请求重置邮件失败。", "error");
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 2 }}>
      <Paper sx={{ width: "min(100%, 520px)", p: { xs: 3, sm: 6 } }}>
        <Stack spacing={4}>
          <Box>
            <Typography variant="h4" color="primary" sx={{ fontWeight: 800 }}>NekoDNS</Typography>
            <Typography color="text.secondary">更纯粹的 Serverless 动态域名托管服务</Typography>
          </Box>
          {verified && <Alert severity="success" sx={{ borderRadius: 3 }}>邮箱验证成功。现在您可以登录账户；如需找回密码，请使用下方的入口。</Alert>}
          {resetDone && <Alert severity="success" sx={{ borderRadius: 3 }}>密码已成功更新。请使用新密码登录。</Alert>}
          {migrationFlow && <Alert severity="info" sx={{ borderRadius: 3 }}>为保障系统安全，升级后的旧账户需重新验证邮箱并重置密码。</Alert>}
          
          <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: "divider" }}>
            <Tab label="登录" />
            <Tab label="注册" />
          </Tabs>

          {tab === 0 && (
            <Stack spacing={2.5}>
              <TextField label="用户名或邮箱地址" value={form.login || ""} onChange={(event) => update("login", event.target.value)} />
              <TextField label="登录密码" type="password" value={form.password || ""} onChange={(event) => update("password", event.target.value)} />
            </Stack>
          )}
          {tab === 1 && (
            <Stack spacing={2.5}>
              <TextField label="首选用户名" value={form.username || ""} onChange={(event) => update("username", event.target.value)} />
              <TextField label="邮箱地址" value={form.email || ""} onChange={(event) => update("email", event.target.value)} />
              <TextField label="设置密码" type="password" value={form.password || ""} onChange={(event) => update("password", event.target.value)} />
              <TextField label="确认密码" type="password" value={form.confirmPassword || ""} onChange={(event) => update("confirmPassword", event.target.value)} />
            </Stack>
          )}

          <Box sx={{ bgcolor: "background.default", borderRadius: 4, p: 1, display: "flex", justifyContent: "center" }}>
            <TurnstileBox siteKey={config?.turnstileSiteKey} onToken={setTurnstileToken} resetKey={turnstileWidgetKey} />
          </Box>

          <Button startIcon={<Send />} size="large" onClick={submit}>
            {tab === 0 ? "立即登录" : "创建账户"}
          </Button>

          <Divider sx={{ my: 1 }}>或者</Divider>

          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{migrationFlow ? "重新设置登录密码" : "找回账户密码"}</Typography>
              <Typography variant="body2" color="text.secondary">
                请输入您的注册邮箱，我们将向您发送重置指令。
              </Typography>
            </Box>
            <TextField label="注册邮箱" value={form.email || ""} onChange={(event) => update("email", event.target.value)} />
            <Button variant="outlined" onClick={requestPasswordReset}>
              发送重置指令
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Dialog open={legacyDialog.open} onClose={() => setLegacyDialog((current) => ({ ...current, open: false }))} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>迁移账户确认</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Alert severity="warning" sx={{ borderRadius: 3 }}>检测到您的账户需要进行安全性迁移，请先重新验证您的注册邮箱。</Alert>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>验证邮件将发送至：</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{legacyDialog.email}</Typography>
            </Box>
            {legacyDialog.sent && <Alert severity="success" sx={{ borderRadius: 3 }}>验证指令已发出，请检查您的收件箱（及垃圾邮件箱）。</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 4 }}>
          <Button variant="text" color="inherit" onClick={() => setLegacyDialog((current) => ({ ...current, open: false }))}>取消</Button>
          <Button
            variant="contained"
            disabled={legacyDialog.sending || !legacyDialog.email.trim()}
            onClick={async () => {
              try {
                setLegacyDialog((current) => ({ ...current, sending: true }));
                const result = await client.legacyReverify({ login: legacyDialog.email.trim() });
                toast(result.message);
                setLegacyDialog((current) => ({ ...current, sending: false, sent: true }));
              } catch (error) {
                setLegacyDialog((current) => ({ ...current, sending: false }));
                toast(error instanceof Error ? error.message : "指令发送失败，请重试。", "error");
              }
            }}
          >
            {legacyDialog.sending ? "发送中..." : "发送验证邮件"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function ResetPasswordScreen({ config, toast }: { config?: ApiConfig; toast: (text: string, severity?: "success" | "error") => void }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0);

  const submit = async () => {
    const token = new URLSearchParams(location.search).get("token") || form.token || "";
    if (!token.trim()) {
      toast("重置令牌缺失或无效。", "error");
      return;
    }
    if ((form.password || "") !== (form.confirmPassword || "")) {
      toast("两次输入的新密码不一致。", "error");
      return;
    }
    if (!turnstileToken.trim()) {
      toast("请完成人机验证以确保账户安全。", "error");
      return;
    }

    try {
      await client.resetPassword({
        token,
        password: form.password,
        confirmPassword: form.confirmPassword,
        turnstileToken,
      });
      toast("您的新密码已生效。");
      location.replace("/?reset=1");
    } catch (error) {
      toast(error instanceof Error ? error.message : "重置密码失败，请检查令牌是否过期。", "error");
    } finally {
      setTurnstileToken("");
      setTurnstileWidgetKey((current) => current + 1);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 2 }}>
      <Paper sx={{ width: "min(100%, 520px)", p: { xs: 3, sm: 6 } }}>
        <Stack spacing={4}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>设置新密码</Typography>
            <Typography color="text.secondary">请为您的账户设置一个强密码</Typography>
          </Box>
          <TextField
            label="验证令牌"
            value={form.token || new URLSearchParams(location.search).get("token") || ""}
            onChange={(event) => setForm((current) => ({ ...current, token: event.target.value }))}
          />
          <TextField
            label="新密码"
            type="password"
            value={form.password || ""}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
          <TextField
            label="确认新密码"
            type="password"
            value={form.confirmPassword || ""}
            onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
          />
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <TurnstileBox siteKey={config?.turnstileSiteKey} onToken={setTurnstileToken} resetKey={turnstileWidgetKey} />
          </Box>
          <Button startIcon={<Send />} size="large" onClick={submit}>
            更新密码
          </Button>
          <Button variant="text" color="inherit" href="/">
            返回登录
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

function AccountSecurity({ user, toast }: { user: PublicUser; toast: (text: string, severity?: "success" | "error") => void }) {
  const [form, setForm] = useState<Record<string, string>>({});

  const submit = async () => {
    if ((form.password || "") !== (form.confirmPassword || "")) {
      toast("确认密码与新密码不匹配。", "error");
      return;
    }

    try {
      const result = await client.changePassword({
        currentPassword: form.currentPassword,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });
      toast(result.message);
      setForm({});
    } catch (error) {
      toast(error instanceof Error ? error.message : "密码修改失败。", "error");
    }
  };

  return (
    <Stack spacing={4}>
      <Header title="账户安全" subtitle="管理您的登录凭据和安全偏好" />
      <Paper sx={{ p: { xs: 3, md: 5 }, maxWidth: 720 }}>
        <Stack spacing={3}>
          <Alert severity="info" sx={{ borderRadius: 3 }}>当前登录身份：{user.email}</Alert>
          <TextField
            label="旧密码"
            type="password"
            value={form.currentPassword || ""}
            onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))}
          />
          <Divider />
          <TextField
            label="新密码"
            type="password"
            value={form.password || ""}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
          <TextField
            label="确认新密码"
            type="password"
            value={form.confirmPassword || ""}
            onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
          />
          <Button startIcon={<Send />} size="large" onClick={submit} sx={{ mt: 2 }}>
            确认修改
          </Button>
        </Stack>
      </Paper>
    </Stack>
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
      toast(error instanceof Error ? error.message : "操作未成功，请检查输入格式。", "error");
    }
  };

  return (
    <Stack spacing={4}>
      <Header title="我的 DNS 记录" subtitle="管理您已审核通过并生效的解析记录" action={<Button variant="outlined" startIcon={<Refresh />} onClick={refresh}>刷新列表</Button>} />
      
      <Paper sx={{ p: 4 }}>
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>{editingId ? "修改现有记录" : "新增解析申请"}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "120px 1fr 1fr 120px 160px" }, gap: 3, alignItems: "start" }}>
          <TextField select label="记录类型" value={form.type || "A"} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            {["A", "AAAA", "CNAME", "TXT"].map((type) => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </TextField>
          <TextField label={`主机记录 (.${config?.parentDomain ?? ""})`} placeholder="www" value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <TextField label="记录内容" placeholder="IP 地址或域名目标" value={form.content || ""} onChange={(event) => setForm({ ...form, content: event.target.value })} />
          <TextField label="TTL" type="number" value={form.ttl || 3600} onChange={(event) => setForm({ ...form, ttl: event.target.value })} />
          <Button fullWidth startIcon={<Add />} size="large" onClick={submit} sx={{ height: 56 }}>
            {editingId ? "保存修改" : "提交申请"}
          </Button>
          <Box sx={{ gridColumn: "1 / -1" }}>
            <TextField fullWidth label="申请用途说明" placeholder="请简述该域名的使用场景，有助于加速审核过程" value={form.purpose || ""} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
          </Box>
        </Box>
      </Paper>

      <DataTable
        columns={["类型", "完整域名", "解析内容", "TTL", "代理", "状态", "操作"]}
        rows={records}
        render={(record) => (
          <>
            <TableCell sx={{ fontWeight: 700 }}>{record.type}</TableCell>
            <TableCell>{record.name}</TableCell>
            <TableCell sx={{ maxWidth: 300, wordBreak: "break-all", fontFamily: "monospace", fontSize: "0.875rem" }}>{record.content}</TableCell>
            <TableCell>{record.ttl}</TableCell>
            <TableCell>{record.proxied ? <Chip size="small" label="已开启" color="primary" variant="outlined" /> : "直连"}</TableCell>
            <TableCell>
              <StatusChip value={record.status} />
            </TableCell>
            <TableCell>
              <Stack direction="row" spacing={1}>
                <IconButton color="primary" size="small" onClick={() => {
                  setEditingId(record.id);
                  setForm({ type: record.type, name: stripParent(record.name, config?.parentDomain), content: record.content, ttl: record.ttl, proxied: Boolean(record.proxied) });
                }}>
                  <Edit />
                </IconButton>
                <IconButton color="error" size="small" onClick={() => client.deleteRecord(record.id).then((result) => toast(result.message)).then(refresh)}>
                  <Delete />
                </IconButton>
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
    <Stack spacing={4}>
      <Header title="申请历史" subtitle="查看您提交的所有解析申请及其审核进度" action={<Button variant="outlined" startIcon={<Refresh />} onClick={refresh}>刷新状态</Button>} />
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
      toast(error instanceof Error ? error.message : "举报提交失败，请重试。", "error");
    }
  };
  return (
    <Stack spacing={4}>
      <Header title="滥用举报" subtitle="如果您发现 NekoDNS 托管的域名违反了服务协议，请告知我们" />
      <Paper sx={{ p: { xs: 3, md: 5 }, maxWidth: 800 }}>
        <Stack spacing={3}>
          <TextField label="被举报的二级域名" placeholder="example.nekodns.com" value={form.subdomain || ""} onChange={(event) => setForm({ ...form, subdomain: event.target.value })} />
          <TextField label="举报原因分类" placeholder="如：网络钓鱼、恶意软件、侵权等" value={form.reason || ""} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          <TextField label="详细证据与说明" multiline minRows={5} placeholder="请提供具体的 URL 或详细描述，以便我们进行核实" value={form.details || ""} onChange={(event) => setForm({ ...form, details: event.target.value })} />
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <TurnstileBox siteKey={config?.turnstileSiteKey} onToken={setToken} />
          </Box>
          <Button startIcon={<Send />} size="large" onClick={submit}>
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
      toast(error instanceof Error ? error.message : "权限验证失败或数据加载异常。", "error");
    }
  }, [toast]);

  useEffect(() => void refresh(), [refresh]);

  return (
    <Stack spacing={4}>
      <Header title="系统管理" subtitle="全局监控与资源调度中心" action={<Button variant="contained" startIcon={<Refresh />} onClick={refresh}>全量刷新</Button>} />
      <Paper sx={{ borderRadius: "16px", overflow: "hidden", border: "1px solid", borderColor: "divider" }}>
        <Tabs 
          value={tab} 
          onChange={(_, value) => setTab(value)} 
          variant="scrollable" 
          scrollButtons="auto" 
          allowScrollButtonsMobile
          sx={{ bgcolor: "background.paper" }}
        >
          <Tab label="待办申请" />
          <Tab label="用户管理" />
          <Tab label="DNS 概览" />
          <Tab label="投诉受理" />
          <Tab label="系统审计" />
        </Tabs>
      </Paper>
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
      toast("处理结果已记录并应用。");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "决策执行失败。", "error");
    }
  };
  return (
    <DataTable
      columns={["申请人", "类型", "域名目标", "解析值", "当前状态", "投票截止", "操作决策"]}
      rows={rows}
      render={(app) => (
        <>
          <TableCell sx={{ fontWeight: 600 }}>{app.username}</TableCell>
          <TableCell>{app.request_type}</TableCell>
          <TableCell>{app.subdomain}</TableCell>
          <TableCell sx={{ maxWidth: 300, wordBreak: "break-all", fontFamily: "monospace" }}>{app.record_value}</TableCell>
          <TableCell>
            <StatusChip value={app.status} />
          </TableCell>
          <TableCell sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{formatDate(app.voting_deadline_at)}</TableCell>
          <TableCell>
            {app.status === "pending" && (
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" color="success" startIcon={<HowToVote />} onClick={() => action(app.id, "approve")}>
                  通过
                </Button>
                <Button size="small" variant="outlined" color="error" onClick={() => action(app.id, "deny")}>
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
      columns={["用户名", "电子邮箱", "系统角色", "Telegram", "注册时间", "管理动作"]}
      rows={rows}
      render={(user) => (
        <>
          <TableCell sx={{ fontWeight: 600 }}>{user.username}</TableCell>
          <TableCell>{user.email}</TableCell>
          <TableCell>
            <StatusChip value={user.role} />
          </TableCell>
          <TableCell>{user.telegram_user_id ? <Chip label={user.telegram_user_id} size="small" variant="outlined" /> : "未关联"}</TableCell>
          <TableCell sx={{ fontSize: "0.75rem" }}>{formatDate(user.created_at)}</TableCell>
          <TableCell>
            <Button
              size="small"
              variant="outlined"
              onClick={async () => {
                const role = user.role === "admin" ? "user" : "admin";
                await client.setRole(user.id, role);
                toast(`用户 ${user.username} 的权限已更新。`);
                refresh();
              }}
            >
              {user.role === "admin" ? "取消管理" : "设为管理"}
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
      toast("投诉工单状态已更新。");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败。", "error");
    }
  };
  return (
    <DataTable
      columns={["域名", "投诉原因", "处理状态", "提交时间", "决策动作"]}
      rows={rows}
      render={(report) => (
        <>
          <TableCell sx={{ fontWeight: 600 }}>{report.subdomain}</TableCell>
          <TableCell>{report.reason}</TableCell>
          <TableCell>
            <StatusChip value={report.status} />
          </TableCell>
          <TableCell sx={{ fontSize: "0.75rem" }}>{formatDate(report.created_at)}</TableCell>
          <TableCell>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={() => action(report.id, "acknowledge")}>受理</Button>
              <Button size="small" color="error" variant="contained" onClick={() => action(report.id, "suspend")}>封禁</Button>
              <Button size="small" variant="text" color="inherit" onClick={() => action(report.id, "ignore")}>忽略</Button>
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
      columns={["请求类型", "目标域名", "解析记录值", "申请用途", "当前状态", "提交日期"]}
      rows={rows}
      render={(app) => (
        <>
          <TableCell sx={{ fontWeight: 700 }}>{app.request_type}</TableCell>
          <TableCell>{app.subdomain}</TableCell>
          <TableCell sx={{ maxWidth: 300, wordBreak: "break-all", fontFamily: "monospace" }}>{app.record_value}</TableCell>
          <TableCell sx={{ color: "text.secondary", fontSize: "0.875rem" }}>{app.purpose || "未注明"}</TableCell>
          <TableCell>
            <StatusChip value={app.status} />
          </TableCell>
          <TableCell sx={{ fontSize: "0.75rem" }}>{formatDate(app.created_at)}</TableCell>
        </>
      )}
    />
  );
}

function RecordsTable({ rows }: { rows: any[] }) {
  return (
    <DataTable
      columns={["所有者", "类型", "域名", "解析值", "解析状态", "创建于"]}
      rows={rows}
      render={(record) => (
        <>
          <TableCell sx={{ fontWeight: 600 }}>{record.username}</TableCell>
          <TableCell sx={{ fontWeight: 700 }}>{record.type}</TableCell>
          <TableCell>{record.name}</TableCell>
          <TableCell sx={{ maxWidth: 300, wordBreak: "break-all", fontFamily: "monospace" }}>{record.content}</TableCell>
          <TableCell>
            <StatusChip value={record.status} />
          </TableCell>
          <TableCell sx={{ fontSize: "0.75rem" }}>{formatDate(record.created_at)}</TableCell>
        </>
      )}
    />
  );
}

function AuditTable({ rows }: { rows: any[] }) {
  return (
    <DataTable
      columns={["发生时间", "执行用户", "操作类型", "操作对象", "源 IP 地址"]}
      rows={rows}
      render={(log) => (
        <>
          <TableCell sx={{ fontSize: "0.75rem" }}>{formatDate(log.created_at)}</TableCell>
          <TableCell sx={{ fontWeight: 600 }}>{log.username || "System"}</TableCell>
          <TableCell>
            <Chip label={log.action} size="small" variant="outlined" />
          </TableCell>
          <TableCell sx={{ fontSize: "0.875rem", fontFamily: "monospace" }}>{[log.target_type, log.target_id].filter(Boolean).join(":")}</TableCell>
          <TableCell sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{log.ip}</TableCell>
        </>
      )}
    />
  );
}

function Header({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "start", sm: "center" }} justifyContent="space-between" spacing={2} sx={{ mb: 1 }}>
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>{title}</Typography>
        {subtitle && <Typography variant="body1" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

function DataTable({ columns, rows, render }: { columns: string[]; rows: any[]; render: (row: any) => ReactNode }) {
  return (
    <TableContainer 
      component={Paper} 
      sx={{ 
        borderRadius: "16px", 
        border: "1px solid", 
        borderColor: "divider", 
        overflow: "hidden",
        width: "100%"
      }}
    >
      <Box sx={{ overflowX: "auto" }}>
        <Table>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column} sx={{ whiteSpace: "nowrap" }}>{column}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length ? (
              rows.map((row) => <TableRow key={row.id} hover>{render(row)}</TableRow>)
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 10 }}>
                  <Typography color="text.secondary">暂无数据记录</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
    </TableContainer>
  );
}

function StatusChip({ value }: { value: string }) {
  const config = useMemo(() => {
    if (["active", "approved", "applied", "admin", "resolved"].includes(value)) return { color: "success", label: "正常/已通过" };
    if (["pending", "applying", "acknowledged"].includes(value)) return { color: "warning", label: "处理中/待定" };
    if (["rejected", "error", "deleted", "suspended"].includes(value)) return { color: "error", label: "已拒绝/异常" };
    return { color: "default", label: value };
  }, [value]);
  
  return (
    <Chip 
      size="small" 
      color={config.color as any} 
      label={config.label} 
      variant={config.color === "default" ? "outlined" : "filled"}
      icon={value === "applied" ? <CheckCircle /> : undefined} 
      sx={{ fontWeight: 700 }}
    />
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { 
    year: "numeric", 
    month: "2-digit", 
    day: "2-digit", 
    hour: "2-digit", 
    minute: "2-digit", 
    second: "2-digit", 
    hour12: false 
  });
}

function stripParent(name: string, parent?: string) {
  if (!parent) return name;
  const suffix = `.${parent}`;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}
