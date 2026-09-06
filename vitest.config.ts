import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// `npm test` skips integration tests by default; `npm run test:integration` sets
// HUB_INTEGRATION=1 and needs them un-excluded to actually run.
const skipIntegration = process.env.HUB_INTEGRATION !== "1";

export default defineConfig({
  resolve: { alias: { "@shared": resolve("shared"), "@": resolve("src") } },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/out/**", "e2e/**", ...(skipIntegration ? ["tests/integration/**"] : [])],
  },
});
