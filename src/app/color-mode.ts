import { createContext, useContext } from "react";
import type { ColorMode } from "./theme";

/** What the user picked; "system" defers to the OS setting. */
export type ColorModePreference = ColorMode | "system";

export const COLOR_MODE_STORAGE_KEY = "nekodns:color-mode";

export interface ColorModeContextValue {
  preference: ColorModePreference;
  /** The mode actually in effect once "system" is resolved. */
  resolved: ColorMode;
  setPreference: (preference: ColorModePreference) => void;
}

export const ColorModeContext = createContext<ColorModeContextValue>({
  preference: "system",
  resolved: "light",
  setPreference: () => undefined,
});

export function useColorMode() {
  return useContext(ColorModeContext);
}

export function readStoredPreference(): ColorModePreference {
  try {
    const stored = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Private mode or blocked storage: fall back to following the OS.
  }
  return "system";
}
