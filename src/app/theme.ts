import { createTheme } from "@mui/material/styles";

export function createNekoTheme() {
  return createTheme({
    palette: {
      mode: "light",
      primary: { main: "#386A20", light: "#A6D984", dark: "#205107", contrastText: "#FFFFFF" },
      secondary: { main: "#55624C", light: "#D9E7CB", dark: "#3D4A35", contrastText: "#FFFFFF" },
      error: { main: "#BA1A1A", light: "#FFDAD6", dark: "#93000A" },
      warning: { main: "#8B5000", light: "#FFDDB4", dark: "#703800" },
      info: { main: "#006C9C", light: "#C7E7FF", dark: "#004D71" },
      success: { main: "#386A20", light: "#D9E7CB", dark: "#205107" },
      background: { default: "#FAFDF2", paper: "#FEFFF7" },
      text: { primary: "#1A1C18", secondary: "#44483D" },
      divider: "#C8CBBF",
    },
    shape: { borderRadius: 20 },
    typography: {
      fontFamily: `"Inter", "Roboto", "Noto Sans SC", system-ui, sans-serif`,
      h4: { fontWeight: 760, letterSpacing: 0 },
      h5: { fontWeight: 740, letterSpacing: 0 },
      h6: { fontWeight: 700, letterSpacing: 0 },
      button: { textTransform: "none", fontWeight: 700, letterSpacing: 0 },
    },
    components: {
      MuiButton: {
        defaultProps: { variant: "contained" },
        styleOverrides: {
          root: { borderRadius: 999, minHeight: 40, boxShadow: "none" },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
          rounded: { borderRadius: 24 },
        },
      },
      MuiTextField: {
        defaultProps: { variant: "filled", size: "small" },
      },
      MuiFilledInput: {
        styleOverrides: {
          root: { borderRadius: 16, overflow: "hidden" },
        },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: 999, fontWeight: 650 } },
      },
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 800, color: "#44483D" },
        },
      },
    },
  });
}
