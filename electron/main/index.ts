import { app, BrowserWindow, dialog, ipcMain, net, protocol } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { AssetRole } from "@shared/packs";
import { loadPacks, PACK_ORDER } from "@shared/packs";
import { ASSET_PROTOCOL } from "@shared/ipc";
import type { GameState, HubState, Result } from "@shared/ipc";
import "./log";
import { assetsDir, dataDir } from "./paths";
import { configSchema, readConfig, writeConfig } from "./config";
import { findSteamRoot, listLibraries } from "./steam/library";
import { resolveInstall } from "./steam/resolve";
import { extractGame, isStale, readManifest, readToolVersions } from "./extract/extractor";

protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
function err(error: string): Result<never> {
  return { ok: false, error };
}
function asError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1920, height: 1080, show: false, backgroundColor: "#000000",
    fullscreen: !process.env.HUB_WINDOWED, autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true, contextIsolation: true },
  });
  win.once("ready-to-show", () => win.show());
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
  return win;
}

async function buildState(): Promise<HubState> {
  const config = await readConfig();
  const steamRoot = await findSteamRoot(config.steamPath);
  const libraries = steamRoot ? await listLibraries(steamRoot) : [];
  const tools = await readToolVersions();
  const games: GameState[] = [];
  for (const pack of loadPacks()) {
    const install = steamRoot ? await resolveInstall(pack, libraries) : null;
    const manifest = await readManifest(pack.id);
    const assetUrls: Partial<Record<AssetRole, string>> = {};
    for (const [role, file] of Object.entries(manifest?.files ?? {})) {
      if (file) assetUrls[role as AssetRole] = `${ASSET_PROTOCOL}://${pack.id}/${file}`;
    }
    games.push({
      pack,
      installed: install !== null,
      installDir: install?.installDir,
      buildId: install?.buildId,
      assets: manifest ?? undefined,
      assetUrls,
      stale: install !== null && isStale(manifest, install, tools),
    });
  }
  return { steamPath: steamRoot, games };
}

app.whenReady().then(() => {
  protocol.handle(ASSET_PROTOCOL, (req) => {
    const u = new URL(req.url); // hub-asset://mgs3/mainVisual.png
    const file = join(assetsDir(u.hostname), decodeURIComponent(u.pathname.slice(1)));
    if (!file.startsWith(join(dataDir(), "assets"))) return new Response("forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  ipcMain.handle("hub:getState", async () => {
    try {
      return ok(await buildState());
    } catch (e) {
      return err(asError(e));
    }
  });

  ipcMain.handle("hub:extract", async (_e, arg) => {
    try {
      const target = z.union([z.literal("all"), z.enum(PACK_ORDER)]).parse(arg);
      const state = await buildState();
      for (const g of state.games) {
        if (target !== "all" && g.pack.id !== target) continue;
        if (!g.installed || !g.installDir || !g.buildId) continue;
        await extractGame(g.pack, { installDir: g.installDir, buildId: g.buildId }, (p) =>
          mainWindow?.webContents.send("hub:extract:progress", p),
        );
      }
      return ok(await buildState());
    } catch (e) {
      return err(asError(e));
    }
  });

  ipcMain.handle("hub:setSteamPath", async (_e, arg) => {
    try {
      const path = z.string().parse(arg);
      await writeConfig({ steamPath: path });
      return ok(await buildState());
    } catch (e) {
      return err(asError(e));
    }
  });

  ipcMain.handle("hub:config:get", async () => {
    try {
      return ok(await readConfig());
    } catch (e) {
      return err(asError(e));
    }
  });

  ipcMain.handle("hub:config:set", async (_e, arg) => {
    try {
      const patch = configSchema.partial().parse(arg);
      return ok(await writeConfig(patch));
    } catch (e) {
      return err(asError(e));
    }
  });

  ipcMain.handle("hub:pickFolder", async () => {
    try {
      if (!mainWindow) return err("no window");
      const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
      if (result.canceled || !result.filePaths[0]) return err("cancelled");
      return ok(result.filePaths[0]);
    } catch (e) {
      return err(asError(e));
    }
  });

  // Registered here as stubs so the preload bridge always resolves to a Result rather than
  // rejecting on a missing handler; Task 10 replaces both with the real launcher.
  ipcMain.handle("hub:launch", async () => err("not implemented"));
  ipcMain.handle("hub:quit", async () => err("not implemented"));

  mainWindow = createWindow();
});
app.on("window-all-closed", () => app.quit());
