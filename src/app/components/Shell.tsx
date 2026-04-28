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
  Avatar,
  Stack,
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
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
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
            sx={{ borderRadius: 999, mb: 0.5 }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Divider sx={{ my: 2 }} />
      <Button fullWidth startIcon={<Logout />} variant="text" onClick={onLogout}>
        退出登录
      </Button>
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", bgcolor: "background.default" }}>
      {wide && <Box component="aside" sx={{ width: 280, borderRight: "1px solid", borderColor: "divider" }}>{drawer}</Box>}
      <Drawer open={open} onClose={() => setOpen(false)}>{drawer}</Drawer>
      <Box sx={{ flex: 1 }}>
        <AppBar position="sticky" elevation={0} sx={{ bgcolor: "background.default", borderBottom: "1px solid", borderColor: "divider", color: "text.primary" }}>
          <Toolbar>
            {!wide && <IconButton onClick={() => setOpen(true)} edge="start" sx={{ mr: 2 }}><Menu /></IconButton>}
            <Typography variant="h6" sx={{ flexGrow: 1 }}>控制面板</Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2">{user.username}</Typography>
              <Avatar sx={{ width: 32, height: 32 }}>{user.username[0]?.toUpperCase()}</Avatar>
            </Stack>
          </Toolbar>
        </AppBar>
        <Container maxWidth="xl" sx={{ py: 4 }}>{children}</Container>
      </Box>
    </Box>
  );
}
