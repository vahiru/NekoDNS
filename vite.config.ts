import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split the vendor groups out of the app chunk so a UI change does not invalidate the
        // framework code that almost never moves. Matching on resolved paths rather than package
        // names keeps React's CJS interop modules in the React chunk instead of leaking into MUI.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@mui/icons-material")) return "mui-icons";
          if (id.includes("@mui/") || id.includes("@emotion/")) return "mui";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  test: {
    // Two environments: plain node for the shared/worker logic, jsdom for anything that
    // mounts a component. `extends` keeps the React plugin available in both.
    projects: [
      {
        extends: true,
        test: { name: "unit", environment: "node", include: ["tests/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/ui/**/*.test.tsx"],
          setupFiles: ["tests/ui/setup.ts"],
        },
      },
    ],
  },
});
