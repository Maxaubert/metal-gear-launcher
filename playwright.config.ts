import { defineConfig } from "@playwright/test";

// A single project drives the whole suite through Electron's own CDP connection
// (`_electron.launch` in e2e/hub.spec.ts), so no browser project or `devices` entry is needed.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1, // The desktop app intentionally owns a single-instance lock.
  retries: 0,
  use: {},
  projects: [{ name: "electron" }],
});
