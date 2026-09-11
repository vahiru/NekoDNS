import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  Link,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, CheckCircle, ContentCopy, Delete, Edit, Email, Refresh, Send } from "@mui/icons-material";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { dnsRecordTypes, normalizeRecordName, validateRecordContent } from "../shared/dns-content";
import type {
  AdminApplicationRow,
  AdminDnsRecordRow,
  AdminUserRow,
  ApplicationRow,
  DnsRecordRow,
  DnsRecordType,
  PublicUser,
} from "../shared/types";
import { ApiError, client, type ApiConfig, type Page } from "./api";
import { DataTable } from "./components/DataTable";
import { Shell, type ViewKey } from "./components/Shell";
import { TurnstileBox } from "./components/TurnstileBox";

type Toast = (text: string, severity?: "success" | "error") => void;

const proxyableRecordTypes = new Set(["A", "AAAA", "CNAME"]);
const recordContentHints: Record<DnsRecordType, { placeholder: string; helper: string }> = {
  A: { placeholder: "192.0.2.10", helper: "仅限 IPv4 地址" },
  AAAA: { placeholder: "2001:db8::10", helper: "仅限 IPv6 地址" },
  CNAME: { placeholder: "target.example.com", helper: "目标域名，不能填 IP" },
  TXT: { placeholder: "v=spf1 include:example.com ~all", helper: "验证字符串或文本内容" },
};

function canProxyRecord(type?: string) {
  return proxyableRecordTypes.has(type || "A");
}

function asDnsRecordType(type?: string): DnsRecordType {
  return dnsRecordTypes.includes(type as DnsRecordType) ? (type as DnsRecordType) : "A";
}

function recordNameError(name: string, parentDomain?: string) {
  const value = name.trim();
  if (!value) return undefined;
  if (!parentDomain) return undefined;

  try {
    normalizeRecordName(value, parentDomain);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "主机记录格式无效。";
  }
}

function ttlError(ttl: string) {
  const value = Number(ttl);
  if (!ttl.trim()) return "请填写 TTL。";
  if (!Number.isInteger(value)) return "TTL 必须是整数。";
  if (value < 60 || value > 86400) return "TTL 需要在 60 到 86400 秒之间。";
  return undefined;
}

function recordContentError(type: DnsRecordType, content: unknown) {
  const value = String(content ?? "");
  if (!value.trim()) return undefined;

  try {
    validateRecordContent(type, value);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "记录内容格式无效。";
  }
}

function isGithubPagesCname(type: DnsRecordType, content: unknown) {
  const target = String(content ?? "").trim().toLowerCase().replace(/\.$/, "");
  return type === "CNAME" && target.endsWith(".github.io") && target !== "github.io";
}

export default function App() {
  const isVerifyEmailRoute = location.pathname === "/verify-email";
  const isResetPasswordRoute = location.pathname === "/reset-password";
  const [config, setConfig] = useState<ApiConfig>();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [notice, setNotice] = useState<{ text: string; severity: "success" | "error" }>();
  // The token screens do not need a session, so only the app shell starts out loading.
  const [loading, setLoading] = useState(!isVerifyEmailRoute && !isResetPasswordRoute);

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
    let active = true;
    client.config().then((value) => active && setConfig(value)).catch(() => undefined);
    if (isVerifyEmailRoute || isResetPasswordRoute) return;

    client
      .me()
      .then((value) => active && setUser(value))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [isResetPasswordRoute, isVerifyEmailRoute]);

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
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={4200}
        onClose={() => setNotice(undefined)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity={notice?.severity ?? "success"} variant="filled" sx={{ width: "100%", borderRadius: 2 }}>
          {notice?.text}
        </Alert>
      </Snackbar>
    </>
  );
}

function VerifyEmailScreen() {
  const startedRef = useRef(false);
  const [search] = useState(() => new URLSearchParams(location.search));
  const isMigrationFlow = search.get("flow") === "migration";
  const nextToken = search.get("nextToken")?.trim() || "";
  const token = search.get("token")?.trim() || "";
  const [state, setState] = useState<{ status: "loading" | "success" | "error"; message: string; redirectTo?: string }>(() =>
    token
      ? { status: "loading", message: isMigrationFlow ? "正在为您重新验证邮箱，请稍候..." : "正在验证您的邮箱地址，请稍候..." }
      : { status: "error", message: "验证链接无效或已过期（缺少令牌）。" },
  );

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;

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
  }, [isMigrationFlow, nextToken, token]);

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
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 2 }}>
      <Stack spacing={3} alignItems="center">
        <Typography variant="h4" color="primary" sx={{ fontWeight: 800 }}>
          {title}
        </Typography>
        <CircularProgress size={28} />
        <Typography color="text.secondary">{subtitle}</Typography>
      </Stack>
    </Box>
  );
}

function AuthScreen({ config, onAuthed, toast }: { config?: ApiConfig; onAuthed: () => void; toast: Toast }) {
  const searchParams = new URLSearchParams(location.search);
  const verified = searchParams.get("verified") === "1";
  const migrationFlow = searchParams.get("migration") === "1";
  const resetDone = searchParams.get("reset") === "1";
  const [tab, setTab] = useState(0);
  // The reset request used to sit permanently below the tabs, sharing its email field with the
  // register form: typing an address in one silently changed the other.
  const [forgotMode, setForgotMode] = useState(false);
  const [pending, setPending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [legacyDialog, setLegacyDialog] = useState<{ open: boolean; login: string; sending: boolean; sent: boolean }>({
    open: false,
    login: "",
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
    setPending(true);
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
        setLegacyDialog({ open: true, login: form.login || "", sending: false, sent: false });
        return;
      }
      toast(error instanceof Error ? error.message : "登录请求失败，请稍后重试。", "error");
    } finally {
      setPending(false);
      if (sentAuthRequest) {
        setTurnstileToken("");
        setTurnstileWidgetKey((current) => current + 1);
      }
    }
  };

  const requestPasswordReset = async () => {
    const turnstileResponse = requireTurnstileToken();
    if (!turnstileResponse) return;

    setPending(true);
    try {
      await client.forgotPassword({ email: form.resetEmail, turnstileToken: turnstileResponse });
      toast("如果该邮箱已注册，重置指令已发送至您的收件箱。");
    } catch (error) {
      toast(error instanceof Error ? error.message : "请求重置邮件失败。", "error");
    } finally {
      setPending(false);
      setTurnstileToken("");
      setTurnstileWidgetKey((current) => current + 1);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 2 }}>
      <Paper sx={{ width: "min(100%, 520px)", p: { xs: 2.5, sm: 6 } }}>
        <Stack spacing={4}>
          <Box>
            <Typography variant="h4" color="primary" sx={{ fontWeight: 800 }}>NekoDNS</Typography>
            <Typography color="text.secondary">更纯粹的 Serverless 动态域名托管服务</Typography>
          </Box>
          {verified && <Alert severity="success" sx={{ borderRadius: 3 }}>邮箱验证成功。现在您可以登录账户；如需找回密码，请使用下方的入口。</Alert>}
          {resetDone && <Alert severity="success" sx={{ borderRadius: 3 }}>密码已成功更新。请使用新密码登录。</Alert>}
          {migrationFlow && <Alert severity="info" sx={{ borderRadius: 3 }}>为保障系统安全，升级后的旧账户需重新验证邮箱并重置密码。</Alert>}
          
          {!forgotMode && (
            <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: "divider" }}>
              <Tab label="登录" />
              <Tab label="注册" />
            </Tabs>
          )}

          {!forgotMode && tab === 0 && (
            <Stack spacing={2.5}>
              <TextField
                label="用户名或邮箱地址"
                autoComplete="username"
                value={form.login || ""}
                onChange={(event) => update("login", event.target.value)}
              />
              <TextField
                label="登录密码"
                type="password"
                autoComplete="current-password"
                value={form.password || ""}
                onChange={(event) => update("password", event.target.value)}
              />
            </Stack>
          )}
          {!forgotMode && tab === 1 && (
            <Stack spacing={2.5}>
              <TextField label="首选用户名" autoComplete="username" value={form.username || ""} onChange={(event) => update("username", event.target.value)} />
              <TextField label="邮箱地址" type="email" autoComplete="email" value={form.email || ""} onChange={(event) => update("email", event.target.value)} />
              <TextField
                label="设置密码"
                type="password"
                autoComplete="new-password"
                value={form.password || ""}
                error={Boolean(form.password) && form.password.length < 10}
                helperText="至少 10 位"
                onChange={(event) => update("password", event.target.value)}
              />
              <TextField
                label="确认密码"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword || ""}
                error={Boolean(form.confirmPassword) && form.confirmPassword !== form.password}
                helperText={form.confirmPassword && form.confirmPassword !== form.password ? "两次输入的密码不一致。" : undefined}
                onChange={(event) => update("confirmPassword", event.target.value)}
              />
            </Stack>
          )}

          {forgotMode && (
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  找回账户密码
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  输入注册邮箱，我们会发送一封重置邮件。
                </Typography>
              </Box>
              <TextField
                label="注册邮箱"
                type="email"
                autoComplete="email"
                value={form.resetEmail || ""}
                onChange={(event) => update("resetEmail", event.target.value)}
              />
            </Stack>
          )}

          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <TurnstileBox siteKey={config?.turnstileSiteKey} onToken={setTurnstileToken} resetKey={turnstileWidgetKey} />
          </Box>

          <Button startIcon={<Send />} size="large" disabled={pending} onClick={forgotMode ? requestPasswordReset : submit}>
            {pending ? "请稍候…" : forgotMode ? "发送重置指令" : tab === 0 ? "立即登录" : "创建账户"}
          </Button>

          <Divider />

          <Button variant="text" color="inherit" onClick={() => setForgotMode((current) => !current)}>
            {forgotMode ? "返回登录" : "忘记密码？"}
          </Button>
        </Stack>
      </Paper>

      <Dialog open={legacyDialog.open} onClose={() => setLegacyDialog((current) => ({ ...current, open: false }))} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>迁移账户确认</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Alert severity="warning" sx={{ borderRadius: 3 }}>检测到您的账户需要进行安全性迁移，请先重新验证您的注册邮箱。</Alert>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>验证邮件将发送至该账号的注册邮箱：</Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>{legacyDialog.login}</Typography>
            </Box>
            {legacyDialog.sent && <Alert severity="success" sx={{ borderRadius: 3 }}>验证指令已发出，请检查您的收件箱（及垃圾邮件箱）。</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 4 }}>
          <Button variant="text" color="inherit" onClick={() => setLegacyDialog((current) => ({ ...current, open: false }))}>取消</Button>
          <Button
            variant="contained"
            disabled={legacyDialog.sending || !legacyDialog.login.trim()}
            onClick={async () => {
              try {
                setLegacyDialog((current) => ({ ...current, sending: true }));
                const result = await client.legacyReverify({ login: legacyDialog.login.trim() });
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

function ResetPasswordScreen({ config, toast }: { config?: ApiConfig; toast: Toast }) {
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

function TelegramBinding({ user, toast }: { user: PublicUser; toast: Toast }) {
  const [bindCommand, setBindCommand] = useState<string>();
  const [pending, setPending] = useState(false);

  const generate = async () => {
    setPending(true);
    try {
      const result = await client.bindToken();
      setBindCommand(result.command);
    } catch (error) {
      toast(error instanceof Error ? error.message : "生成绑定令牌失败。", "error");
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    if (!bindCommand) return;
    try {
      await navigator.clipboard.writeText(bindCommand);
      toast("绑定指令已复制。");
    } catch {
      toast("复制失败，请手动选中复制。", "error");
    }
  };

  return (
    <Paper sx={{ p: { xs: 3, md: 5 }, maxWidth: 720 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Telegram 审批绑定
          </Typography>
          <Typography variant="body2" color="text.secondary">
            绑定后即可直接在 Telegram 群里审批域名申请和处理滥用举报。
          </Typography>
        </Box>

        {user.telegramUserId ? (
          <Alert severity="success">已绑定 Telegram 账号：{user.telegramUserId}</Alert>
        ) : (
          <Alert severity="info">尚未绑定。生成令牌后，在 Telegram 中向机器人发送下方指令即可完成绑定。</Alert>
        )}

        {bindCommand && (
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              发送给机器人（1 小时内有效）：
            </Typography>
            <Paper
              variant="outlined"
              sx={{ p: 2, fontFamily: "monospace", wordBreak: "break-all", bgcolor: "surfaceContainerHigh", border: "1px solid", borderColor: "divider" }}
            >
              {bindCommand}
            </Paper>
          </Box>
        )}

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button onClick={generate} disabled={pending}>
            {pending ? "生成中…" : bindCommand ? "重新生成令牌" : "生成绑定令牌"}
          </Button>
          {bindCommand && (
            <Button variant="outlined" startIcon={<ContentCopy />} onClick={copy}>
              复制指令
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

function AccountSecurity({ user, toast }: { user: PublicUser; toast: Toast }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const password = form.password || "";
  const confirmPassword = form.confirmPassword || "";
  const passwordError = password && password.length < 10 ? "密码至少需要 10 位。" : undefined;
  const confirmError = confirmPassword && confirmPassword !== password ? "两次输入的密码不一致。" : undefined;
  const canSubmit = Boolean(form.currentPassword && password && confirmPassword) && !passwordError && !confirmError;

  const submit = async () => {
    setPending(true);
    try {
      const result = await client.changePassword({
        currentPassword: form.currentPassword,
        password,
        confirmPassword,
      });
      toast(result.message);
      setForm({});
    } catch (error) {
      toast(error instanceof Error ? error.message : "密码修改失败。", "error");
    } finally {
      setPending(false);
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
            value={password}
            error={Boolean(passwordError)}
            helperText={passwordError || "至少 10 位"}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
          <TextField
            label="确认新密码"
            type="password"
            value={confirmPassword}
            error={Boolean(confirmError)}
            helperText={confirmError}
            onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
          />
          <Alert severity="info">修改密码后，其他设备上的登录状态会全部失效。</Alert>
          <Button startIcon={<Send />} size="large" onClick={submit} disabled={!canSubmit || pending} sx={{ mt: 1 }}>
            {pending ? "提交中…" : "确认修改"}
          </Button>
        </Stack>
      </Paper>
      {user.role === "admin" && <TelegramBinding user={user} toast={toast} />}
    </Stack>
  );
}

interface RecordForm {
  type: DnsRecordType;
  name: string;
  content: string;
  purpose: string;
  ttl: string;
  proxied: boolean;
}

const emptyRecordForm: RecordForm = { type: "A", name: "", content: "", purpose: "", ttl: "3600", proxied: false };

function Dashboard({ config, toast }: { config?: ApiConfig; toast: Toast }) {
  const [records, setRecords] = useState<DnsRecordRow[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [form, setForm] = useState<RecordForm>(emptyRecordForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DnsRecordRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [githubPagesWarningOpen, setGithubPagesWarningOpen] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const recordType = form.type;
  const contentValidationError = recordContentError(recordType, form.content);
  const nameValidationError = recordNameError(form.name, config?.parentDomain);
  const ttlValidationError = ttlError(form.ttl);
  const hasBlockingError = Boolean(contentValidationError || nameValidationError || ttlValidationError);
  const contentHint = recordContentHints[recordType];

  const refresh = useCallback(
    () =>
      client
        .records()
        .then(setRecords)
        .catch((error: unknown) => toast(error instanceof Error ? error.message : "加载解析记录失败。", "error"))
        .finally(() => setRecordsLoading(false)),
    [toast],
  );

  useEffect(() => {
    let active = true;
    client
      .records()
      .then((rows) => active && setRecords(rows))
      .catch((error: unknown) => active && toast(error instanceof Error ? error.message : "加载解析记录失败。", "error"))
      .finally(() => active && setRecordsLoading(false));
    return () => {
      active = false;
    };
  }, [toast]);

  const submit = async (skipGithubPagesWarning = false) => {
    try {
      validateRecordContent(recordType, String(form.content ?? ""));
      if (!skipGithubPagesWarning && isGithubPagesCname(recordType, form.content)) {
        setGithubPagesWarningOpen(true);
        return;
      }
      const body = { type: recordType, name: form.name, content: form.content, purpose: form.purpose, ttl: Number(form.ttl) || 3600, proxied: canProxyRecord(recordType) && form.proxied };
      const result = editingId ? await client.updateRecord(editingId, body) : await client.submitApplication(body);
      toast(result.message);
      setForm(emptyRecordForm);
      setEditingId(null);
      setGithubPagesWarningOpen(false);
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作未成功，请检查输入格式。", "error");
    }
  };

  const editRecord = (record: DnsRecordRow) => {
    setEditingId(record.id);
    setForm({
      type: asDnsRecordType(record.type),
      name: stripParent(record.name, config?.parentDomain),
      content: record.content,
      purpose: "",
      ttl: String(record.ttl),
      proxied: Boolean(record.proxied),
    });
    toast("已载入记录，请在上方表单修改后保存。");
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletePending(true);
    try {
      const result = await client.deleteRecord(deleteTarget.id);
      toast(result.message);
      setDeleteTarget(null);
      await refresh();
      // The delete runs on the queue; a second pass picks up the final state a moment later.
      setTimeout(() => void refresh(), 1500);
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除任务提交失败。", "error");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <Stack spacing={4}>
      <Header title="我的 DNS 记录" subtitle="管理您已审核通过并生效的解析记录" action={<Button variant="outlined" startIcon={<Refresh />} onClick={refresh}>刷新列表</Button>} />
      
      <Paper ref={formRef} sx={{ p: 4 }}>
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 700 }}>{editingId ? "修改现有记录" : "新增解析申请"}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "120px 1fr", md: "120px 1fr 1fr 120px 170px 160px" }, gap: 3, alignItems: "start" }}>
          <TextField
            select
            label="记录类型"
            value={form.type}
            onChange={(event) => {
              const type = asDnsRecordType(event.target.value);
              setForm({ ...form, type, proxied: canProxyRecord(type) ? form.proxied : false });
            }}
          >
            {dnsRecordTypes.map((type) => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="主机记录"
            placeholder="www"
            value={form.name}
            error={Boolean(nameValidationError)}
            helperText={nameValidationError || "例如 www"}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            slotProps={{
              input: {
                endAdornment: config?.parentDomain ? (
                  <InputAdornment position="end" sx={{ whiteSpace: "nowrap" }}>
                    .{config.parentDomain}
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />
          <TextField
            label="记录内容"
            placeholder={contentHint.placeholder}
            value={form.content}
            error={Boolean(contentValidationError)}
            helperText={contentValidationError || contentHint.helper}
            slotProps={{ formHelperText: { sx: { minHeight: 20 } } }}
            onChange={(event) => setForm({ ...form, content: event.target.value })}
          />
          <TextField
            label="TTL"
            type="number"
            value={form.ttl}
            error={Boolean(ttlValidationError)}
            helperText={ttlValidationError || "60 – 86400"}
            onChange={(event) => setForm({ ...form, ttl: event.target.value })}
          />
          <FormControlLabel
            control={
              <Switch
                checked={canProxyRecord(form.type) && form.proxied}
                disabled={!canProxyRecord(form.type)}
                onChange={(event) => setForm({ ...form, proxied: event.target.checked })}
              />
            }
            label="Cloudflare 代理"
            sx={{ height: 56, m: 0, alignItems: "center" }}
          />
          <Button
            fullWidth
            startIcon={<Add />}
            size="large"
            onClick={() => submit()}
            disabled={hasBlockingError}
            sx={{ height: 56, order: { xs: 1, md: 0 } }}
          >
            {editingId ? "保存修改" : "提交申请"}
          </Button>
          <Box sx={{ gridColumn: "1 / -1", order: { xs: 0, md: 0 } }}>
            <TextField fullWidth label="申请用途说明" placeholder="请简述该域名的使用场景，有助于加速审核过程" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
          </Box>
          {editingId && (
            <Box sx={{ gridColumn: "1 / -1" }}>
              <Button variant="text" color="inherit" onClick={() => {
                setEditingId(null);
                setForm(emptyRecordForm);
              }}>
                取消修改
              </Button>
            </Box>
          )}
        </Box>
      </Paper>

      <Dialog open={githubPagesWarningOpen} onClose={() => setGithubPagesWarningOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>GitHub Pages 设置提醒</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              提交前请确认已在设置中对应绑定custom域名，并确保仓库内的 CNAME 文件内容与申请域名一致。GitHub 生成 HTTPS 证书可能需要一些时间；请耐心等待。此外，开启cloudflare代理可能会导致不可预料的错误。建议保持关闭
            </Alert>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Link
                href="https://githubdocs.cn/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages"
                target="_blank"
                rel="noreferrer"
              >
                常见问题排查指南
              </Link>
              <Link
                href="https://githubdocs.cn/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site"
                target="_blank"
                rel="noreferrer"
              >
                如何配置自定义域名
              </Link>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setGithubPagesWarningOpen(false)}>返回检查</Button>
          <Button variant="contained" onClick={() => submit(true)}>{editingId ? "继续保存" : "继续提交"}</Button>
        </DialogActions>
      </Dialog>

      <DataTable
        columns={[
          { key: "name", label: "完整域名", primary: true, render: (record) => <Box sx={{ whiteSpace: { md: "nowrap" } }}>{record.name}</Box> },
          { key: "type", label: "类型", render: (record) => <Chip size="small" label={record.type} variant="outlined" /> },
          {
            key: "content",
            label: "解析内容",
            render: (record) => (
              <Box sx={{ minWidth: { md: 200 }, maxWidth: 320, wordBreak: "break-all", fontFamily: "monospace", fontSize: "0.875rem" }}>{record.content}</Box>
            ),
          },
          { key: "ttl", label: "TTL", render: (record) => record.ttl },
          {
            key: "proxied",
            label: "代理",
            render: (record) =>
              record.proxied ? <Chip size="small" label="已开启" color="primary" variant="outlined" /> : <Typography variant="body2">直连</Typography>,
          },
          { key: "status", label: "状态", render: (record) => <StatusChip value={record.status} /> },
          {
            key: "actions",
            label: "操作",
            actions: true,
            render: (record) => (
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" startIcon={<Edit />} onClick={() => editRecord(record)}>
                  修改
                </Button>
                <Button size="small" variant="outlined" color="error" startIcon={<Delete />} onClick={() => setDeleteTarget(record)}>
                  删除
                </Button>
              </Stack>
            ),
          },
        ]}
        rows={records}
        loading={recordsLoading}
        emptyText="还没有解析记录，在上方提交第一个申请吧。"
      />

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除 DNS 记录</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography sx={{ wordBreak: "break-all", fontWeight: 700 }}>{deleteTarget?.name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-all", fontFamily: "monospace" }}>
              {deleteTarget?.type} {deleteTarget?.content}
            </Typography>
            <Alert severity="warning">
              删除后该域名会被释放，其他用户可以重新申请。指向它的服务会立即无法解析。
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button color="error" disabled={deletePending} onClick={confirmDelete}>
            {deletePending ? "提交中…" : "确认删除"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function Applications({ toast }: { toast: Toast }) {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    client
      .applications()
      .then((value) => active && setRows(value))
      .catch((error: unknown) => active && toast(error instanceof Error ? error.message : "加载申请历史失败。", "error"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [toast, reloadKey]);

  return (
    <Stack spacing={4}>
      <Header
        title="申请历史"
        subtitle="查看您提交的所有解析申请及其审核进度"
        action={
          <Button variant="outlined" startIcon={<Refresh />} onClick={() => setReloadKey((current) => current + 1)}>
            刷新状态
          </Button>
        }
      />
      <ApplicationTable rows={rows} loading={loading} />
    </Stack>
  );
}

function AbusePage({ config, toast }: { config?: ApiConfig; toast: Toast }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");
  const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0);
  const submit = async () => {
    if (!token.trim()) {
      toast("请先完成人机验证以继续。", "error");
      return;
    }
    try {
      const result = await client.reportAbuse({ ...form, turnstileToken: token });
      toast(result.message);
      setForm({});
    } catch (error) {
      toast(error instanceof Error ? error.message : "举报提交失败，请重试。", "error");
    } finally {
      // Turnstile tokens are single-use; without a reset the next submit is rejected.
      setToken("");
      setTurnstileWidgetKey((current) => current + 1);
    }
  };
  return (
    <Stack spacing={4}>
      <Header title="滥用举报" subtitle="如果您发现 NekoDNS 托管的域名违反了服务协议，请告知我们" />
      <Paper sx={{ p: { xs: 3, md: 5 }, maxWidth: 800 }}>
        <Stack spacing={3}>
          <TextField
            label="被举报的二级域名"
            placeholder={config?.parentDomain ? `example.${config.parentDomain}` : "example"}
            value={form.subdomain || ""}
            onChange={(event) => setForm({ ...form, subdomain: event.target.value })}
          />
          <TextField label="举报原因分类" placeholder="如：网络钓鱼、恶意软件、侵权等" value={form.reason || ""} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          <TextField label="详细证据与说明" multiline minRows={5} placeholder="请提供具体的 URL 或详细描述，以便我们进行核实" value={form.details || ""} onChange={(event) => setForm({ ...form, details: event.target.value })} />
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <TurnstileBox siteKey={config?.turnstileSiteKey} onToken={setToken} resetKey={turnstileWidgetKey} />
          </Box>
          <Button startIcon={<Send />} size="large" onClick={submit}>
            提交举报
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}

/**
 * Cursor-free paging over one admin listing. Only the visible tab loads, and `reloadKey`
 * lets the panel header force a reload back to the first page.
 */
function usePagedList<Row>(fetchPage: (offset: number) => Promise<Page<Row>>, reloadKey: number, toast: Toast) {
  const [state, setState] = useState<{ items: Row[]; hasMore: boolean; loading: boolean }>({
    items: [],
    hasMore: false,
    loading: true,
  });

  const load = useCallback(
    async (offset: number) => {
      try {
        const page = await fetchPage(offset);
        setState((current) => ({
          items: offset === 0 ? page.items : [...current.items, ...page.items],
          hasMore: page.hasMore,
          loading: false,
        }));
      } catch (error) {
        toast(error instanceof Error ? error.message : "数据加载失败。", "error");
        setState((current) => ({ ...current, loading: false }));
      }
    },
    [fetchPage, toast],
  );

  // Loading page 0 lives in the effect rather than going through `load` so that a tab switch
  // or a refresh cancels the in-flight request instead of letting a stale page land late.
  useEffect(() => {
    let active = true;
    fetchPage(0)
      .then((page) => active && setState({ items: page.items, hasMore: page.hasMore, loading: false }))
      .catch((error: unknown) => {
        if (!active) return;
        toast(error instanceof Error ? error.message : "数据加载失败。", "error");
        setState((current) => ({ ...current, loading: false }));
      });
    return () => {
      active = false;
    };
  }, [fetchPage, reloadKey, toast]);

  const loadMore = () => {
    setState((current) => ({ ...current, loading: true }));
    void load(state.items.length);
  };

  return { items: state.items, hasMore: state.hasMore, loading: state.loading, loadMore };
}

function AdminPanel({ toast }: { toast: Toast }) {
  const [tab, setTab] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = () => setReloadKey((current) => current + 1);

  return (
    <Stack spacing={4}>
      <Header title="系统管理" subtitle="全局监控与资源调度中心" action={<Button variant="contained" startIcon={<Refresh />} onClick={refresh}>刷新当前列表</Button>} />
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
      {tab === 0 && <AdminApplications reloadKey={reloadKey} refresh={refresh} toast={toast} />}
      {tab === 1 && <UsersTable reloadKey={reloadKey} refresh={refresh} toast={toast} />}
      {tab === 2 && <RecordsTable reloadKey={reloadKey} toast={toast} />}
      {tab === 3 && <AdminReports reloadKey={reloadKey} refresh={refresh} toast={toast} />}
      {tab === 4 && <AuditTable reloadKey={reloadKey} toast={toast} />}
    </Stack>
  );
}

function AdminApplications({ reloadKey, refresh, toast }: { reloadKey: number; refresh: () => void; toast: Toast }) {
  const { items, hasMore, loading, loadMore } = usePagedList(client.adminApplications, reloadKey, toast);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminApplicationRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const vote = async (id: string, choice: "approve" | "deny") => {
    setBusyId(id);
    try {
      await client.vote(id, choice);
      toast("处理结果已记录并应用。");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "决策执行失败。", "error");
    } finally {
      setBusyId(null);
    }
  };

  const submitRejection = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await client.decision(rejectTarget.id, "rejected", rejectReason.trim());
      toast("驳回理由已记录并通知申请人。");
      setRejectTarget(null);
      setRejectReason("");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "驳回失败。", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
    <DataTable
      columns={[
        { key: "subdomain", label: "域名目标", primary: true, render: (app) => <Box sx={{ whiteSpace: { md: "nowrap" } }}>{app.subdomain}</Box> },
        { key: "username", label: "申请人", render: (app) => app.username },
        { key: "request_type", label: "类型", render: (app) => (app.request_type === "create" ? "新建" : "更新") },
        {
          key: "record_value",
          label: "解析值",
          render: (app) => (
            <Box sx={{ minWidth: { md: 200 }, maxWidth: 320, wordBreak: "break-all", fontFamily: "monospace", fontSize: "0.875rem" }}>
              {app.record_type} {app.record_value}
            </Box>
          ),
        },
        { key: "purpose", label: "申请用途", render: (app) => app.purpose || "未注明" },
        { key: "status", label: "当前状态", render: (app) => <StatusChip value={app.status} /> },
        {
          key: "voting_deadline_at",
          label: "投票截止",
          render: (app) => (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: { md: "nowrap" } }}>
              {formatDate(app.voting_deadline_at)}
            </Typography>
          ),
        },
        {
          key: "actions",
          label: "操作决策",
          actions: true,
          render: (app) =>
            app.status === "pending" ? (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: { md: 250 } }}>
                <Button size="small" color="success" disabled={busyId === app.id} onClick={() => vote(app.id, "approve")}>
                  通过
                </Button>
                <Button size="small" variant="outlined" color="error" disabled={busyId === app.id} onClick={() => vote(app.id, "deny")}>
                  拒绝
                </Button>
                <Tooltip title="驳回并向申请人说明原因">
                  <Button size="small" variant="text" color="inherit" sx={{ px: 1.5 }} onClick={() => setRejectTarget(app)}>
                    附理由
                  </Button>
                </Tooltip>
              </Stack>
            ) : (
              <Typography
                variant="caption"
                color={app.status === "error" ? "error" : "text.secondary"}
                sx={{ display: "block", maxWidth: 280, wordBreak: "break-word" }}
              >
                {(app.status === "error" ? app.last_error : app.admin_notes) || "—"}
              </Typography>
            ),
        },
      ]}
      rows={items}
      loading={loading}
      hasMore={hasMore}
      onLoadMore={loadMore}
      emptyText="当前没有申请记录。"
    />
    <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} fullWidth maxWidth="sm">
      <DialogTitle>驳回申请</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Alert severity="warning">
            即将驳回 <strong style={{ wordBreak: "break-all" }}>{rejectTarget?.subdomain}</strong>，理由会随邮件发送给申请人。
          </Alert>
          <TextField
            label="驳回理由"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            multiline
            minRows={4}
            placeholder="请说明不通过的原因，便于申请人修改后重新提交。"
            helperText={`${rejectReason.trim().length} / 500`}
            error={rejectReason.trim().length > 500}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={() => setRejectTarget(null)}>
          取消
        </Button>
        <Button
          color="error"
          disabled={!rejectReason.trim() || rejectReason.trim().length > 500 || busyId === rejectTarget?.id}
          onClick={submitRejection}
        >
          确认驳回
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}

function UsersTable({ reloadKey, refresh, toast }: { reloadKey: number; refresh: () => void; toast: Toast }) {
  const { items, hasMore, loading, loadMore } = usePagedList(client.adminUsers, reloadKey, toast);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleRole = async (user: AdminUserRow) => {
    const role = user.role === "admin" ? "user" : "admin";
    setBusyId(user.id);
    try {
      await client.setRole(user.id, role);
      toast(`用户 ${user.username} 的权限已更新。`);
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "权限更新失败。", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DataTable
      columns={[
        { key: "username", label: "用户名", primary: true, render: (user) => user.username },
        { key: "email", label: "电子邮箱", render: (user) => user.email },
        { key: "role", label: "系统角色", render: (user) => <StatusChip value={user.role} /> },
        {
          key: "email_verified_at",
          label: "邮箱验证",
          render: (user) =>
            user.email_verified_at ? (
              <Chip size="small" label="已验证" color="success" variant="outlined" />
            ) : (
              <Chip size="small" label="未验证" color="warning" variant="outlined" />
            ),
        },
        {
          key: "telegram_user_id",
          label: "Telegram",
          render: (user) => (user.telegram_user_id ? <Chip label={user.telegram_user_id} size="small" variant="outlined" /> : "未关联"),
        },
        {
          key: "created_at",
          label: "注册时间",
          render: (user) => (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: { md: "nowrap" } }}>
              {formatDate(user.created_at)}
            </Typography>
          ),
        },
        {
          key: "actions",
          label: "管理动作",
          actions: true,
          render: (user) => (
            <Button size="small" variant="outlined" disabled={busyId === user.id} onClick={() => toggleRole(user)}>
              {user.role === "admin" ? "取消管理" : "设为管理"}
            </Button>
          ),
        },
      ]}
      rows={items}
      loading={loading}
      hasMore={hasMore}
      onLoadMore={loadMore}
      emptyText="还没有注册用户。"
    />
  );
}

function AdminReports({ reloadKey, refresh, toast }: { reloadKey: number; refresh: () => void; toast: Toast }) {
  const { items, hasMore, loading, loadMore } = usePagedList(client.adminAbuseReports, reloadKey, toast);
  const [busyId, setBusyId] = useState<string | null>(null);

  const action = async (id: string, name: string) => {
    setBusyId(id);
    try {
      await client.abuseAction(id, name);
      toast("投诉工单状态已更新。");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败。", "error");
    } finally {
      setBusyId(null);
    }
  };
  return (
    <DataTable
      columns={[
        { key: "subdomain", label: "域名", primary: true, render: (report) => <Box sx={{ whiteSpace: { md: "nowrap" } }}>{report.subdomain}</Box> },
        { key: "reason", label: "投诉原因", render: (report) => report.reason },
        { key: "details", label: "详情", render: (report) => report.details || "无", hideOnMobile: true },
        { key: "status", label: "处理状态", render: (report) => <StatusChip value={report.status} /> },
        {
          key: "created_at",
          label: "提交时间",
          render: (report) => (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: { md: "nowrap" } }}>
              {formatDate(report.created_at)}
            </Typography>
          ),
        },
        {
          key: "actions",
          label: "决策动作",
          actions: true,
          render: (report) => (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: { md: 250 } }}>
              <Button size="small" variant="outlined" disabled={busyId === report.id} onClick={() => action(report.id, "acknowledge")}>
                受理
              </Button>
              <Button size="small" color="error" disabled={busyId === report.id} onClick={() => action(report.id, "suspend")}>
                封禁域名
              </Button>
              <Button size="small" variant="text" color="inherit" disabled={busyId === report.id} onClick={() => action(report.id, "ignore")}>
                忽略
              </Button>
            </Stack>
          ),
        },
      ]}
      rows={items}
      loading={loading}
      hasMore={hasMore}
      onLoadMore={loadMore}
      emptyText="目前没有滥用举报。"
    />
  );
}

function ApplicationTable({ rows, loading }: { rows: ApplicationRow[]; loading: boolean }) {
  return (
    <DataTable
      columns={[
        { key: "subdomain", label: "目标域名", primary: true, render: (app) => <Box sx={{ whiteSpace: { md: "nowrap" } }}>{app.subdomain}</Box> },
        { key: "request_type", label: "请求类型", render: (app) => (app.request_type === "create" ? "新建" : "更新") },
        {
          key: "record_value",
          label: "解析记录值",
          render: (app) => (
            <Box sx={{ minWidth: { md: 200 }, maxWidth: 320, wordBreak: "break-all", fontFamily: "monospace", fontSize: "0.875rem" }}>
              {app.record_type} {app.record_value}
            </Box>
          ),
        },
        { key: "purpose", label: "申请用途", render: (app) => app.purpose || "未注明" },
        { key: "status", label: "当前状态", render: (app) => <StatusChip value={app.status} /> },
        {
          key: "admin_notes",
          label: "处理说明",
          render: (app) => (
            <Typography
              variant="body2"
              color={app.status === "error" ? "error" : "text.secondary"}
              sx={{ maxWidth: 280, wordBreak: "break-word" }}
            >
              {(app.status === "error" ? app.last_error : app.admin_notes) || "—"}
            </Typography>
          ),
        },
        {
          key: "created_at",
          label: "提交日期",
          render: (app) => (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: { md: "nowrap" } }}>
              {formatDate(app.created_at)}
            </Typography>
          ),
        },
      ]}
      rows={rows}
      loading={loading}
      emptyText="你还没有提交过申请。"
    />
  );
}

function RecordsTable({ reloadKey, toast }: { reloadKey: number; toast: Toast }) {
  const { items, hasMore, loading, loadMore } = usePagedList(client.adminRecords, reloadKey, toast);
  const [noticeTarget, setNoticeTarget] = useState<AdminDnsRecordRow | null>(null);
  const [noticeForm, setNoticeForm] = useState({ subject: "", message: "" });

  const openNotice = (record: AdminDnsRecordRow) => {
    setNoticeTarget(record);
    setNoticeForm(defaultRecordNotice(record));
  };

  const sendNotice = async () => {
    if (!noticeTarget) return;
    try {
      const result = await client.notifyRecordOwner(noticeTarget.id, noticeForm);
      toast(result.message);
      setNoticeTarget(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : "邮件通知发送失败。", "error");
    }
  };

  return (
    <>
      <DataTable
        columns={[
          { key: "name", label: "域名", primary: true, render: (record) => <Box sx={{ whiteSpace: { md: "nowrap" } }}>{record.name}</Box> },
          { key: "username", label: "所有者", render: (record) => `${record.username}（${record.email}）` },
          {
            key: "content",
            label: "解析值",
            render: (record) => (
              <Box sx={{ minWidth: { md: 200 }, maxWidth: 320, wordBreak: "break-all", fontFamily: "monospace", fontSize: "0.875rem" }}>
                {record.type} {record.content}
              </Box>
            ),
          },
          {
            key: "proxied",
            label: "代理",
            render: (record) =>
              record.proxied ? <Chip size="small" label="开启" color="primary" variant="outlined" /> : <Typography variant="body2">直连</Typography>,
          },
          { key: "status", label: "解析状态", render: (record) => <StatusChip value={record.status} /> },
          {
            key: "created_at",
            label: "创建于",
            render: (record) => (
              <Typography variant="caption" color="text.secondary">
                {formatDate(record.created_at)}
              </Typography>
            ),
          },
          {
            key: "actions",
            label: "操作",
            actions: true,
            render: (record) => (
              <Button size="small" variant="outlined" startIcon={<Email />} onClick={() => openNotice(record)}>
                邮件通知
              </Button>
            ),
          },
        ]}
        rows={items}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        emptyText="还没有生效的解析记录。"
      />
      <Dialog open={Boolean(noticeTarget)} onClose={() => setNoticeTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>发送用户邮件</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              收件人：{noticeTarget?.username}（{noticeTarget?.email}）
            </Alert>
            <TextField
              label="邮件主题"
              value={noticeForm.subject}
              onChange={(event) => setNoticeForm((current) => ({ ...current, subject: event.target.value }))}
            />
            <TextField
              label="邮件正文"
              value={noticeForm.message}
              onChange={(event) => setNoticeForm((current) => ({ ...current, message: event.target.value }))}
              multiline
              minRows={8}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setNoticeTarget(null)}>取消</Button>
          <Button variant="contained" startIcon={<Send />} onClick={sendNotice}>发送</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function defaultRecordNotice(record: AdminDnsRecordRow) {
  const isCname = record.type === "CNAME";
  return {
    subject: isCname ? `请检查您的 CNAME 目标：${record.name}` : `请检查您的 DNS 记录：${record.name}`,
    message: isCname
      ? [
          `我们在例行检查中发现，您的域名 ${record.name} 当前指向的 CNAME 目标可能返回 404 或无法正常打开。`,
          `当前解析目标：${record.content}`,
          "请确认目标站点是否已正确绑定该域名，或登录 NekoDNS 控制面板更新解析记录。",
        ].join("\n\n")
      : [
          `我们需要提醒您检查 DNS 记录 ${record.name} 的当前配置。`,
          `当前记录：${record.type} ${record.content}`,
          "请登录 NekoDNS 控制面板确认该记录仍符合您的使用需求。",
        ].join("\n\n"),
  };
}

function AuditTable({ reloadKey, toast }: { reloadKey: number; toast: Toast }) {
  const { items, hasMore, loading, loadMore } = usePagedList(client.adminAuditLogs, reloadKey, toast);
  return (
    <DataTable
      columns={[
        { key: "action", label: "操作类型", primary: true, render: (log) => <Chip label={log.action} size="small" variant="outlined" /> },
        {
          key: "created_at",
          label: "发生时间",
          render: (log) => (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: { md: "nowrap" } }}>
              {formatDate(log.created_at)}
            </Typography>
          ),
        },
        { key: "username", label: "执行用户", render: (log) => log.username || "System" },
        {
          key: "target",
          label: "操作对象",
          render: (log) => (
            <Box sx={{ fontFamily: "monospace", fontSize: "0.875rem", wordBreak: "break-all" }}>
              {[log.target_type, log.target_id].filter(Boolean).join(":") || "—"}
            </Box>
          ),
        },
        {
          key: "ip",
          label: "源 IP 地址",
          render: (log) => (
            <Typography variant="body2" color="text.secondary">
              {log.ip || "—"}
            </Typography>
          ),
        },
      ]}
      rows={items}
      loading={loading}
      hasMore={hasMore}
      onLoadMore={loadMore}
      emptyText="暂无审计记录。"
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

type ChipColor = "success" | "warning" | "error" | "info" | "default";

const statusDisplay: Record<string, { color: ChipColor; label: string }> = {
  active: { color: "success", label: "生效中" },
  applied: { color: "success", label: "已生效" },
  approved: { color: "success", label: "已批准" },
  resolved: { color: "success", label: "已处理" },
  admin: { color: "info", label: "管理员" },
  user: { color: "default", label: "普通用户" },
  pending: { color: "warning", label: "待审批" },
  applying: { color: "warning", label: "同步中" },
  acknowledged: { color: "warning", label: "已受理" },
  new: { color: "warning", label: "待处理" },
  suspended: { color: "warning", label: "删除中" },
  rejected: { color: "error", label: "已拒绝" },
  expired: { color: "default", label: "已过期" },
  error: { color: "error", label: "处理失败" },
  deleted: { color: "default", label: "已删除" },
  ignored: { color: "default", label: "已忽略" },
};

function StatusChip({ value }: { value: string }) {
  const display = statusDisplay[value] ?? { color: "default" as ChipColor, label: value };

  return (
    <Chip
      size="small"
      color={display.color}
      label={display.label}
      variant={display.color === "default" ? "outlined" : "filled"}
      icon={value === "applied" ? <CheckCircle /> : undefined}
      sx={{ fontWeight: 700 }}
    />
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  const parsed = parseSqliteUtc(value);
  if (!parsed) return value;
  return parsed.toLocaleString("zh-CN", { 
    year: "numeric", 
    month: "2-digit", 
    day: "2-digit", 
    hour: "2-digit", 
    minute: "2-digit", 
    second: "2-digit", 
    hour12: false 
  });
}

/** SQLite emits naive UTC strings; tag them so the browser stops reading them as local time. */
function parseSqliteUtc(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function stripParent(name: string, parent?: string) {
  if (!parent) return name;
  const suffix = `.${parent}`;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}
