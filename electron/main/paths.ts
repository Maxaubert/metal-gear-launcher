import { app } from "electron";
import { join } from "node:path";

export const dataDir = (): string => join(process.env.LOCALAPPDATA ?? app.getPath("appData"), "MGSMasterHub");
export const assetsDir = (gameId: string): string => join(dataDir(), "assets", gameId);
export const configFile = (): string => join(dataDir(), "config.json");
export const logFile = (): string => join(dataDir(), "logs", "hub.log");
