import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@shared": resolve("shared"), "@": resolve("src") } },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**", "tests/integration/**", "e2e/**"],
  },
});
