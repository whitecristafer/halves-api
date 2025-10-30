import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.spec.ts"],
    hookTimeout: 30000,
    testTimeout: 30000,
    restoreMocks: true,
    // Run tests sequentially to avoid DB truncation races between files
    pool: "threads",
    poolOptions: {
      threads: { singleThread: true },
    },
  },
});
