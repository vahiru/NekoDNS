import { createTheme, alpha, type Theme } from "@mui/material/styles";

export type ColorMode = "light" | "dark";

/**
 * Material Design 3 style tokens for the NekoDNS green source colour.
 *
 * Every colour the app uses lives here and is reachable through `theme.palette`, so component
 * overrides never hardcode a hex value: that is what previously made the theme light-only.
 */
interface ColorTokens {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  warning: string;
  success: string;
  info: string;
  background: string;
  surface: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
}

const lightTokens: ColorTokens = {
  primary: "#386A20",
  onPrimary: "#FFFFFF",
  primaryContainer: "#B8F397",
  onPrimaryContainer: "#042100",
  secondary: "#55624C",
  onSecondary: "#FFFFFF",
  secondaryContainer: "#D8E7CB",
  onSecondaryContainer: "#131F0D",
  error: "#BA1A1A",
  onError: "#FFFFFF",
  errorContainer: "#FFDAD6",
  onErrorContainer: "#410002",
  warning: "#7A5900",
  success: "#386A20",
  info: "#3B6470",
  background: "#F9FAEF",
  surface: "#F9FAEF",
  surfaceContainerLow: "#F3F5E9",
  surfaceContainer: "#EDEEE3",
  surfaceContainerHigh: "#E7E9DE",
  onSurface: "#1A1C18",
  onSurfaceVariant: "#44483D",
  outline: "#74796C",
  outlineVariant: "#C4C8BA",
};

const darkTokens: ColorTokens = {
  primary: "#9DD67D",
  onPrimary: "#0B3900",
  primaryContainer: "#205107",
  onPrimaryContainer: "#B8F397",
  secondary: "#BCCBB0",
  onSecondary: "#273421",
  secondaryContainer: "#3D4A35",
  onSecondaryContainer: "#D8E7CB",
  error: "#FFB4AB",
  onError: "#690005",
  errorContainer: "#93000A",
  onErrorContainer: "#FFDAD6",
  warning: "#F2BF48",
  success: "#9DD67D",
  info: "#A3CDDA",
  background: "#12140E",
  surface: "#12140E",
  surfaceContainerLow: "#1A1C18",
  surfaceContainer: "#1E201A",
  surfaceContainerHigh: "#282B24",
  onSurface: "#E2E3D8",
  onSurfaceVariant: "#C4C8BA",
  outline: "#8E9285",
  outlineVariant: "#44483D",
};

declare module "@mui/material/styles" {
  interface Palette {
    surfaceContainer: string;
    surfaceContainerHigh: string;
    primaryContainer: string;
    onPrimaryContainer: string;
  }
  interface PaletteOptions {
    surfaceContainer?: string;
    surfaceContainerHigh?: string;
    primaryContainer?: string;
    onPrimaryContainer?: string;
  }
}

export function createNekoTheme(mode: ColorMode): Theme {
  const t = mode === "dark" ? darkTokens : lightTokens;

  return createTheme({
    palette: {
      mode,
      primary: { main: t.primary, contrastText: t.onPrimary, light: t.primaryContainer, dark: t.onPrimaryContainer },
      secondary: { main: t.secondary, contrastText: t.onSecondary, light: t.secondaryContainer, dark: t.onSecondaryContainer },
      error: { main: t.error, contrastText: t.onError, light: t.errorContainer, dark: t.onErrorContainer },
      warning: { main: t.warning },
      success: { main: t.success },
      info: { main: t.info },
      background: { default: t.background, paper: t.surfaceContainerLow },
      text: { primary: t.onSurface, secondary: t.onSurfaceVariant },
      divider: t.outlineVariant,
      surfaceContainer: t.surfaceContainer,
      surfaceContainerHigh: t.surfaceContainerHigh,
      primaryContainer: t.primaryContainer,
      onPrimaryContainer: t.onPrimaryContainer,
    },
    shape: { borderRadius: 16 },
    typography: {
      fontFamily: `"Inter", "Roboto", "Noto Sans SC", system-ui, sans-serif`,
      h4: { fontWeight: 700, letterSpacing: -0.5 },
      h5: { fontWeight: 700, letterSpacing: -0.25 },
      h6: { fontWeight: 600, letterSpacing: 0 },
      button: { textTransform: "none", fontWeight: 600, letterSpacing: 0.1 },
      body1: { fontSize: "1rem" },
      body2: { fontSize: "0.9375rem" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { WebkitTextSizeAdjust: "100%", textSizeAdjust: "100%", colorScheme: mode },
          // Stops the flash of the wrong colour before React paints.
          body: { backgroundColor: t.background },
        },
      },
      MuiButton: {
        defaultProps: { variant: "contained", disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 999, padding: "8px 24px", minHeight: 40, fontSize: "0.9375rem", whiteSpace: "nowrap" },
          containedPrimary: { "&:hover": { backgroundColor: alpha(t.primary, 0.88) } },
          outlined: {
            borderWidth: "1px",
            borderColor: t.outline,
            "&:hover": { borderWidth: "1px", backgroundColor: alpha(t.primary, 0.08) },
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: "none" },
          rounded: { borderRadius: 24 },
        },
      },
      MuiTextField: { defaultProps: { variant: "filled", size: "small" } },
      MuiFilledInput: {
        styleOverrides: {
          root: {
            borderRadius: "12px 12px 4px 4px",
            backgroundColor: t.surfaceContainerHigh,
            // 16px keeps iOS Safari from zooming the viewport on focus.
            fontSize: "16px",
            "&:hover": { backgroundColor: alpha(t.surfaceContainerHigh, 0.75) },
            "&.Mui-focused": { backgroundColor: t.surfaceContainerHigh },
            "&:before": { borderBottomColor: t.outline },
          },
          input: { fontSize: "16px" },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 600 } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${alpha(t.outlineVariant, 0.6)}`, padding: "12px 16px", verticalAlign: "top" },
          head: { fontWeight: 700, color: t.onSurfaceVariant, backgroundColor: t.surfaceContainerHigh },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(t.surface, 0.8),
            backdropFilter: "blur(12px)",
            borderBottom: `1px solid ${alpha(t.outlineVariant, 0.5)}`,
            color: t.onSurface,
          },
        },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 24, backgroundColor: t.surfaceContainer, padding: 8 } },
      },
      MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: "3px 3px 0 0" } } },
      MuiTab: { styleOverrides: { root: { fontWeight: 600, minHeight: 48 } } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
      MuiSkeleton: { styleOverrides: { root: { backgroundColor: alpha(t.onSurface, 0.08) } } },
    },
  });
}
