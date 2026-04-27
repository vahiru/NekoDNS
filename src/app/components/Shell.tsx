import {
  AppBar,
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
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
  alpha,
  Avatar,
} from "@mui/material";
import { AdminPanelSettings, AssignmentTurnedIn, BugReport, Dashboard, Dns, Logout, ManageAccounts, Menu } from "@mui/icons-material";
import { useState } from "react";
import type { ReactNode } from "react";
import type { PublicUser } from "../../shared/types";

export type ViewKey = "dashboard" | "applications" | "account" | "admin" | "abuse";

const nav = [
  { key: "dashboard", label: "解析记录", icon: <Dns /> },
  { key: "applications", label: "申请历史", icon: <AssignmentTurnedIn /> },
  { key: "account", label: "账户安全", icon: <ManageAccounts /> },
  { key: "abuse", label: "滥用举报", icon: <BugReport /> },
] as const;

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

  const drawer = (
    <Box sx={{ width: 280, p: 2, display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ px: 2, py: 3, display: "flex", alignItems: "center", gap: 2 }}>
        <Dashboard color="primary" sx={{ fontSize: 32 }} />
        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -1 }}>
          NekoDNS
        </Typography>
      </Box>
      <List sx={{ flex: 1 }}>
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
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                color: theme.palette.primary.main,
                "& .MuiListItemIcon-root": { color: theme.palette.primary.main },
                "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.18) },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 44 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: view === item.key ? 700 : 500 }} />
          </ListItemButton>
        ))}
        {user.role === "admin" && (
          <ListItemButton
            selected={view === "admin"}
            onClick={() => {
              onView("admin");
              setOpen(false);
            }}
            sx={{
              borderRadius: 999,
              mb: 1,
              mx: 1,
              px: 3,
              "&.Mui-selected": {
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                color: theme.palette.primary.main,
                "& .MuiListItemIcon-root": { color: theme.palette.primary.main },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 44 }}>
              <AdminPanelSettings />
            </ListItemIcon>
            <ListItemText primary="系统管理" primaryTypographyProps={{ fontWeight: view === "admin" ? 700 : 500 }} />
          </ListItemButton>
        )}
      </List>
      <Divider sx={{ my: 2, mx: 2, opacity: 0.5 }} />
      <Box sx={{ p: 1 }}>
        <Button
          fullWidth
          startIcon={<Logout />}
          variant="text"
          color="inherit"
          onClick={onLogout}
          sx={{ borderRadius: 999, py: 1.5, opacity: 0.7, "&:hover": { opacity: 1, bgcolor: alpha(theme.palette.error.main, 0.08), color: "error.main" } }}
        >
          安全退出
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", bgcolor: "background.default" }}>
      {wide && (
        <Box component="aside" sx={{ width: 280, borderRight: `1px solid ${alpha(theme.palette.divider, 0.3)}`, position: "fixed", height: "100vh" }}>
          {drawer}
        </Box>
      )}
      <Drawer open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { borderRadius: "0 24px 24px 0" } }}>
        {drawer}
      </Drawer>
      
      <Box sx={{ flex: 1, ml: wide ? "280px" : 0 }}>
        <AppBar position="sticky" elevation={0} sx={{ borderBottom: `1px solid ${alpha(theme.palette.divider, 0.2)}` }}>
          <Toolbar sx={{ px: { xs: 2, md: 4 } }}>
            {!wide && (
              <IconButton onClick={() => setOpen(true)} edge="start" sx={{ mr: 2 }}>
                <Menu />
              </IconButton>
            )}
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, display: { xs: "none", sm: "block" } }}>
                控制面板
              </Typography>
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box sx={{ textAlign: "right" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {user.username}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user.role === "admin" ? "系统管理员" : "普通用户"}
                </Typography>
              </Box>
              <Avatar sx={{ bgcolor: "primary.main", width: 36, height: 36, fontSize: "0.875rem", fontWeight: 700 }}>
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

import { Stack } from "@mui/material";
