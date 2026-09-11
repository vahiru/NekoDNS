import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  AdminPanelSettings,
  AssignmentTurnedIn,
  BugReport,
  DarkMode,
  Dashboard,
  Dns,
  LightMode,
  Logout,
  ManageAccounts,
  Menu,
  SettingsBrightness,
} from "@mui/icons-material";
import { useState, type ReactNode } from "react";
import type { PublicUser } from "../../shared/types";
import { useColorMode, type ColorModePreference } from "../color-mode";

export type ViewKey = "dashboard" | "applications" | "account" | "admin" | "abuse";

const DRAWER_WIDTH = 280;

const baseNav = [
  { key: "dashboard", label: "解析记录", icon: <Dns /> },
  { key: "applications", label: "申请历史", icon: <AssignmentTurnedIn /> },
  { key: "account", label: "账户安全", icon: <ManageAccounts /> },
  { key: "abuse", label: "滥用举报", icon: <BugReport /> },
] as const satisfies readonly { key: ViewKey; label: string; icon: ReactNode }[];

const adminNav = { key: "admin", label: "系统管理", icon: <AdminPanelSettings /> } as const;

const colorModeCycle: Record<ColorModePreference, ColorModePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const colorModeLabel: Record<ColorModePreference, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

function ColorModeButton() {
  const { preference, setPreference } = useColorMode();
  const icon = preference === "light" ? <LightMode /> : preference === "dark" ? <DarkMode /> : <SettingsBrightness />;

  return (
    <Tooltip title={`外观：${colorModeLabel[preference]}（点击切换）`}>
      <IconButton onClick={() => setPreference(colorModeCycle[preference])} aria-label={`外观：${colorModeLabel[preference]}，点击切换`}>
        {icon}
      </IconButton>
    </Tooltip>
  );
}

export function Shell({
  user,
  view,
  onView,
  onLogout,
  children,
}: {
  user: PublicUser;
  view: ViewKey;
  onView: (view: ViewKey) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const [open, setOpen] = useState(false);

  const nav: readonly { key: ViewKey; label: string; icon: ReactNode }[] = user.role === "admin" ? [...baseNav, adminNav] : baseNav;
  const activeLabel = nav.find((item) => item.key === view)?.label ?? "控制面板";

  const drawer = (
    <Box sx={{ width: DRAWER_WIDTH, p: 2, display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ px: 2, py: 3, display: "flex", alignItems: "center", gap: 2 }}>
        <Dashboard color="primary" sx={{ fontSize: 32 }} />
        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -1 }}>
          NekoDNS
        </Typography>
      </Box>
      <List sx={{ flex: 1 }} component="nav" aria-label="主导航">
        {nav.map((item) => (
          <ListItemButton
            key={item.key}
            selected={view === item.key}
            onClick={() => {
              onView(item.key);
              setOpen(false);
            }}
            sx={{
              borderRadius: 999,
              mb: 1,
              mx: 1,
              px: 3,
              "&.Mui-selected": {
                bgcolor: "primaryContainer",
                color: "onPrimaryContainer",
                "& .MuiListItemIcon-root": { color: "onPrimaryContainer" },
                "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.24) },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 44, color: "inherit" }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} slotProps={{ primary: { fontWeight: view === item.key ? 700 : 500 } }} />
          </ListItemButton>
        ))}
      </List>
      <Divider sx={{ my: 2, mx: 2, opacity: 0.5 }} />
      <Box sx={{ p: 1 }}>
        <Button
          fullWidth
          startIcon={<Logout />}
          variant="text"
          color="inherit"
          onClick={onLogout}
          sx={{
            borderRadius: 999,
            py: 1.5,
            opacity: 0.7,
            "&:hover": { opacity: 1, bgcolor: alpha(theme.palette.error.main, 0.08), color: "error.main" },
          }}
        >
          安全退出
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", bgcolor: "background.default" }}>
      {wide && (
        <Box
          component="aside"
          sx={{ width: DRAWER_WIDTH, borderRight: `1px solid ${theme.palette.divider}`, position: "fixed", height: "100vh" }}
        >
          {drawer}
        </Box>
      )}
      <Drawer open={open} onClose={() => setOpen(false)} slotProps={{ paper: { sx: { borderRadius: "0 24px 24px 0" } } }}>
        {drawer}
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0, ml: wide ? `${DRAWER_WIDTH}px` : 0 }}>
        <AppBar position="sticky" elevation={0}>
          <Toolbar sx={{ px: { xs: 2, md: 4 }, gap: 1 }}>
            {!wide && (
              <IconButton onClick={() => setOpen(true)} edge="start" aria-label="打开导航菜单">
                <Menu />
              </IconButton>
            )}
            <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 700, minWidth: 0 }} noWrap>
              {activeLabel}
            </Typography>
            <ColorModeButton />
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ textAlign: "right", display: { xs: "none", sm: "block" } }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {user.username}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user.role === "admin" ? "系统管理员" : "普通用户"}
                </Typography>
              </Box>
              <Avatar sx={{ bgcolor: "primary.main", color: "primary.contrastText", width: 36, height: 36, fontSize: "0.875rem", fontWeight: 700 }}>
                {user.username.slice(0, 1).toUpperCase()}
              </Avatar>
            </Stack>
          </Toolbar>
        </AppBar>
        <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}
