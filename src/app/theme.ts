import { createTheme } from "@mui/material/styles";

export function createNekoTheme() {
  return createTheme({
    palette: {
      mode: "light",
      primary: { main: "#386A20" },
      background: { default: "#FAFDF2", paper: "#FEFFF7" },
    },
    shape: { borderRadius: 16 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 999 },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { borderRadius: 28 },
        },
      },
    },
  });
}
