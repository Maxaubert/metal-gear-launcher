import { app } from "electron";
import { join } from "node:path";

// `HUB_DATA_DIR` overrides the whole hub data root for e2e tests, which need every read/write
// path (config, assets, launch log) confined to a throwaway temp directory instead of the
// real %LOCALAPPDATA%.
export const dataDir = (): string =>
  process.env.HUB_DATA_DIR || join(process.env.LOCALAPPDATA ?? app.getPath("appData"), "MGSMasterHub");
export const assetsDir = (gameId: string): string => join(dataDir(), "assets", gameId);
export const configFile = (): string => join(dataDir(), "config.json");
export const logFile = (): string => join(dataDir(), "logs", "hub.log");
