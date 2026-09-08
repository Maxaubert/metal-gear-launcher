import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import { exec, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import type { AssetRole } from "@shared/packs";
import { loadPacks, PACK_ORDER } from "@shared/packs";
import { ASSET_PROTOCOL } from "@shared/ipc";
import type { GameState, HubState, Result } from "@shared/ipc";
import "./log";
import { parseCliGame, startGameFor } from "./cli";
import { assetsDir, dataDir } from "./paths";
import { configSchema, readConfig, writeConfig } from "./config";
import { MUSIC_PROTOCOL } from "../../shared/menuMusic";
import { ensureMenuMusicFolder, getMenuMusicLibrary, MUSIC_CONTENT_TYPES, resolveMenuMusicFile, validateMenuMusicSelection } from "./music/library";
import { findSteamRoot, listLibraries } from "./steam/library";
import { resolveInstall } from "./steam/resolve";
import { extractGame, isStale, readManifest, readToolVersions } from "./extract/extractor";
import { launchGame } from "./launch/launcher";
import { minimizeForLaunch, restoreAfterLaunch } from "./launch/windowTransition";
import { checkForUpdate } from "./update";
import { settingsGameId, settingsReadRequest, saveSettingsRequest } from "@shared/settings";
import { getGameSettings, saveGameSettings } from "./settings/service";
import { readMenuSounds } from "./music/sounds";
import { achievementsRequest } from "@shared/achievements";
import { getAchievements } from "./achievements/service";
import { getBonusLibrary } from "./bonus/library";
import { resolveBonusFile } from "./bonus/media";
import { bonusResponse } from "./bonus/response";
import { getBonusPresentation } from "./bonus/presentation";
import { getBonusPlaylist } from "./bonus/playlist";
import { bookPageRequest, bookRequest } from "@shared/books";
import { getBooksCatalog, openBook, getBookPage, saveBookProgress } from "./books";

const execAsync = promisify(exec);

// Preserve the Chromium profile and single-instance namespace across the product rename.
const profileDirectory = process.env.HUB_DATA_DIR
  ? join(process.env.HUB_DATA_DIR, "chromium") : join(app.getPath("appData"), "MGS Master Hub");
mkdirSync(profileDirectory, { recursive: true });
app.setPath("userData", profileDirectory);
app.setAppUserModelId("com.maxaubert.mgsmasterhub");

// `corsEnabled` is required for the CSS engine's CORS-fetch of `@font-face` sources (D1): without
// it, Chromium blocks the font request entirely and every string silently falls back to the
// Segoe/Arial chain instead of the extracted Rodin font.
protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: MUSIC_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: "hub-bonus", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// `.ttf`-named font assets are actually OpenType CFF (`OTTO` magic), not TrueType, per
// AssetStudioModCLI's real output - `font/otf` is the correct MIME either way.
const ASSET_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".wav": "audio/wav",
  ".ttf": "font/otf",
  ".otf": "font/otf",
  ".json": "application/json",
};

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
  // HUB_SHOOT (Task 14 step 9): a fixed 4K window instead of real fullscreen, so
  // `capturePage()` produces a stable, reproducible size independent of the display driving
  // this machine.
  const shootMode = Boolean(process.env.HUB_SHOOT);
  const win = new BrowserWindow({
    width: shootMode ? 3840 : 1920, height: shootMode ? 2160 : 1080,
    show: false, backgroundColor: "#000000",
    fullscreen: shootMode ? false : !process.env.HUB_WINDOWED,
    frame: shootMode ? false : true,
    useContentSize: shootMode,
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, "../preload/index.js"), sandbox: true, contextIsolation: true,
      autoplayPolicy: "no-user-gesture-required" },
  });
  win.once("ready-to-show", () => win.show());
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
  return win;
}

// HUB_SHOOT (Task 14 step 9): drives the hub through every game and Game Selection, capturing
// a screenshot of each for visual iteration against the reference art. Runs once, then quits.
async function runShootSequence(win: BrowserWindow, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  for (const id of PACK_ORDER) {
    win.webContents.send("hub:selectGame", id);
    await new Promise((resolve) => setTimeout(resolve, 900)); // let the 250ms crossfade settle
    const image = await win.webContents.capturePage();
    await writeFile(join(outDir, `${id}.png`), image.toPNG());
  }
  win.webContents.send("hub:selectionOpen");
  await new Promise((resolve) => setTimeout(resolve, 900));
  const selectionImage = await win.webContents.capturePage();
  await writeFile(join(outDir, "selection.png"), selectionImage.toPNG());
  app.quit();
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
    const revision = manifest ? (await stat(join(assetsDir(pack.id), "manifest.json"))).mtimeMs : 0;
    const assetUrls: Partial<Record<AssetRole, string>> = {};
    for (const [role, file] of Object.entries(manifest?.files ?? {})) {
      if (file) assetUrls[role as AssetRole] = `${ASSET_PROTOCOL}://${pack.id}/${file}?v=${revision}`;
    }
    games.push({
      pack,
      installed: install !== null,
      installDir: install?.installDir,
      buildId: install?.buildId,
      assets: manifest ?? undefined,
      assetUrls,
      stale: install !== null && isStale(manifest, install, tools, pack.assetRevision),
    });
  }
  const startGame = startGameFor(process.argv, config);
  return { steamPath: steamRoot, games, startGame };
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

// Only one hub window may run at a time: a second launch (e.g. from a Steam shortcut or a
// second `--game` invocation) hands its argv to the running instance instead of opening its
// own window. The real argv is sent as `additionalData` rather than relied on from the
// `argv` parameter Electron reconstructs for `second-instance`: Electron's own docs warn that
// reconstruction can reorder a space-separated `--game mgs3` away from its value (verified in
// this repo - see the task-11 report), while `additionalData` is passed through unmodified.
const gotSingleInstanceLock = app.requestSingleInstanceLock({ argv: process.argv });
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, _workingDirectory, additionalData) => {
    const forwardedArgv = Array.isArray((additionalData as { argv?: unknown } | null)?.argv)
      ? ((additionalData as { argv: string[] }).argv)
      : argv;
    const gameId = parseCliGame(forwardedArgv);
    if (gameId) mainWindow?.webContents.send("hub:selectGame", gameId);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle("hub-bonus", async request => {
      try {
        if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
        const { file, contentType } = await resolveBonusFile(request.url);
        return bonusResponse(request, file, contentType);
      } catch { return new Response("Bonus content is unavailable. Refresh the library.", { status: 404 }); }
    });
    ipcMain.handle("hub:bonus:get", async (_event, arg) => {
      try {
        z.undefined().parse(arg);
        const config = await readConfig();
        return ok(await getBonusLibrary(await findSteamRoot(config.steamPath), dataDir()));
      } catch (error) { return err(asError(error)); }
    });
    ipcMain.handle("hub:bonus:presentation", async (_event, arg) => {
      try {
        z.undefined().parse(arg);
        const config = await readConfig();
        return ok(await getBonusPresentation(await findSteamRoot(config.steamPath), dataDir()));
      } catch (error) { return err(asError(error)); }
    });
    ipcMain.handle("hub:books:catalog", async (_event, arg) => {
      try {
        z.undefined().parse(arg);
        const config = await readConfig();
        return ok(await getBooksCatalog(await findSteamRoot(config.steamPath), dataDir()));
      } catch (error) { return err(asError(error)); }
    });
    ipcMain.handle("hub:books:open", async (_event, arg) => {
      try {
        const request = bookRequest.parse(arg);
        const config = await readConfig();
        return ok(await openBook(await findSteamRoot(config.steamPath), dataDir(), request));
      } catch (error) { return err(asError(error)); }
    });
    ipcMain.handle("hub:books:page", async (_event, arg) => {
      try {
        const request = bookPageRequest.parse(arg);
        const config = await readConfig();
        return ok(await getBookPage(await findSteamRoot(config.steamPath), dataDir(), request));
      } catch (error) { return err(asError(error)); }
    });
    ipcMain.handle("hub:books:progress", async (_event, arg) => {
      try { await saveBookProgress(dataDir(), bookPageRequest.parse(arg)); return ok(undefined); }
      catch (error) { return err(asError(error)); }
    });
    ipcMain.handle("hub:bonus:playlist", async (_event, arg) => {
      try {
        z.undefined().parse(arg);
        const config = await readConfig();
        return ok(await getBonusPlaylist(dataDir(), await findSteamRoot(config.steamPath)));
      } catch (error) { return err(asError(error)); }
    });
    // Fired once at boot, not per-window: the renderer reads the result via `hub:getUpdate`
    // (already resolved or resolving by the time it asks, so no push/race to worry about).
    const updateCheck = checkForUpdate(app.getVersion());

    protocol.handle(MUSIC_PROTOCOL, async (req) => {
      try {
        const file = await resolveMenuMusicFile(dataDir(), req.url);
        return bonusResponse(req, file, MUSIC_CONTENT_TYPES[extname(file).toLowerCase()]!);
      } catch { return new Response("Music file is unavailable.", { status: 404 }); }
    });

    protocol.handle(ASSET_PROTOCOL, async (req) => {
      const u = new URL(req.url); // hub-asset://mgs3/mainVisual.png
      const file = join(assetsDir(u.hostname), decodeURIComponent(u.pathname.slice(1)));
      if (!file.startsWith(join(dataDir(), "assets"))) return new Response("forbidden", { status: 403 });
      const upstream = await net.fetch(pathToFileURL(file).toString());
      if (!upstream.ok || !upstream.body) return upstream;
      // The CSS engine's `@font-face` CORS-fetch (D1) needs both an explicit
      // `Access-Control-Allow-Origin` and a real font/image/audio content type on the response -
      // `net.fetch` on a bare `file://` URL supplies neither.
      const headers = new Headers(upstream.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Content-Type", ASSET_CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
      // Round 8: without this, Chromium's persistent disk cache (this session survives app
      // restarts) can serve a stale response for the same `hub-asset://<id>/<file>` URL after the
      // file on disk has changed underneath it - re-extraction (a pack edit, a tool upgrade, or
      // the user's own "Retry extraction") writes a new file at the same path/URL, and the asset
      // is meant to always reflect whatever is on disk right now.
      headers.set("Cache-Control", "no-store");
      return new Response(upstream.body, { status: upstream.status, headers });
    });

    ipcMain.handle("hub:achievements:get", async (_event, arg) => {
      try {
        const request = achievementsRequest.parse(arg);
        const pack = loadPacks().find(pack => pack.id === request.gameId)!;
        const config = await readConfig();
        const steamRoot = await findSteamRoot(config.steamPath);
        return ok(await getAchievements(pack, steamRoot, dataDir(), request.refresh));
      } catch (error) { return err(asError(error)); }
    });
    ipcMain.handle("hub:getState", async () => {
      try {
        return ok(await buildState());
      } catch (e) {
        return err(asError(e));
      }
    });

    ipcMain.handle("hub:sounds:get", async (_event, arg) => {
      try {
        z.undefined().parse(arg);
        return ok(await readMenuSounds(dataDir()));
      } catch (e) { return err(asError(e)); }
    });

    ipcMain.handle("hub:settings:get", async (_event, arg) => {
      const parsed = settingsReadRequest.safeParse(arg);
      if (!parsed.success) return err("Invalid settings request.");
      try {
        const state = await buildState();
        const game = state.games.find((game) => game.pack.id === parsed.data.gameId);
        if (!game?.installed || !game.installDir) return err("This game is not installed.");
        return ok(await getGameSettings(parsed.data.gameId, game.installDir, parsed.data.accountId));
      } catch (error) { return err(asError(error)); }
    });

    ipcMain.handle("hub:settings:save", async (_event, arg) => {
      const parsed = saveSettingsRequest.safeParse(arg);
      if (!parsed.success) return err("Invalid settings changes.");
      try {
        const state = await buildState();
        const game = state.games.find((game) => game.pack.id === parsed.data.gameId);
        if (!game?.installed || !game.installDir) return err("This game is not installed.");
        return ok(await saveGameSettings(parsed.data, game.installDir, dataDir()));
      } catch (error) { return err(asError(error)); }
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
        const patch = configSchema.omit({ menuMusic: true, lastLaunchedGame: true }).partial().strict().parse(arg);
        return ok(await writeConfig(patch));
      } catch (e) {
        return err(asError(e));
      }
    });

    ipcMain.handle("hub:music:save", async (_e, arg) => {
      try {
        const { gameId, themeId } = await validateMenuMusicSelection(dataDir(), arg);
        return ok(await writeConfig({ menuMusic: { [gameId]: themeId } }));
      } catch (e) { return err(asError(e)); }
    });

    ipcMain.handle("hub:music:get", async (_e, arg) => {
      try { return ok(await getMenuMusicLibrary(dataDir(), settingsGameId.parse(arg))); }
      catch (e) { return err(asError(e)); }
    });

    ipcMain.handle("hub:music:openFolder", async (_e, arg) => {
      try {
        const folder = await ensureMenuMusicFolder(dataDir(), settingsGameId.parse(arg));
        const error = await shell.openPath(folder);
        return error ? err(error) : ok(undefined);
      } catch (e) { return err(asError(e)); }
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
        await writeConfig({ lastLaunchedGame: gameId });
        const wasFullScreen = mainWindow ? minimizeForLaunch(mainWindow) : false;
        const filter = result.via === "exe" && result.pid
          ? `PID eq ${result.pid}`
          : `IMAGENAME eq ${basename(pack.launch.exe)}`;
        void waitForExit(filter).then(() => {
          if (mainWindow) restoreAfterLaunch(mainWindow, wasFullScreen);
        });
        return ok(undefined);
      } catch (e) {
        return err(asError(e));
      }
    });

    ipcMain.handle("hub:ready", async () => {
      try {
        const shootDir = process.env.HUB_SHOOT;
        if (shootDir && mainWindow) void runShootSequence(mainWindow, shootDir);
        return ok(undefined);
      } catch (e) {
        return err(asError(e));
      }
    });

    ipcMain.handle("hub:quit", async () => {
      app.quit();
      return ok(undefined);
    });

    ipcMain.handle("hub:getUpdate", async () => {
      try {
        return ok(await updateCheck);
      } catch (e) {
        return err(asError(e));
      }
    });

    ipcMain.handle("hub:openUpdate", async () => {
      try {
        const info = await updateCheck;
        if (!info) return err("no update available");
        await shell.openExternal(info.url);
        return ok(undefined);
      } catch (e) {
        return err(asError(e));
      }
    });

    mainWindow = createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
