import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    environmentMatchGlobs: [
      // Only component tests need a DOM environment
      ["tests/components/**", "jsdom"],
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
