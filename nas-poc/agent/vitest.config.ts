import { defineConfig } from "vitest/config";

// Isolated from the work-os root vitest config (which pulls in the React plugin).
export default defineConfig({
  root: __dirname,
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
