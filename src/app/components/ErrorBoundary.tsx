import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * Without this a render-time throw leaves a blank white page with nothing in the UI to explain it.
 * Class component because React still has no hook equivalent for error boundaries.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 2 }}>
        <Paper sx={{ width: "min(100%, 560px)", p: { xs: 3, sm: 5 } }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" gutterBottom>
                页面出错了
              </Typography>
              <Typography color="text.secondary">界面遇到了一个未预期的错误，你的数据没有受到影响。</Typography>
            </Box>
            <Alert severity="error" sx={{ wordBreak: "break-word" }}>
              {error.message || "未知错误"}
            </Alert>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Button onClick={() => this.setState({ error: null })}>重试</Button>
              <Button variant="outlined" onClick={() => location.reload()}>
                重新加载页面
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    );
  }
}
