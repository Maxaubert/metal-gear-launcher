import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import { exec, spawn } from "node:child_process";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
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
import { launchGame } from "./launch/launcher";

const execAsync = promisify(exec);

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

// Polls `tasklist` for a process matching `filter` (a `/FI` clause such as `PID eq 1234` or
// `IMAGENAME eq mgs4.exe`) every 5s until it is gone, then resolves. `tasklist` prints
// "INFO: No tasks are running..." on no match rather than failing, so absence of that line
// means the process is still alive.
async function waitForExit(filter: string): Promise<void> {
  for (;;) {
    try {
      const { stdout } = await execAsync(`tasklist /FI "${filter}"`);
      if (/no tasks are running/i.test(stdout)) return;
    } catch {
      return; // tasklist itself failing means we can't confirm the process is alive
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
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

  ipcMain.handle("hub:launch", async (_e, arg) => {
    try {
      const { gameId, install: installOnly } = z
        .object({ gameId: z.enum(PACK_ORDER), install: z.boolean().optional() })
        .parse(arg);
      const pack = loadPacks().find((p) => p.id === gameId);
      if (!pack) return err(`unknown game: ${gameId}`);

      if (installOnly) {
        await shell.openExternal(`steam://install/${pack.steam.appId}`);
        return ok(undefined);
      }

      const config = await readConfig();
      const steamRoot = await findSteamRoot(config.steamPath);
      const libraries = steamRoot ? await listLibraries(steamRoot) : [];
      const install = steamRoot ? await resolveInstall(pack, libraries) : null;
      if (!install) return err("not installed");

      const result = await launchGame(pack, install, { spawn, openExternal: shell.openExternal });
      // Minimising a window created with fullscreen:true is a known rough edge on Windows: Electron
      // can leave a stuck black frame instead of behaving like a normal minimize. Drop out of
      // fullscreen first so the compositor gets a clean transition, then minimize; restore the
      // reverse way on exit.
      const wasFullScreen = mainWindow?.isFullScreen() ?? false;
      if (wasFullScreen) mainWindow?.setFullScreen(false);
      mainWindow?.minimize();
      const filter = result.via === "exe" && result.pid
        ? `PID eq ${result.pid}`
        : `IMAGENAME eq ${basename(pack.launch.exe)}`;
      void waitForExit(filter).then(() => {
        mainWindow?.restore();
        if (wasFullScreen) mainWindow?.setFullScreen(true);
        mainWindow?.focus();
      });
      return ok(undefined);
    } catch (e) {
      return err(asError(e));
    }
  });

  ipcMain.handle("hub:quit", async () => {
    app.quit();
    return ok(undefined);
  });

  mainWindow = createWindow();
});
app.on("window-all-closed", () => app.quit());
