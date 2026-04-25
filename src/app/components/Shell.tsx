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
} from "@mui/material";
import { AdminPanelSettings, AssignmentTurnedIn, BugReport, Dashboard, Dns, Logout, Menu } from "@mui/icons-material";
import { useState } from "react";
import type { ReactNode } from "react";
import type { PublicUser } from "../../shared/types";

export type ViewKey = "dashboard" | "applications" | "admin" | "abuse";

const nav = [
  { key: "dashboard", label: "DNS 记录", icon: <Dns /> },
  { key: "applications", label: "申请记录", icon: <AssignmentTurnedIn /> },
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
    <Box sx={{ width: 280, p: 2 }}>
      <Typography variant="h5" sx={{ px: 1, py: 2 }}>
        NekoDNS
      </Typography>
      <List>
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
        {user.role === "admin" && (
          <ListItemButton
            selected={view === "admin"}
            onClick={() => {
              onView("admin");
              setOpen(false);
            }}
            sx={{ borderRadius: 999, mb: 0.5 }}
          >
            <ListItemIcon>
              <AdminPanelSettings />
            </ListItemIcon>
            <ListItemText primary="管理员" />
          </ListItemButton>
        )}
      </List>
      <Divider sx={{ my: 2 }} />
      <Button fullWidth startIcon={<Logout />} variant="text" color="secondary" onClick={onLogout}>
        退出登录
      </Button>
    </Box>
  );

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: "blur(16px)", borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar>
          {!wide && (
            <IconButton onClick={() => setOpen(true)} edge="start" sx={{ mr: 1 }}>
              <Menu />
            </IconButton>
          )}
          <Dashboard sx={{ mr: 1.5, color: "primary.main" }} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            NekoDNS Registry
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {user.username}
          </Typography>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: "flex" }}>
        {wide && <Box component="aside">{drawer}</Box>}
        <Drawer open={open} onClose={() => setOpen(false)}>
          {drawer}
        </Drawer>
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 }, flex: 1 }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}
