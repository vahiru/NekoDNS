import { createTheme, alpha } from "@mui/material/styles";

export function createNekoTheme() {
  const primary = "#386A20";
  const secondary = "#55624C";
  const error = "#BA1A1A";
  const surface = "#FAFDF2";
  const surfaceContainer = "#F0F3E8"; // M3 Surface Container
  const surfaceContainerHigh = "#EAECE3";

  return createTheme({
    palette: {
      mode: "light",
      primary: {
        main: primary,
        light: "#A6D984",
        dark: "#205107",
        contrastText: "#FFFFFF",
      },
      secondary: {
        main: secondary,
        light: "#D9E7CB",
        dark: "#3D4A35",
        contrastText: "#FFFFFF",
      },
      error: {
        main: error,
        light: "#FFDAD6",
        dark: "#93000A",
      },
      background: {
        default: surface,
        paper: "#FEFFF7",
      },
      text: {
        primary: "#1A1C18",
        secondary: "#44483D",
      },
      divider: "#C8CBBF",
    },
    shape: { borderRadius: 16 },
    typography: {
      fontFamily: `"Inter", "Roboto", "Noto Sans SC", system-ui, sans-serif`,
      h4: { fontWeight: 700, letterSpacing: -0.5 },
      h5: { fontWeight: 700, letterSpacing: -0.25 },
      h6: { fontWeight: 600, letterSpacing: 0 },
      button: { textTransform: "none", fontWeight: 600, letterSpacing: 0.1 },
    },
    components: {
      MuiButton: {
        defaultProps: { variant: "contained", disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 999,
            padding: "8px 24px",
            minHeight: 40,
            fontSize: "0.9375rem",
          },
          containedPrimary: {
            "&:hover": {
              backgroundColor: alpha(primary, 0.92),
            },
          },
          outlined: {
            borderWidth: "1px",
            "&:hover": {
              borderWidth: "1px",
              backgroundColor: alpha(secondary, 0.08),
            },
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backgroundColor: surfaceContainer,
          },
          rounded: { borderRadius: 28 }, // MD3 Card Rounding
        },
      },
      MuiTextField: {
        defaultProps: { variant: "filled", size: "small" },
      },
      MuiFilledInput: {
        styleOverrides: {
          root: {
            borderRadius: "12px 12px 4px 4px",
            backgroundColor: surfaceContainerHigh,
            "&:hover": {
              backgroundColor: alpha(surfaceContainerHigh, 0.8),
            },
            "&.Mui-focused": {
              backgroundColor: surfaceContainerHigh,
            },
            "&:before": { borderBottomColor: "#C8CBBF" },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 600,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${alpha("#C8CBBF", 0.5)}`,
          },
          head: {
            fontWeight: 700,
            color: "#44483D",
            backgroundColor: surfaceContainerHigh,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(surface, 0.8),
            backdropFilter: "blur(12px)",
            borderBottom: `1px solid ${alpha("#C8CBBF", 0.3)}`,
            color: "#1A1C18",
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 28,
            backgroundColor: surfaceContainer,
            padding: 8,
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            height: 3,
            borderRadius: "3px 3px 0 0",
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            minHeight: 48,
          },
        },
      },
    },
  });
}
