import { CssBaseline, ThemeProvider, useMediaQuery } from "@mui/material";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  COLOR_MODE_STORAGE_KEY,
  ColorModeContext,
  readStoredPreference,
  type ColorModePreference,
} from "../color-mode";
import { createNekoTheme } from "../theme";

/** Owns the colour mode preference and hands the resolved theme to the tree below. */
export function ThemeRoot({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ColorModePreference>(readStoredPreference);
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolved = preference === "system" ? (prefersDark ? "dark" : "light") : preference;

  const setPreference = useCallback((next: ColorModePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(COLOR_MODE_STORAGE_KEY, next);
    } catch {
      // Preference just will not survive a reload; not worth surfacing.
    }
  }, []);

  // Keeps the browser UI (scrollbars, form controls, address bar) in step with the app.
  useEffect(() => {
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const theme = useMemo(() => createNekoTheme(resolved), [resolved]);
  const contextValue = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);

  return (
    <ColorModeContext.Provider value={contextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
