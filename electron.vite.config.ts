import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { "@shared": resolve("shared") } },
    build: { lib: { entry: resolve("electron/main/index.ts") } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { "@shared": resolve("shared") } },
    build: { lib: { entry: resolve("electron/preload/index.ts") } },
  },
  renderer: {
    root: resolve("."),
    plugins: [react()],
    resolve: { alias: { "@shared": resolve("shared"), "@": resolve("src") } },
    build: { rollupOptions: { input: resolve("index.html") } },
  },
});
