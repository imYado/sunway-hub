import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/unit/setup.ts"],
    // Database-backed tests share one test database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
