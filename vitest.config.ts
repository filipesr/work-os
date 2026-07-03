import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./__tests__/setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}", "**/*.test.{ts,tsx}"],
    // nas-poc is an isolated spike with its own vitest runner (node env); its jose-based tests break
    // under this project's jsdom env, so keep them out of the main suite.
    exclude: ["node_modules", ".next", "e2e/**", "**/*.spec.ts", "nas-poc/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` throws outside a react-server context; stub it so server modules that guard
      // themselves with it can still be unit-tested under the jsdom environment.
      "server-only": path.resolve(__dirname, "./__tests__/stubs/server-only.ts"),
    },
  },
});
