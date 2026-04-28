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

  if (loading) return <Centered title="NekoDNS" subtitle="加载中..." />;
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
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice(undefined)}>
        <Alert severity={notice?.severity ?? "success"} sx={{ width: "100%" }}>
          {notice?.text}
        </Alert>
      </Snackbar>
    </>
  );
}

function VerifyEmailScreen() {
  const search = new URLSearchParams(location.search);
  const isMigrationFlow = search.get("flow") === "migration";
  const [state, setState] = useState({ status: "loading", message: "正在处理..." });

  useEffect(() => {
    const token = search.get("token");
    if (!token) return setState({ status: "error", message: "令牌缺失" });

    client.verifyEmail(token, { flow: isMigrationFlow ? "migration" : undefined })
      .then(() => setState({ status: "success", message: "验证成功" }))
      .catch(e => setState({ status: "error", message: e.message }));
  }, [isMigrationFlow, search]);

  return (
    <Box sx={{ p: 4, textAlign: "center" }}>
      <Typography variant="h4">{state.message}</Typography>
      <Button href="/">返回登录</Button>
    </Box>
  );
}

function Centered({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <Stack spacing={1} alignItems="center">
        <Typography variant="h4">{title}</Typography>
        <Typography color="text.secondary">{subtitle}</Typography>
      </Stack>
    </Box>
  );
}

function AuthScreen({ config, onAuthed, toast }: { config?: ApiConfig; onAuthed: () => void; toast: (t: string, s?: any) => void }) {
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<any>({});
  const [token, setToken] = useState("");

  const submit = async () => {
    try {
      if (tab === 0) {
        await client.login({ ...form, turnstileToken: token });
        onAuthed();
      } else {
        await client.register({ ...form, turnstileToken: token });
        toast("注册成功，请验证邮箱");
        setTab(0);
      }
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}>
      <Paper sx={{ width: "min(100%, 450px)", p: 4 }}>
        <Typography variant="h4" sx={{ mb: 4 }}>NekoDNS</Typography>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
          <Tab label="登录" />
          <Tab label="注册" />
        </Tabs>
        <Stack spacing={2}>
          <TextField label="账号" onChange={e => setForm({ ...form, login: e.target.value, username: e.target.value })} />
          <TextField label="密码" type="password" onChange={e => setForm({ ...form, password: e.target.value })} />
          {tab === 1 && <TextField label="邮箱" onChange={e => setForm({ ...form, email: e.target.value })} />}
          <TurnstileBox siteKey={config?.turnstileSiteKey} onToken={setToken} />
          <Button onClick={submit}>{tab === 0 ? "登录" : "注册"}</Button>
        </Stack>
      </Paper>
    </Box>
  );
}

function ResetPasswordScreen({ config, toast }: { config?: ApiConfig; toast: any }) {
  return <Centered title="重置密码" subtitle="请通过邮件链接访问" />;
}

function AccountSecurity({ user, toast }: { user: any; toast: any }) {
  return <Typography variant="h4">账户安全 (开发中)</Typography>;
}

function Dashboard({ config, toast }: { config?: ApiConfig; toast: any }) {
  const [records, setRecords] = useState<any[]>([]);
  const refresh = useCallback(() => client.records().then(setRecords), []);
  useEffect(() => void refresh(), [refresh]);

  return (
    <Stack spacing={3}>
      <Header title="DNS 解析" action={<Button onClick={refresh}>刷新</Button>} />
      <DataTable
        columns={["类型", "名称", "值", "状态"]}
        rows={records}
        render={r => (
          <>
            <TableCell>{r.type}</TableCell>
            <TableCell>{r.name}</TableCell>
            <TableCell>{r.content}</TableCell>
            <TableCell><StatusChip value={r.status} /></TableCell>
          </>
        )}
      />
    </Stack>
  );
}

function Applications({ toast }: { toast: any }) {
  return <Typography variant="h4">申请历史</Typography>;
}

function AbusePage({ config, toast }: { config?: ApiConfig; toast: any }) {
  return <Typography variant="h4">滥用举报</Typography>;
}

function AdminPanel({ toast }: { toast: any }) {
  return <Typography variant="h4">系统管理</Typography>;
}

function Header({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="h4">{title}</Typography>
      {action}
    </Stack>
  );
}

function DataTable({ columns, rows, render }: { columns: string[]; rows: any[]; render: (r: any) => ReactNode }) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            {columns.map(c => <TableCell key={c}>{c}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(r => <TableRow key={r.id}>{render(r)}</TableRow>)}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function StatusChip({ value }: { value: string }) {
  return <Chip label={value} size="small" />;
}

function stripParent(name: string, parent?: string) {
  if (!parent) return name;
  const suffix = `.${parent}`;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}
